import { agentRegistry } from '../agents/registry'
import { mergeMemory } from '../agents/utils'
import type { AgentContext, GuestMemory, OrchestrationResult } from '../domain/types'
import { routeMessage } from './router'
import { synthesiseResponse } from './synthesizer'

export const orchestrate = (context: AgentContext): OrchestrationResult => {
  const decision = routeMessage(context)
  const selected = decision.activations.filter(
    (activation) => activation.agentId !== 'head-butler' && activation.status !== 'skipped',
  )

  const contributions = selected.flatMap((activation) => {
    const agent = agentRegistry[activation.agentId as keyof typeof agentRegistry]
    const contribution = agent.run(context, decision.intents)
    return contribution ? [contribution] : []
  })

  let memory: GuestMemory = context.memory
  contributions.forEach((contribution) => {
    if (contribution.memoryPatch) memory = mergeMemory(memory, contribution.memoryPatch)
    if (contribution.issue) {
      memory = { ...memory, issues: [...memory.issues, contribution.issue] }
    }
  })

  decision.activations = decision.activations.map((activation) => {
    if (activation.agentId === 'head-butler') {
      return { ...activation, status: 'done', result: `Routed ${decision.intents.join(', ')}` }
    }
    if (activation.status === 'skipped') return activation
    const result = contributions.find((item) => item.agentId === activation.agentId)
    return {
      ...activation,
      status: 'done',
      result: result?.summary ?? 'No response needed',
    }
  })

  return {
    decision,
    contributions,
    finalResponse: synthesiseResponse({ ...context, memory }, contributions),
    memory,
    escalation: contributions.find((item) => item.escalation)?.escalation,
  }
}

export const resolveLatestIssue = (memory: GuestMemory, resolution: string): GuestMemory => {
  let lastOpenIndex = -1
  for (let index = memory.issues.length - 1; index >= 0; index -= 1) {
    if (memory.issues[index].status !== 'resolved') {
      lastOpenIndex = index
      break
    }
  }
  if (lastOpenIndex < 0) return memory

  return {
    ...memory,
    issues: memory.issues.map((issue, index) =>
      index === lastOpenIndex
        ? { ...issue, status: 'resolved' as const, resolution }
        : issue,
    ),
  }
}
