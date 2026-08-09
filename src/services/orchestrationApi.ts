import type { AgentContext, OrchestrationResult, OrchestrationStreamEvent } from '../domain/types'

export class OrchestrationApiError extends Error {
  constructor(
    message: string,
    readonly code = 'orchestration_failed',
    readonly retryable = true,
  ) {
    super(message)
    this.name = 'OrchestrationApiError'
  }
}

const isStreamEvent = (value: unknown): value is OrchestrationStreamEvent =>
  typeof value === 'object' && value !== null && 'type' in value

export const runOrchestration = async (
  context: AgentContext,
  onEvent: (event: OrchestrationStreamEvent) => void,
): Promise<OrchestrationResult> => {
  const response = await fetch('/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: { code?: string; message?: string; retryable?: boolean }
    } | null
    throw new OrchestrationApiError(
      payload?.error?.message ?? `Orchestration request failed with status ${response.status}.`,
      payload?.error?.code,
      payload?.error?.retryable,
    )
  }
  if (!response.body) throw new OrchestrationApiError('The orchestration stream was unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: OrchestrationResult | undefined

  const consumeLine = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as unknown
    if (!isStreamEvent(event)) throw new OrchestrationApiError('The orchestration stream was malformed.')
    onEvent(event)
    if (event.type === 'final') finalResult = event.result
    if (event.type === 'error') {
      throw new OrchestrationApiError(event.error.message, event.error.code, event.error.retryable)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(consumeLine)
    if (done) break
  }
  consumeLine(buffer)

  if (!finalResult) throw new OrchestrationApiError('The orchestration stream ended before a final response.')
  return finalResult
}
