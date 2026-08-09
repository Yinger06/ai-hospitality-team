import type { AgentActivation, AgentContext, AgentId, Intent, RouteDecision } from '../domain/types'
import { detectSentiment, includesAny } from '../agents/utils'

const specialistOrder: Exclude<AgentId, 'head-butler'>[] = [
  'guest-memory',
  'front-desk',
  'guest-experience',
  'local-guide',
  'problem-solver',
]

const agentTasks: Record<AgentId, string> = {
  'head-butler': 'Understand context and coordinate the team',
  'guest-memory': 'Save useful details for later in the stay',
  'front-desk': 'Prepare practical stay information',
  'guest-experience': 'Manage tone, care, farewell, and reviews',
  'local-guide': 'Personalise local recommendations',
  'problem-solver': 'Assess the issue and choose the next action',
}

export const detectIntents = (context: AgentContext): Intent[] => {
  const message = context.message.toLowerCase()
  const intents = new Set<Intent>()

  if (
    includesAny(message, [
      'prefer', 'planning', 'going to', 'tomorrow', 'visited', 'museum', 'greenwich',
      'leo', 'vegetarian', 'allergy', 'bags', 'heathrow',
    ])
  ) intents.add('memory-update')

  if (
    includesAny(message, [
      'check-in', 'outside', 'door', 'get in', 'key', 'keys', 'wi-fi', 'wifi',
      'password', 'bags', 'luggage', 'facility', 'address',
    ]) || context.eventType === 'booking-event'
  ) intents.add('practical-stay')

  if (
    includesAny(message, ['recommend', 'restaurant', 'lunch', 'dinner', 'greenwich', 'museum', 'transport', 'market']) &&
    !context.message.toLowerCase().startsWith('booking')
  ) intents.add('local-discovery')

  if (includesAny(message, ['cold', 'broken', 'not working', 'problem', 'locked out', 'smoke', 'flood', 'heating'])) {
    intents.add('problem')
  }

  if (
    includesAny(message, ['wonderful', 'lovely', 'thank', 'good stay', 'perfect']) ||
    context.eventType === 'booking-event' ||
    context.eventType === 'host-action' ||
    context.eventType === 'review-event'
  ) intents.add('relationship')

  if (context.stage === 'check-out' || includesAny(message, ['check-out', 'checkout', 'leave the keys', 'departure'])) {
    intents.add('checkout')
  }

  if (context.stage === 'review-follow-up' || context.eventType === 'review-event') intents.add('review')
  if (!intents.size) intents.add('relationship')

  return [...intents]
}

const isRelevant = (agentId: Exclude<AgentId, 'head-butler'>, intents: Intent[]) => {
  if (agentId === 'guest-memory') return intents.includes('memory-update')
  if (agentId === 'front-desk') return intents.some((intent) => ['practical-stay', 'checkout'].includes(intent))
  if (agentId === 'guest-experience') return intents.some((intent) => ['relationship', 'checkout', 'review'].includes(intent))
  if (agentId === 'local-guide') return intents.includes('local-discovery')
  return intents.includes('problem')
}

export const routeMessage = (context: AgentContext): RouteDecision => {
  const intents = detectIntents(context)
  const activeNames = specialistOrder.filter((id) => isRelevant(id, intents))
  const activations: AgentActivation[] = [
    {
      agentId: 'head-butler',
      status: 'working',
      task: agentTasks['head-butler'],
    },
    ...specialistOrder.map((agentId) => ({
      agentId,
      status: isRelevant(agentId, intents) ? ('queued' as const) : ('skipped' as const),
      task: agentTasks[agentId],
    })),
  ]

  return {
    traceId: `trace-${Date.now()}`,
    intents,
    sentiment: detectSentiment(context.message),
    severity: intents.includes('problem') ? 'medium' : 'low',
    rationale: `${intents.length} intent${intents.length === 1 ? '' : 's'} found; activating ${activeNames.length} relevant specialist${activeNames.length === 1 ? '' : 's'}.`,
    activations,
  }
}
