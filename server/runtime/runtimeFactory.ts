import type { ModelRuntime } from './modelRuntime.js'
import { FixtureModelRuntime } from './fixtureRuntime.js'
import { ManyfoldCodexRuntime } from './manyfoldCodexRuntime.js'

let runtime: ModelRuntime | undefined

export const getModelRuntime = (): ModelRuntime => {
  if (runtime) return runtime
  const mode = process.env.AI_RUNTIME ?? 'manyfold-codex'
  if (mode === 'fixture') {
    runtime = new FixtureModelRuntime()
    return runtime
  }
  if (mode !== 'manyfold-codex') {
    throw new Error(`Unsupported AI_RUNTIME: ${mode}`)
  }
  runtime = new ManyfoldCodexRuntime()
  return runtime
}
