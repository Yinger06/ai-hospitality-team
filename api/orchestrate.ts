import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const maxDuration = 300

const writeJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textFromParts = (parts: unknown) => {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.kind === 'text')
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('')
}

const textFromA2aResult = (result: unknown) => {
  if (!isRecord(result)) return ''
  if (result.kind === 'message') return textFromParts(result.parts)
  if (result.kind !== 'task') return ''

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
  return JSON.parse(fenced?.[1] ?? trimmed) as unknown
}

const isOrchestrationResult = (value: unknown) =>
  isRecord(value) &&
  isRecord(value.decision) &&
  Array.isArray(value.decision.activations) &&
  Array.isArray(value.contributions) &&
  typeof value.finalResponse === 'string' &&
  isRecord(value.memory)

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

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: { code: 'method_not_allowed', message: 'POST required' } })
    return
  }

  let requestBody: unknown
  try {
    requestBody = JSON.parse((await readBody(request)).toString('utf8')) as unknown
  } catch {
    writeJson(response, 400, {
      error: {
        code: 'invalid_request',
        message: 'The request could not be processed safely.',
        retryable: false,
      },
    })
    return
  }

  if (!isRecord(requestBody) || !isRecord(requestBody.context)) {
    writeJson(response, 400, {
      error: {
        code: 'invalid_request',
        message: 'A valid context payload is required.',
        retryable: false,
      },
    })
    return
  }

  const context = requestBody.context
  const a2aPrompt = `AI_HOSPITALITY_CONTEXT_V1\n${JSON.stringify(context)}`
  const rpcRequest = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        messageId: randomUUID(),
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: a2aPrompt,
          },
        ],
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ['text/plain'],
      },
    },
  }

  let upstream: Response
  try {
    upstream = await fetch(getRequiredEnv('MANYFOLD_A2A_RPC_URL'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson, application/json',
        Authorization: `Bearer ${getRequiredEnv('MF_A2A_BEARER')}`,
      },
      body: JSON.stringify(rpcRequest),
    })
  } catch {
    writeJson(response, 502, {
      error: {
        code: 'upstream_unavailable',
        message: 'The orchestration service is unavailable.',
        retryable: true,
      },
    })
    return
  }

  const payloadText = await upstream.text().catch(() => '')
  let payload: unknown
  try {
    payload = payloadText ? JSON.parse(payloadText) : null
  } catch {
    payload = null
  }

  if (upstream.ok) {
    if (isRecord(payload) && 'result' in payload) {
      let result: unknown = payload.result
      if (!isOrchestrationResult(result)) {
        const resultText = textFromA2aResult(result)
        try {
          result = resultText ? parseAgentJson(resultText) : null
        } catch {
          result = null
        }
      }

      if (!isOrchestrationResult(result)) {
        writeNdjson(response, 200, {
          type: 'error',
          error: {
            code: 'malformed_a2a_result',
            message: 'The orchestration agent returned an unexpected response.',
            retryable: true,
          },
        })
        return
      }

      writeNdjson(response, 200, { type: 'final', result })
      return
    }

    const error = isRecord(payload) && 'error' in payload
      ? normaliseRpcError(payload.error, 'orchestration_failed', true)
      : {
          code: 'malformed_response',
          message: 'The orchestration service returned an unexpected response.',
          retryable: true,
        }
    writeNdjson(response, 200, { type: 'error', error })
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
