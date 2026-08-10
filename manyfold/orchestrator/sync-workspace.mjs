import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const checkOnly = args.includes('--check')
const targetRoot = resolve(
  option('--target') ?? process.env.MANYFOLD_ORCHESTRATOR_WORKSPACE ?? '',
)
const agentId = option('--agent-id') ?? process.env.MANYFOLD_ORCHESTRATOR_AGENT_ID

if (!targetRoot || targetRoot === '/' || targetRoot === repositoryRoot) {
  throw new Error('Provide a dedicated target with --target or MANYFOLD_ORCHESTRATOR_WORKSPACE.')
}
if (!agentId) {
  throw new Error('Provide --agent-id or MANYFOLD_ORCHESTRATOR_AGENT_ID.')
}

const sourceEntries = [
  'package.json',
  'package-lock.json',
  'tsconfig.server.json',
  'server',
  'src/domain',
]

const filesBelow = async (root, entry = '') => {
  const path = join(root, entry)
  const details = await stat(path)
  if (details.isFile()) return [entry]
  const children = await readdir(path)
  const nested = await Promise.all(children.sort().map((child) => filesBelow(root, join(entry, child))))
  return nested.flat()
}

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex')

const sourceHashes = async () => {
  const files = (await Promise.all(sourceEntries.map((entry) => filesBelow(repositoryRoot, entry)))).flat().sort()
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await sha256(join(repositoryRoot, file))])))
}

const targetHashes = async (files) => Object.fromEntries(await Promise.all(
  Object.keys(files).map(async (file) => [file, await sha256(join(targetRoot, file))]),
))

const hashesBelowTarget = async (entries) => {
  const files = (await Promise.all(entries.map((entry) => filesBelow(targetRoot, entry)))).flat().sort()
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await sha256(join(targetRoot, file))])))
}

const manifestPath = join(targetRoot, 'manyfold-workspace-manifest.json')

if (checkOnly) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const currentSource = await sourceHashes()
  const currentTarget = await targetHashes(currentSource)
  if (JSON.stringify(currentSource) !== JSON.stringify(manifest.sourceFiles)) {
    throw new Error('Repository files have changed since the isolated workspace was synchronized.')
  }
  if (JSON.stringify(currentTarget) !== JSON.stringify(manifest.sourceFiles)) {
    throw new Error('The isolated workspace differs from the synchronized repository files.')
  }
  const currentGenerated = await targetHashes(manifest.generatedFiles)
  if (JSON.stringify(currentGenerated) !== JSON.stringify(manifest.generatedFiles)) {
    throw new Error('A generated isolated-workspace file differs from its synchronization manifest.')
  }
  if (manifest.agentId !== agentId) throw new Error('The isolated workspace manifest belongs to another agent.')
  process.stdout.write(`${JSON.stringify({
    ok: true,
    agentId,
    targetRoot,
    sourceFiles: Object.keys(currentSource).length,
    generatedFiles: Object.keys(currentGenerated).length,
  })}\n`)
  process.exit(0)
}

const { stdout } = await execFileAsync('mf', [
  '--account', 'model-config', 'get', agentId,
], {
  cwd: repositoryRoot,
  maxBuffer: 1_000_000,
  timeout: 30_000,
})
const modelView = JSON.parse(stdout)
if (modelView.source !== 'platform' || modelView.validation?.valid !== true) {
  throw new Error('The target agent does not have a valid Manyfold-managed platform model configuration.')
}
const providerUrl = new URL(modelView.providerBaseUrl)
if (providerUrl.protocol !== 'https:') throw new Error('The managed model provider URL must use HTTPS.')

const requiredModels = [
  process.env.AI_ECONOMY_MODEL ?? 'gpt-5.4-mini',
  process.env.AI_REASONING_MODEL ?? 'gpt-5.6-terra',
]
const enabledModels = (modelView.options ?? [])
  .filter((entry) => entry.enabled === true && typeof entry.value === 'string')
  .map((entry) => entry.value)
for (const model of requiredModels) {
  if (!enabledModels.includes(model)) throw new Error(`Required managed model ${model} is not enabled.`)
}

await mkdir(targetRoot, { recursive: true })
for (const entry of [...sourceEntries, 'server-dist', 'manyfold-runtime.json', 'manyfold-workspace-manifest.json']) {
  await rm(join(targetRoot, entry), { recursive: true, force: true })
}
await rm(join(targetRoot, '.agents/skills/ai-hospitality-orchestrator'), { recursive: true, force: true })

for (const entry of sourceEntries) {
  await mkdir(dirname(join(targetRoot, entry)), { recursive: true })
  await cp(join(repositoryRoot, entry), join(targetRoot, entry), { recursive: true })
}
await cp(join(scriptDirectory, 'AGENTS.template.md'), join(targetRoot, 'AGENTS.md'))
await mkdir(join(targetRoot, '.agents/skills/ai-hospitality-orchestrator'), { recursive: true })
await cp(
  join(scriptDirectory, 'skill/SKILL.md'),
  join(targetRoot, '.agents/skills/ai-hospitality-orchestrator/SKILL.md'),
)

const managedModelSnapshot = {
  source: 'platform',
  agentId,
  provider: modelView.provider,
  providerBaseUrl: providerUrl.toString().replace(/\/$/, ''),
  options: enabledModels.map((value) => ({ value, enabled: true })),
  validation: { valid: true, messages: [] },
}
await writeFile(
  join(targetRoot, 'manyfold-runtime.json'),
  `${JSON.stringify(managedModelSnapshot, null, 2)}\n`,
  { mode: 0o600 },
)

await execFileAsync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: targetRoot,
  maxBuffer: 4_000_000,
  timeout: 180_000,
})
await execFileAsync('npm', ['exec', '--', 'tsc', '-p', 'tsconfig.server.json'], {
  cwd: targetRoot,
  maxBuffer: 4_000_000,
  timeout: 120_000,
})

const hashes = await sourceHashes()
const copiedHashes = await targetHashes(hashes)
if (JSON.stringify(hashes) !== JSON.stringify(copiedHashes)) {
  throw new Error('The isolated workspace did not synchronize cleanly.')
}
const generatedFiles = await hashesBelowTarget([
  'AGENTS.md',
  '.agents/skills/ai-hospitality-orchestrator/SKILL.md',
  'manyfold-runtime.json',
  'server-dist',
])
const manifest = {
  schemaVersion: 1,
  product: 'AI Hospitality Team',
  agentId,
  sourceFiles: hashes,
  generatedFiles,
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })

process.stdout.write(`${JSON.stringify({
  ok: true,
  agentId,
  targetRoot,
  files: Object.keys(hashes).length,
  modelSource: managedModelSnapshot.source,
  models: requiredModels,
})}\n`)
