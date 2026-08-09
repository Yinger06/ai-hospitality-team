import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { createApiHandler } from './server/http/apiHandler.js'

const apiHandler = createApiHandler()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ai-hospitality-api',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!request.url?.startsWith('/api/')) return next()
          void apiHandler(request, response, next)
        })
      },
    },
  ],
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
