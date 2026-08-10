import type { IncomingMessage, ServerResponse } from 'node:http'

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

  let body: Buffer
  try {
    body = await readBody(request)
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

  let upstream: Response
  try {
    upstream = await fetch(getRequiredEnv('MANYFOLD_A2A_RPC_URL'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson, application/json',
        Authorization: `Bearer ${getRequiredEnv('MF_A2A_BEARER')}`,
      },
      body,
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
      writeNdjson(response, 200, { type: 'final', result: payload.result })
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
