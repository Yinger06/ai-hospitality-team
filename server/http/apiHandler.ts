import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentContext, OrchestrationStreamEvent } from '../../src/domain/types.js'
import { stayStages } from '../../src/domain/types.js'
import { orchestrateWithAi } from '../orchestration/headButlerAi.js'
import { ModelRuntimeError } from '../runtime/modelRuntime.js'
import { getModelRuntime } from '../runtime/runtimeFactory.js'

const MAX_BODY_BYTES = 100_000
const eventTypes: AgentContext['eventType'][] = [
  'guest-message', 'booking-event', 'host-action', 'review-event',
]

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

const writeJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

export const createApiHandler = () => {
  const runtime = getModelRuntime()

  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next?: () => void,
  ) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (path === '/api/health' && request.method === 'GET') {
      writeJson(response, 200, { status: 'ok', aiRuntime: runtime.mode })
      return
    }
    if (path !== '/api/orchestrate') {
      if (next) next()
      else writeJson(response, 404, { error: { code: 'not_found', message: 'API route not found' } })
      return
    }
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: { code: 'method_not_allowed', message: 'POST required' } })
      return
    }

    let streamStarted = false
    const emit = (event: OrchestrationStreamEvent) => {
      if (!streamStarted) {
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Content-Type-Options': 'nosniff',
        })
        streamStarted = true
      }
      response.write(`${JSON.stringify(event)}\n`)
    }

    try {
      const body = JSON.parse(await readBody(request)) as unknown
      if (!isRecord(body)) throw new Error('Invalid request body')
      const context = validateContext(body.context)
      await orchestrateWithAi(context, { runtime, emit })
      response.end()
    } catch (error) {
      const runtimeError = error instanceof ModelRuntimeError ? error : undefined
      const event: OrchestrationStreamEvent = {
        type: 'error',
        error: {
          code: runtimeError?.code ?? 'invalid_request',
          message: runtimeError?.message ?? 'The request could not be processed safely.',
          retryable: runtimeError?.retryable ?? false,
        },
      }
      if (streamStarted) {
        response.write(`${JSON.stringify(event)}\n`)
        response.end()
      } else {
        writeJson(response, runtimeError ? 503 : 400, { error: event.error })
      }
    }
  }
}
