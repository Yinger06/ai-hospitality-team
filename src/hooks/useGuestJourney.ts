import { useEffect, useMemo, useState } from 'react'
import { demoJourney, emptyMemory, sampleGuest, sampleProperty } from '../data/sampleData'
import type {
  AgentId,
  AgentActivation,
  AgentContext,
  ChatMessage,
  DemoStep,
  GuestMemory,
  OrchestrationResult,
  Personality,
  Property,
  StayStage,
} from '../domain/types'
import { resolveLatestIssue } from '../orchestration/headButler'
import { simulatedMessageAdapter } from '../services/messageAdapter'
import { OrchestrationApiError, runOrchestration } from '../services/orchestrationApi'

// Legacy storage key retained for backward compatibility.
// Official product name: AI Hospitality Team.
// Do not rename this key without a backward-compatible migration.
const STORAGE_KEY = 'stayline-demo-v1'
const agentTasks: Record<AgentId, string> = {
  'head-butler': 'Interpret context and select only relevant specialists',
  'guest-memory': 'Waiting for Head Butler selection',
  'front-desk': 'Waiting for Head Butler selection',
  'guest-experience': 'Waiting for Head Butler selection',
  'local-guide': 'Waiting for Head Butler selection',
  'problem-solver': 'Waiting for Head Butler selection',
}

const startingActivations = (): AgentActivation[] => (
  Object.keys(agentTasks) as AgentId[]
).map((agentId) => ({
  agentId,
  status: agentId === 'head-butler' ? 'working' : 'idle',
  task: agentTasks[agentId],
}))

const initialMessages: ChatMessage[] = [
  {
    id: 'booking-event',
    sender: 'system',
    body: 'Booking PH-2841 confirmed · 14–18 August · 2 guests',
    timestamp: 'Just now',
    stage: 'booking-confirmed',
    label: 'Direct booking',
  },
  {
    id: 'booking-welcome',
    sender: 'host',
    body: 'Hi Maya — thank you for choosing Primrose House. The Head Butler and house team are looking forward to welcoming you and Leo to London. The blue door is already looking forward to your arrival.',
    timestamp: 'Just now',
    stage: 'booking-confirmed',
    label: 'Sample welcome · fixture',
  },
]

interface PersistedState {
  stage: StayStage
  memory: GuestMemory
  messages: ChatMessage[]
  demoIndex: number
  personality: Personality
}

const readPersistedState = (): PersistedState | null => {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY)
    return value ? (JSON.parse(value) as PersistedState) : null
  } catch {
    return null
  }
}

export const useGuestJourney = () => {
  const persisted = useMemo(readPersistedState, [])
  const [stage, setStage] = useState<StayStage>(persisted?.stage ?? 'booking-confirmed')
  const [memory, setMemory] = useState<GuestMemory>(persisted?.memory ?? emptyMemory)
  const [messages, setMessages] = useState<ChatMessage[]>(persisted?.messages ?? initialMessages)
  const [demoIndex, setDemoIndex] = useState(persisted?.demoIndex ?? 1)
  const [property, setProperty] = useState<Property>({
    ...sampleProperty,
    personality: persisted?.personality ?? sampleProperty.personality,
  })
  const [activations, setActivations] = useState<AgentActivation[]>([])
  const [result, setResult] = useState<OrchestrationResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [orchestrationError, setOrchestrationError] = useState<string | null>(null)

  useEffect(() => {
    const payload: PersistedState = {
      stage,
      memory,
      messages,
      demoIndex,
      personality: property.personality,
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [demoIndex, memory, messages, property.personality, stage])

  const processEvent = async (
    body: string,
    nextStage: StayStage = stage,
    eventType: AgentContext['eventType'] = 'guest-message',
    source: 'demo' | 'manual' = 'manual',
  ) => {
    if (!body.trim() || isProcessing) return
    setIsProcessing(true)
    setOrchestrationError(null)
    setStage(nextStage)

    let currentMemory = memory
    if (eventType === 'host-action' && nextStage === 'problem-resolution') {
      currentMemory = resolveLatestIssue(memory, body)
      setMemory(currentMemory)
    }

    const incoming = await simulatedMessageAdapter.receive({ body, stage: nextStage, source })
    const now = new Date()
    const inboundMessage: ChatMessage = {
      id: `in-${now.getTime()}`,
      sender: eventType === 'guest-message' || eventType === 'review-event' ? 'guest' : 'system',
      body: incoming.body,
      timestamp: 'Just now',
      stage: nextStage,
      label:
        eventType === 'booking-event'
          ? 'Booking event'
          : eventType === 'host-action'
            ? 'Host update'
            : eventType === 'review-event'
              ? 'Public review · 5 stars'
              : undefined,
    }
    setMessages((current) => [...current, inboundMessage])

    const context: AgentContext = {
      message: incoming.body,
      stage: nextStage,
      guest: sampleGuest,
      property,
      memory: currentMemory,
      now: now.toISOString(),
      eventType,
    }
    setResult(null)
    setActivations(startingActivations())

    try {
      const orchestration = await runOrchestration(context, (event) => {
        if (event.type === 'route') setActivations(event.decision.activations)
        if (event.type === 'agent-start') {
          setActivations((current) => current.map((activation) =>
            activation.agentId === event.agentId
              ? { ...activation, status: 'working' }
              : activation))
        }
        if (event.type === 'agent-done') {
          setActivations((current) => current.map((activation) =>
            activation.agentId === event.activation.agentId ? event.activation : activation))
        }
      })
      setResult(orchestration)
      setMemory(orchestration.memory)
      setActivations(orchestration.decision.activations)

      const outbound: ChatMessage = {
        id: `out-${now.getTime()}`,
        sender: 'host',
        body: orchestration.finalResponse,
        timestamp: 'Just now',
        stage: nextStage,
        traceId: orchestration.decision.traceId,
      }
      await simulatedMessageAdapter.send(outbound)
      setMessages((current) => [...current, outbound])
    } catch (error) {
      const message = error instanceof OrchestrationApiError
        ? error.message
        : 'AI orchestration is temporarily unavailable.'
      setOrchestrationError(message)
      setActivations((current) => current.map((activation) =>
        activation.status === 'working' || activation.status === 'queued'
          ? { ...activation, status: 'failed', result: 'No model result; human review required' }
          : activation))
      const safeHandoff: ChatMessage = {
        id: `out-${now.getTime()}`,
        sender: 'host',
        body: `I’m sorry, ${sampleGuest.name.split(' ')[0]} — I can’t safely complete that request right now. I’m asking ${property.hostName}, your host, to review your message. If this is urgent, please call ${property.emergencyPhone}.`,
        timestamp: 'Just now',
        stage: nextStage,
        label: 'Human handoff required',
      }
      setMessages((current) => [...current, safeHandoff])
    } finally {
      setIsProcessing(false)
    }
  }

  const runStep = async (step: DemoStep, index: number) => {
    const typeMap: Record<DemoStep['kind'], AgentContext['eventType']> = {
      guest: 'guest-message',
      booking: 'booking-event',
      host: 'host-action',
      review: 'review-event',
    }
    await processEvent(step.message, step.stage, typeMap[step.kind], 'demo')
    setDemoIndex(Math.min(index + 1, demoJourney.length))
  }

  const runNextStep = () => {
    const step = demoJourney[demoIndex]
    if (step) void runStep(step, demoIndex)
  }

  const resetDemo = () => {
    window.sessionStorage.removeItem(STORAGE_KEY)
    setStage('booking-confirmed')
    setMemory(emptyMemory)
    setMessages(initialMessages)
    setDemoIndex(1)
    setProperty(sampleProperty)
    setActivations([])
    setResult(null)
    setIsProcessing(false)
    setOrchestrationError(null)
  }

  const changePersonality = (personality: Personality) => {
    setProperty((current) => ({ ...current, personality }))
  }

  return {
    activations,
    changePersonality,
    demoIndex,
    isProcessing,
    memory,
    messages,
    orchestrationError,
    processEvent,
    property,
    resetDemo,
    result,
    runNextStep,
    runStep,
    stage,
  }
}
