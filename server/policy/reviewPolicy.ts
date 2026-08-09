import type { AgentContext } from '../../src/domain/types.js'

export const unresolvedReviewPolicy = (context: AgentContext) => {
  const unresolvedIssue = context.memory.issues.find((issue) => issue.status !== 'resolved')
  const applies = context.stage === 'review-follow-up' && context.eventType === 'host-action' && unresolvedIssue
  if (!applies) return null

  return {
    rule: 'review-request-suppressed-unresolved-issue',
    response: `We’re holding off on a review request while the reported ${unresolvedIssue.summary.toLowerCase()} issue remains unresolved. ${context.property.hostName} needs to confirm recovery first.`,
  }
}
