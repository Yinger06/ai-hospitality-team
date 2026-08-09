import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiHandler } from './http/apiHandler.js'

const root = fileURLToPath(new URL('../../dist', import.meta.url))
const port = Number(process.env.PORT ?? 8080)
const apiHandler = createApiHandler()
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const serveStatic = async (urlPath: string, response: import('node:http').ServerResponse) => {
  const decoded = decodeURIComponent(urlPath)
  const relative = normalize(decoded).replace(/^[/\\]+/, '')
  if (relative.startsWith('..')) {
    response.writeHead(400)
    response.end('Bad request')
    return
  }
  let filePath = join(root, relative || 'index.html')
  try {
    if (!(await stat(filePath)).isFile()) filePath = join(root, 'index.html')
  } catch {
    filePath = join(root, 'index.html')
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  createReadStream(filePath).pipe(response)
}

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (path.startsWith('/api/')) {
    void apiHandler(request, response)
    return
  }
  void serveStatic(path, response)
}).listen(port, '0.0.0.0', () => {
  console.log(`AI Hospitality Team server listening on http://0.0.0.0:${port}`)
})
