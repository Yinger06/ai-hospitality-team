import type { KnowledgeKey, MemoryCandidate, SpecialistAgentId } from '../../src/domain/types.js'
import type { ModelRequest, ModelResponse, ModelRuntime } from './modelRuntime.js'

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

const includes = (message: string, values: string[]) =>
  values.some((value) => message.toLowerCase().includes(value))

const fixtureRoute = (input: unknown) => {
  const event = record(record(input).event)
  const message = String(event.message ?? '')
  const memoryCandidates: MemoryCandidate[] = []
  const selections: Array<{ agentId: SpecialistAgentId; reason: string }> = []
  const intents: string[] = []
  const knowledgeKeys: KnowledgeKey[] = []

  if (includes(message, ['museum'])) memoryCandidates.push({ category: 'visited-place', value: 'British Museum' })
  if (includes(message, ['greenwich'])) memoryCandidates.push({ category: 'future-plan', value: 'Greenwich' })
  if (includes(message, ['vegetarian'])) memoryCandidates.push({ category: 'preference', value: 'Vegetarian-friendly food' })
  if (memoryCandidates.length) {
    intents.push('memory-update')
    selections.push({ agentId: 'guest-memory', reason: 'Useful guest context should be retained.' })
  }
  if (includes(message, ['wifi', 'wi-fi', 'door', 'key', 'bags', 'luggage'])) {
    intents.push('practical-stay')
    selections.push({ agentId: 'front-desk', reason: 'The guest needs verified property logistics.' })
    if (includes(message, ['wifi', 'wi-fi'])) knowledgeKeys.push('wifi')
    if (includes(message, ['door', 'key'])) knowledgeKeys.push('access')
    if (includes(message, ['bags', 'luggage'])) knowledgeKeys.push('luggage')
  }
  if (includes(message, ['greenwich', 'vegetarian', 'restaurant', 'lunch'])) {
    intents.push('local-discovery')
    selections.push({ agentId: 'local-guide', reason: 'A grounded local suggestion is useful.' })
    knowledgeKeys.push('local-greenwich', 'local-vegetarian')
  }
  if (includes(message, ['cold', 'broken', 'not working', 'smoke', 'fire'])) {
    intents.push('problem')
    selections.push({ agentId: 'problem-solver', reason: 'A reported issue needs severity and recovery assessment.' })
  }
  if (includes(message, ['wonderful', 'lovely', 'thank']) || event.type !== 'guest-message') {
    intents.push('relationship')
    selections.push({ agentId: 'guest-experience', reason: 'The relationship signal deserves an appropriate response.' })
  }
  if (!selections.length) {
    intents.push('relationship')
    selections.push({ agentId: 'guest-experience', reason: 'A coherent hospitality response is appropriate.' })
  }

  return {
    intents: [...new Set(intents)],
    sentiment: includes(message, ['wonderful', 'lovely', 'thank']) ? 'positive' : includes(message, ['cold', 'broken']) ? 'concerned' : 'neutral',
    severity: includes(message, ['smoke', 'fire']) ? 'urgent' : includes(message, ['cold', 'broken']) ? 'medium' : 'low',
    rationale: 'Fixture route for repeatable automated testing; no live model was called.',
    selections: selections.filter((selection, index) =>
      selections.findIndex((item) => item.agentId === selection.agentId) === index),
    knowledgeKeys: [...new Set(knowledgeKeys)],
    memoryCandidates,
  }
}

const fixtureSpecialist = (input: unknown) => {
  const data = record(input)
  const agentId = String(data.agentId) as SpecialistAgentId
  const event = record(data.event)
  const message = String(event.message ?? '')
  const base = {
    agentId,
    memoryCandidates: [],
    issue: null,
    escalation: null,
    factsUsed: [],
  }
  if (agentId === 'problem-solver') return {
    ...base,
    intent: 'problem',
    summary: 'Assessed the shower issue and requested human review',
    responseParts: ['I’m sorry the shower is running cold. I’m asking Mia to review this now; no maintenance action has been confirmed yet.'],
    issue: { summary: 'Shower water is cold', severity: 'medium' },
    escalation: {
      title: 'Shower water is cold',
      detail: 'Human review is required. No external action has been taken automatically.',
      severity: 'medium',
    },
  }
  if (agentId === 'local-guide') return {
    ...base,
    intent: 'local-discovery',
    summary: 'Prepared a grounded Greenwich suggestion',
    responseParts: ['For Greenwich tomorrow, the Thames Clipper from Embankment is a scenic option; please check current times before travelling.'],
    factsUsed: ['local-greenwich'],
  }
  if (agentId === 'front-desk') return {
    ...base,
    intent: 'practical-stay',
    summary: 'Prepared verified property information',
    responseParts: ['I’ve included the relevant verified property details below.'],
  }
  return {
    ...base,
    intent: 'relationship',
    summary: 'Acknowledged the guest’s experience warmly',
    responseParts: [includes(message, ['museum']) ? 'I’m so glad you had a wonderful day at the British Museum.' : 'Thank you for the update.'],
  }
}

const fixtureSynthesis = (input: unknown) => {
  const contributions = record(input).contributions
  const parts = Array.isArray(contributions)
    ? contributions.flatMap((item) => {
      const responseParts = record(item).responseParts
      return Array.isArray(responseParts) ? responseParts.map(String) : []
    })
    : []
  return { finalResponse: parts.join(' '), safetyNotes: [] }
}

// Explicitly simulated. This exists only for deterministic tests and is always surfaced as test-fixture mode.
export class FixtureModelRuntime implements ModelRuntime {
  readonly mode = 'test-fixture' as const

  async run<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    await new Promise((resolve) => setTimeout(resolve, 80))
    const output = request.task === 'routing'
      ? fixtureRoute(request.input)
      : request.task === 'specialist'
        ? fixtureSpecialist(request.input)
        : fixtureSynthesis(request.input)
    return { data: request.validate(output), durationMs: 1, usage: {} }
  }
}
