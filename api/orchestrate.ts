import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentContext, Intent, OrchestrationResult, OrchestrationStreamEvent } from '../src/domain/types.js'
import { stayStages } from '../src/domain/types.js'

export const maxDuration = 300

const MAX_BODY_BYTES = 64 * 1024
const MAX_MESSAGE_CHARACTERS = 2_000
const DEFAULT_RATE_LIMIT = 12
const DEFAULT_RATE_WINDOW_MS = 15 * 60_000
const DEFAULT_DAILY_LIMIT = 40
const DEFAULT_MAX_CONCURRENT = 2
const MAX_RATE_BUCKETS = 1_000
const eventTypes: AgentContext['eventType'][] = [
  'guest-message', 'booking-event', 'host-action', 'review-event',
]

interface RateBucket {
  windowStartedAt: number
  windowCount: number
  dayStartedAt: number
  dayCount: number
}

const rateBuckets = new Map<string, RateBucket>()
let activeRequests = 0

class BodyTooLargeError extends Error {}

const writeJson = (response: ServerResponse, status: number, value: unknown, extraHeaders = {}) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  })
  response.end(JSON.stringify(value))
}

const writeNdjson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(`${JSON.stringify(value)}\n`)
}

const readBody = async (request: IncomingMessage) => {
  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new BodyTooLargeError('Request body is too large')
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError('Request body is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const getA2aRpcUrl = () => {
  const url = new URL(getRequiredEnv('MANYFOLD_A2A_RPC_URL'))
  if (url.protocol !== 'https:' || url.hostname !== 'api.manyfold.ai') {
    throw new Error('MANYFOLD_A2A_RPC_URL must be an HTTPS api.manyfold.ai endpoint')
  }
  return url.toString()
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isBoundedValue = (value: unknown, depth = 0): boolean => {
  if (depth > 7) return false
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return true
  if (typeof value === 'string') return value.length <= 4_000
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => isBoundedValue(item, depth + 1))
  if (!isRecord(value) || Object.keys(value).length > 50) return false
  return Object.values(value).every((item) => isBoundedValue(item, depth + 1))
}

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === 'string' && (value[key] as string).trim().length > 0

export const validateRequestContext = (value: unknown): value is AgentContext => {
  if (!isRecord(value) || !isBoundedValue(value)) return false
  if (!hasString(value, 'message') || (value.message as string).length > MAX_MESSAGE_CHARACTERS) return false
  if (!stayStages.includes(value.stage as AgentContext['stage'])) return false
  if (!eventTypes.includes(value.eventType as AgentContext['eventType'])) return false
  if (!hasString(value, 'now')) return false

  const guest = value.guest
  const property = value.property
  const memory = value.memory
  if (!isRecord(guest) || !isRecord(property) || !isRecord(memory)) return false
  if (!hasString(guest, 'id') || !hasString(guest, 'bookingCode') || !hasString(guest, 'name')) return false
  if (!hasString(property, 'id') || !hasString(property, 'name') || !hasString(property, 'hostName')) return false
  if (!isRecord(property.knowledge)) return false

  const memoryArrays = [
    'preferences', 'visitedPlaces', 'futurePlans', 'importantRequests',
    'conversationFacts', 'sentimentHistory', 'issues',
  ]
  return memoryArrays.every((key) => Array.isArray(memory[key]))
}

const textFromParts = (parts: unknown) => {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.kind === 'text')
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('')
}

const textFromCompletedTask = (result: Record<string, unknown>) => {
  if (Array.isArray(result.artifacts)) {
    for (const artifact of [...result.artifacts].reverse()) {
      if (!isRecord(artifact)) continue
      const text = textFromParts(artifact.parts)
      if (text) return text
    }
  }
  if (isRecord(result.status) && isRecord(result.status.message)) {
    return textFromParts(result.status.message.parts)
  }
  return ''
}

const parseAgentJson = (value: string) => {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) return null
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    return null
  }
}

const buildPlainTextResult = (context: AgentContext, finalResponse: string): OrchestrationResult => {
  const message = context.message.toLowerCase()
  const text = finalResponse.trim() || context.message
  const practicalStay = context.stage === 'check-out' || /check-?out|key|wifi|wi-fi|door|doorway|luggage|arrival|check-?in/.test(message)
  const localDiscovery = /greenwich|museum|restaurant|lunch|dinner|transport|market/.test(message)
  const problem = /cold|broken|not working|problem|heating|smoke|flood|locked out/.test(message)
  const checkout = context.stage === 'check-out' || /check-?out|checkout|keys|departure/.test(message)
  const review = context.stage === 'review-follow-up' || context.eventType === 'review-event'
  const relationship = !practicalStay && !localDiscovery && !problem && !checkout && !review
  const intents: Intent[] = [
    practicalStay ? 'practical-stay' : null,
    localDiscovery ? 'local-discovery' : null,
    problem ? 'problem' : null,
    relationship ? 'relationship' : null,
    checkout ? 'checkout' : null,
    review ? 'review' : null,
  ].filter((intent): intent is Intent => intent !== null)
  const selectedAgent = problem
    ? 'problem-solver'
    : localDiscovery
      ? 'local-guide'
      : review || relationship
        ? 'guest-experience'
        : 'front-desk'

  return {
    decision: {
      traceId: `trace-${randomUUID()}`,
      intents: intents.length ? intents : ['relationship'],
      sentiment: 'neutral',
      severity: problem ? 'medium' : 'low',
      rationale: 'Plain-text A2A output was translated into the frontend orchestration contract.',
      activations: [
        {
          agentId: 'head-butler',
          status: 'done',
          task: 'Interpret context and select only relevant specialists',
          result: 'Selected 1 specialist',
        },
        {
          agentId: 'guest-memory',
          status: 'skipped',
          task: 'Validate and save useful guest context',
        },
        {
          agentId: 'front-desk',
          status: selectedAgent === 'front-desk' ? 'done' : 'skipped',
          task: 'Answer from verified property information',
          selectedBecause: practicalStay || checkout ? 'The request needs practical stay information.' : undefined,
          result: selectedAgent === 'front-desk' ? text : undefined,
        },
        {
          agentId: 'guest-experience',
          status: selectedAgent === 'guest-experience' ? 'done' : 'skipped',
          task: 'Shape contextual hospitality care',
          selectedBecause: review || relationship ? 'The message needs hospitality tone and relationship care.' : undefined,
          result: selectedAgent === 'guest-experience' ? text : undefined,
        },
        {
          agentId: 'local-guide',
          status: selectedAgent === 'local-guide' ? 'done' : 'skipped',
          task: 'Build a grounded local suggestion',
          selectedBecause: localDiscovery ? 'The request asks for a local recommendation.' : undefined,
          result: selectedAgent === 'local-guide' ? text : undefined,
        },
        {
          agentId: 'problem-solver',
          status: selectedAgent === 'problem-solver' ? 'done' : 'skipped',
          task: 'Assess severity, recovery, and escalation',
          selectedBecause: problem ? 'The message reports a problem.' : undefined,
          result: selectedAgent === 'problem-solver' ? text : undefined,
        },
      ],
    },
    contributions: selectedAgent === 'front-desk'
      ? [{
          agentId: 'front-desk',
          intent: checkout ? 'checkout' : 'practical-stay',
          summary: text,
          responseParts: [text],
        }]
      : selectedAgent === 'local-guide'
        ? [{
            agentId: 'local-guide',
            intent: 'local-discovery',
            summary: text,
            responseParts: [text],
          }]
        : selectedAgent === 'problem-solver'
          ? [{
              agentId: 'problem-solver',
              intent: 'problem',
              summary: text,
              responseParts: [text],
            }]
          : [{
              agentId: 'guest-experience',
              intent: review ? 'review' : 'relationship',
              summary: text,
              responseParts: [text],
            }],
    finalResponse: text,
    memory: context.memory,
  }
}

const isStringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string')

const isOrchestrationResult = (value: unknown): value is OrchestrationResult => {
  if (!isRecord(value) || !isRecord(value.decision) || !isRecord(value.memory)) return false
  if (!hasString(value.decision, 'traceId') || !Array.isArray(value.decision.activations)) return false
  if (!Array.isArray(value.contributions) || !hasString(value, 'finalResponse')) return false
  return [
    value.memory.preferences,
    value.memory.visitedPlaces,
    value.memory.futurePlans,
    value.memory.importantRequests,
    value.memory.conversationFacts,
    value.memory.sentimentHistory,
  ].every(isStringArray) && Array.isArray(value.memory.issues)
}

const normaliseRpcError = (error: unknown, fallbackCode: string, retryable: boolean) => {
  const detail = isRecord(error) ? error : {}
  return {
    code: typeof detail.code === 'string'
      ? detail.code
      : typeof detail.code === 'number'
        ? String(detail.code)
        : fallbackCode,
    message: typeof detail.message === 'string'
      ? detail.message
      : 'The orchestration service returned an error.',
    retryable,
  }
}

const errorEvent = (
  code: string,
  message: string,
  retryable: boolean,
): OrchestrationStreamEvent => ({ type: 'error', error: { code, message, retryable } })

const finalEventFromText = (context: AgentContext, text: string): OrchestrationStreamEvent => {
  const result = parseAgentJson(text)
  if (isOrchestrationResult(result)) return { type: 'final', result }
  return { type: 'final', result: buildPlainTextResult(context, text) }
}

export const translateA2aPayload = (payload: unknown, context?: AgentContext): OrchestrationStreamEvent => {
  if (!isRecord(payload) || payload.jsonrpc !== '2.0') {
    return errorEvent('malformed_response', 'The orchestration service returned an unexpected response.', true)
  }
  if ('error' in payload) {
    return { type: 'error', error: normaliseRpcError(payload.error, 'orchestration_failed', true) }
  }
  if (!('result' in payload)) {
    return errorEvent('malformed_response', 'The orchestration service returned an unexpected response.', true)
  }

  const result = payload.result
  if (isOrchestrationResult(result)) return { type: 'final', result }
  if (!isRecord(result)) {
    return errorEvent('malformed_a2a_result', 'The orchestration agent returned an unexpected response.', true)
  }
  if (result.kind === 'message') {
    if (!context) {
      return errorEvent('malformed_a2a_result', 'The orchestration agent returned an unexpected response.', true)
    }
    return finalEventFromText(context, textFromParts(result.parts))
  }
  if (result.kind !== 'task' || !isRecord(result.status) || typeof result.status.state !== 'string') {
    return errorEvent('malformed_a2a_result', 'The orchestration agent returned an unexpected response.', true)
  }

  const state = result.status.state.toLowerCase()
  if (state === 'completed') {
    if (!context) {
      return errorEvent('malformed_a2a_result', 'The orchestration agent returned an unexpected response.', true)
    }
    return finalEventFromText(context, textFromCompletedTask(result))
  }
  if (state === 'failed') {
    return errorEvent('a2a_task_failed', 'The Manyfold orchestration task failed safely.', true)
  }
  if (state === 'canceled' || state === 'cancelled') {
    return errorEvent('a2a_task_cancelled', 'The Manyfold orchestration task was cancelled.', true)
  }
  if (state === 'rejected') {
    return errorEvent('a2a_task_rejected', 'The Manyfold orchestration task was rejected.', false)
  }
  if (state === 'input-required' || state === 'auth-required') {
    return errorEvent('a2a_task_requires_input', 'The Manyfold orchestration task requires human review.', false)
  }
  if (state === 'submitted' || state === 'working') {
    return errorEvent('a2a_task_incomplete', 'The Manyfold orchestration task has not completed.', true)
  }
  return errorEvent('a2a_task_unknown', 'The Manyfold orchestration task returned an unknown state.', true)
}

const integerEnv = (name: string, fallback: number, minimum: number, maximum: number) => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

const clientKey = (request: IncomingMessage) => {
  const forwarded = request.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return value?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown'
}

const consumeRequestBudget = (request: IncomingMessage) => {
  const now = Date.now()
  const windowMs = integerEnv('DEMO_RATE_WINDOW_SECONDS', DEFAULT_RATE_WINDOW_MS / 1_000, 60, 86_400) * 1_000
  const windowLimit = integerEnv('DEMO_RATE_LIMIT', DEFAULT_RATE_LIMIT, 1, 100)
  const dailyLimit = integerEnv('DEMO_DAILY_REQUEST_LIMIT', DEFAULT_DAILY_LIMIT, 1, 1_000)
  const key = clientKey(request)
  const existing = rateBuckets.get(key)
  const bucket: RateBucket = existing ?? {
    windowStartedAt: now,
    windowCount: 0,
    dayStartedAt: now,
    dayCount: 0,
  }

  if (now - bucket.windowStartedAt >= windowMs) {
    bucket.windowStartedAt = now
    bucket.windowCount = 0
  }
  if (now - bucket.dayStartedAt >= 24 * 60 * 60_000) {
    bucket.dayStartedAt = now
    bucket.dayCount = 0
  }
  if (bucket.windowCount >= windowLimit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartedAt + windowMs - now) / 1_000)) }
  }
  if (bucket.dayCount >= dailyLimit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.dayStartedAt + 24 * 60 * 60_000 - now) / 1_000)) }
  }

  bucket.windowCount += 1
  bucket.dayCount += 1
  rateBuckets.set(key, bucket)
  if (rateBuckets.size > MAX_RATE_BUCKETS) {
    const oldest = [...rateBuckets.entries()].sort((left, right) => left[1].dayStartedAt - right[1].dayStartedAt)
    for (const [oldKey] of oldest.slice(0, rateBuckets.size - MAX_RATE_BUCKETS)) rateBuckets.delete(oldKey)
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: { code: 'method_not_allowed', message: 'POST required' } })
    return
  }

  let requestBody: unknown
  try {
    requestBody = JSON.parse(await readBody(request)) as unknown
  } catch (error) {
    const tooLarge = error instanceof BodyTooLargeError
    writeJson(response, tooLarge ? 413 : 400, {
      error: {
        code: tooLarge ? 'request_too_large' : 'invalid_request',
        message: tooLarge
          ? `The request exceeds the ${MAX_BODY_BYTES}-byte limit.`
          : 'The request could not be processed safely.',
        retryable: false,
      },
    })
    return
  }

  if (!isRecord(requestBody) || !validateRequestContext(requestBody.context)) {
    writeJson(response, 400, {
      error: {
        code: 'invalid_request',
        message: 'A valid bounded context payload is required.',
        retryable: false,
      },
    })
    return
  }

  const budget = consumeRequestBudget(request)
  if (!budget.allowed) {
    writeJson(response, 429, {
      error: {
        code: 'demo_budget_exceeded',
        message: 'The competition demo request budget has been reached. Please try again later.',
        retryable: true,
      },
    }, { 'Retry-After': String(budget.retryAfterSeconds) })
    return
  }

  const maxConcurrent = integerEnv('DEMO_MAX_CONCURRENT_REQUESTS', DEFAULT_MAX_CONCURRENT, 1, 10)
  if (activeRequests >= maxConcurrent) {
    writeJson(response, 429, {
      error: {
        code: 'demo_busy',
        message: 'The competition demo is processing its current request. Please try again shortly.',
        retryable: true,
      },
    }, { 'Retry-After': '10' })
    return
  }

  const context = requestBody.context
  const rpcRequest = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        messageId: randomUUID(),
        role: 'user',
        parts: [{
          kind: 'text',
          text: `AI_HOSPITALITY_CONTEXT_V1\n${JSON.stringify(context)}`,
        }],
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ['text/plain'],
      },
    },
  }

  activeRequests += 1
  let upstream: Response
  try {
    upstream = await fetch(getA2aRpcUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${getRequiredEnv('MF_A2A_BEARER')}`,
      },
      body: JSON.stringify(rpcRequest),
      signal: AbortSignal.timeout(280_000),
    })
  } catch {
    activeRequests -= 1
    writeJson(response, 502, {
      error: {
        code: 'upstream_unavailable',
        message: 'The orchestration service is unavailable.',
        retryable: true,
      },
    })
    return
  }
  activeRequests -= 1

  const payloadText = await upstream.text().catch(() => '')
  let payload: unknown
  try {
    payload = payloadText ? JSON.parse(payloadText) : null
  } catch {
    payload = null
  }

  if (upstream.ok) {
    writeNdjson(response, 200, translateA2aPayload(payload, context))
    return
  }

  const error = isRecord(payload) && 'error' in payload
    ? normaliseRpcError(payload.error, 'upstream_error', upstream.status >= 500)
    : {
        code: 'upstream_error',
        message: `The orchestration service failed with status ${upstream.status}.`,
        retryable: upstream.status >= 500,
      }
  writeJson(response, upstream.status, { error })
}
