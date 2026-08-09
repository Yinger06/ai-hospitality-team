import type { AgentId, ModelTask, ModelTier, Severity } from '../../src/domain/types.js'

export interface ModelChoice {
  model: string
  tier: ModelTier
  reason: string
}

const economyModel = process.env.AI_ECONOMY_MODEL ?? 'gpt-5.4-mini'
const reasoningModel = process.env.AI_REASONING_MODEL ?? 'gpt-5.6-terra'

export const selectModel = (
  task: ModelTask,
  agentId: AgentId,
  options: { specialistCount?: number; severity?: Severity } = {},
): ModelChoice => {
  const complexSynthesis = task === 'synthesis' && (
    (options.specialistCount ?? 0) >= 3 || ['high', 'urgent'].includes(options.severity ?? 'low')
  )

  if (complexSynthesis) {
    return {
      model: reasoningModel,
      tier: 'reasoning',
      reason: 'Complex multi-agent or high-risk synthesis needs stronger conflict and safety handling.',
    }
  }

  return {
    model: economyModel,
    tier: 'economy',
    reason: task === 'routing'
      ? 'Fast structured interpretation is sufficient for selective routing.'
      : `${agentId} is handling a bounded task with grounded context.`,
  }
}
