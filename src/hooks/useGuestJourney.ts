import { useEffect, useMemo, useState } from 'react'
import { demoJourney, emptyMemory, sampleGuest, sampleProperty } from '../data/sampleData'
import type {
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
import { orchestrate, resolveLatestIssue } from '../orchestration/headButler'
import { routeMessage } from '../orchestration/router'
import { simulatedMessageAdapter } from '../services/messageAdapter'

// Legacy storage key retained for backward compatibility.
// Official product name: AI Hospitality Team.
// Do not rename this key without a backward-compatible migration.
const STORAGE_KEY = 'stayline-demo-v1'
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

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
    body: 'Hi Maya — thank you for choosing Primrose House. Mia and the house team are looking forward to welcoming you and Leo to London. The blue door is already looking forward to your arrival.',
    timestamp: 'Just now',
    stage: 'booking-confirmed',
    label: 'Automatic welcome',
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
    const preview = routeMessage(context)
    setResult(null)
    setActivations(preview.activations)
    await wait(420)
    setActivations((current) =>
      current.map((activation) =>
        activation.agentId === 'head-butler'
          ? { ...activation, status: 'done', result: `Found ${preview.intents.length} intent${preview.intents.length === 1 ? '' : 's'}` }
          : activation.status === 'queued'
            ? { ...activation, status: 'working' }
            : activation,
      ),
    )
    await wait(680)

    const orchestration = orchestrate(context)
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
    setIsProcessing(false)
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
    processEvent,
    property,
    resetDemo,
    result,
    runNextStep,
    runStep,
    stage,
  }
}
