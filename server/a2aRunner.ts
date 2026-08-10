import type { AgentContext } from '../src/domain/types.js'
import { stayStages } from '../src/domain/types.js'
import { orchestrateWithAi } from './orchestration/headButlerAi.js'
import { getModelRuntime } from './runtime/runtimeFactory.js'

const MAX_INPUT_BYTES = 100_000
const eventTypes: AgentContext['eventType'][] = [
  'guest-message', 'booking-event', 'host-action', 'review-event',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readStdin = async () => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_INPUT_BYTES) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const validateContext = (value: unknown): AgentContext => {
  if (!isRecord(value) || typeof value.message !== 'string' || !value.message.trim()) {
    throw new Error('A non-empty guest message is required')
  }
  if (!stayStages.includes(value.stage as AgentContext['stage'])) throw new Error('Invalid stay stage')
  if (!eventTypes.includes(value.eventType as AgentContext['eventType'])) throw new Error('Invalid event type')
  if (!isRecord(value.guest) || !isRecord(value.property) || !isRecord(value.memory)) {
    throw new Error('Guest, property, and memory context are required')
  }
  if (
    typeof value.guest.id !== 'string' ||
    typeof value.guest.bookingCode !== 'string' ||
    typeof value.property.id !== 'string'
  ) {
    throw new Error('Memory scope identifiers are required')
  }
  return value as unknown as AgentContext
}

const main = async () => {
  const input = await readStdin()
  const context = validateContext(JSON.parse(input) as unknown)
  const result = await orchestrateWithAi(context, { runtime: getModelRuntime() })
  process.stdout.write(JSON.stringify(result))
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Orchestration failed'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
