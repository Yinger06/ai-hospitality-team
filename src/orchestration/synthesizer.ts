import type { AgentContext, AgentContribution } from '../domain/types'
import { styleClosing, unique } from '../agents/utils'

const synthesisOrder: Record<AgentContribution['agentId'], number> = {
  'head-butler': 0,
  'guest-experience': 1,
  'problem-solver': 2,
  'front-desk': 3,
  'local-guide': 4,
  'guest-memory': 5,
}

const cleanParts = (contributions: AgentContribution[]) => {
  const ordered = [...contributions].sort(
    (left, right) => synthesisOrder[left.agentId] - synthesisOrder[right.agentId],
  )
  return unique(ordered.flatMap((contribution) => contribution.responseParts).filter(Boolean))
}

export const synthesiseResponse = (
  context: AgentContext,
  contributions: AgentContribution[],
): string => {
  const parts = cleanParts(contributions)
  if (!parts.length) {
    return `Thanks for the note, ${context.guest.name.split(' ')[0]}. ${styleClosing(context.property.personality)}`
  }

  const hasProblem = contributions.some((item) => item.intent === 'problem')
  const hasLocal = contributions.some((item) => item.intent === 'local-discovery')
  const response = parts.join(' ')

  if (hasProblem && hasLocal) {
    return `${response} I’ll keep the practical fix moving while you enjoy planning tomorrow.`
  }

  return response
}
