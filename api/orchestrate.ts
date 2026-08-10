import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

const writeJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
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

const isHopByHopHeader = (name: string) =>
  name === 'connection' ||
  name === 'content-length' ||
  name === 'keep-alive' ||
  name === 'proxy-authenticate' ||
  name === 'proxy-authorization' ||
  name === 'te' ||
  name === 'trailers' ||
  name === 'transfer-encoding' ||
  name === 'upgrade'

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

  const headers: Record<string, string> = {}
  upstream.headers.forEach((value, name) => {
    if (!isHopByHopHeader(name)) headers[name] = value
  })
  response.writeHead(upstream.status, headers)

  if (!upstream.body) {
    response.end()
    return
  }

  Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream).pipe(response)
}
