import type { AgentId, ModelTask, ModelTier, RuntimeMode } from '../../src/domain/types.js'

export interface ModelUsage {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
}

export interface ModelRequest<T> {
  task: ModelTask
  agentId: AgentId
  model: string
  tier: ModelTier
  reason: string
  systemPrompt: string
  input: unknown
  schema: Record<string, unknown>
  validate: (value: unknown) => T
  timeoutMs?: number
}

export interface ModelResponse<T> {
  data: T
  durationMs: number
  usage: ModelUsage
}

export interface ModelRuntime {
  readonly mode: RuntimeMode
  run<T>(request: ModelRequest<T>): Promise<ModelResponse<T>>
}

export class ModelRuntimeError extends Error {
  readonly code: 'unavailable' | 'timeout' | 'malformed-output'
  readonly retryable: boolean

  constructor(
    code: ModelRuntimeError['code'],
    message: string,
    retryable = true,
  ) {
    super(message)
    this.name = 'ModelRuntimeError'
    this.code = code
    this.retryable = retryable
  }
}
