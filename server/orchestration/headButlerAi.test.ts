// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { emptyMemory, sampleGuest, sampleProperty } from '../../src/data/sampleData'
import type { AgentContext } from '../../src/domain/types'
import type { ModelRequest, ModelResponse, ModelRuntime } from '../runtime/modelRuntime'
import { ModelRuntimeError } from '../runtime/modelRuntime'
import { validateSpecialistPlan } from './contracts'
import { orchestrateWithAi } from './headButlerAi'

class ScriptedRuntime implements ModelRuntime {
  readonly mode = 'test-fixture' as const
  readonly calls: Array<{ task: string; agentId: string; model: string }> = []

  constructor(private readonly outputs: unknown[]) {}

  async run<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    this.calls.push({ task: request.task, agentId: request.agentId, model: request.model })
    const output = this.outputs.shift()
    if (output instanceof Error) throw output
    return {
      data: request.validate(output),
      durationMs: 4,
      usage: { inputTokens: 100, outputTokens: 20 },
    }
  }
}

const contextFor = (message: string, overrides: Partial<AgentContext> = {}): AgentContext => ({
  message,
  stage: 'during-stay',
  guest: sampleGuest,
  property: sampleProperty,
  memory: emptyMemory,
  now: '2026-08-16T18:00:00.000Z',
  eventType: 'guest-message',
  ...overrides,
})

const route = (overrides: Record<string, unknown> = {}) => ({
  intents: ['relationship'],
  sentiment: 'neutral',
  severity: 'low',
  rationale: 'One bounded guest need was identified.',
  selections: [{ agentId: 'guest-experience', reason: 'A hospitality response is useful.' }],
  knowledgeKeys: [],
  memoryCandidates: [],
  ...overrides,
})

const specialist = (
  agentId: string,
  intent: string,
  responseParts: string[],
  overrides: Record<string, unknown> = {},
) => ({
  agentId,
  intent,
  summary: `${agentId} completed its bounded task`,
  responseParts,
  factsUsed: [],
  memoryCandidates: [],
  issue: null,
  escalation: null,
  ...overrides,
})

describe('model-backed Head Butler orchestration', () => {
  it('rejects specialist meta-instructions instead of sending them to a guest', () => {
    expect(() => validateSpecialistPlan(specialist(
      'guest-experience',
      'relationship',
      ['Warmly acknowledge the guest and keep the tone light.'],
    ))).toThrow(/guest-facing copy/)
  })

  it('coordinates paraphrased positive, local, and problem intents into one response', async () => {
    const runtime = new ScriptedRuntime([
      route({
        intents: ['memory-update', 'local-discovery', 'problem', 'relationship', 'review'],
        sentiment: 'concerned',
        severity: 'medium',
        rationale: 'The guest is upbeat, reports weak hot water, and mentions a river outing.',
        selections: [
          { agentId: 'guest-memory', reason: 'Retain the outing plan.' },
          { agentId: 'guest-experience', reason: 'Acknowledge the positive day.' },
          { agentId: 'local-guide', reason: 'Support the planned outing.' },
          { agentId: 'problem-solver', reason: 'Assess the hot-water problem.' },
        ],
        knowledgeKeys: ['local-greenwich'],
        memoryCandidates: [
          { category: 'visited-place', value: 'British Museum' },
          { category: 'future-plan', value: 'Greenwich' },
        ],
      }),
      specialist('guest-experience', 'relationship', ['I’m glad the museum was a highlight.']),
      specialist('local-guide', 'local-discovery', ['The Thames Clipper is a scenic Greenwich route.'], {
        factsUsed: ['local-greenwich'],
      }),
      specialist('problem-solver', 'problem', ['I’m sorry the water is only lukewarm; the host needs to review it.'], {
        issue: { summary: 'Hot water is only lukewarm', severity: 'medium' },
        escalation: {
          title: 'Hot water is only lukewarm',
          detail: 'Human review required; no repair has been confirmed.',
          severity: 'medium',
        },
      }),
      {
        finalResponse: 'I’m glad the museum was a highlight. I’m sorry the water is only lukewarm, and I’m asking the host to review it. For Greenwich, the Thames Clipper is a scenic option.',
        safetyNotes: [],
      },
    ])

    const result = await orchestrateWithAi(contextFor(
      'The galleries were brilliant. The water never gets more than lukewarm, though. We fancy taking a boat downriver tomorrow.',
    ), { runtime })

    expect(result.decision.activations.filter((item) => item.status === 'done').map((item) => item.agentId))
      .toEqual(expect.arrayContaining(['head-butler', 'guest-memory', 'guest-experience', 'local-guide', 'problem-solver']))
    expect(result.finalResponse).toContain('lukewarm')
    expect(result.finalResponse).toContain('Greenwich')
    expect(result.memory.visitedPlaces).toContain('British Museum')
    expect(result.memory.futurePlans).toContain('Greenwich')
    expect(result.decision.intents).not.toContain('review')
    expect(result.trace?.modelCalls).toHaveLength(5)
    expect(runtime.calls.at(-1)).toMatchObject({ task: 'synthesis', model: 'gpt-5.6-terra' })
  })

  it('overrides an under-routed model result when urgent gas language is present', async () => {
    const runtime = new ScriptedRuntime([
      route(),
      specialist('guest-experience', 'relationship', ['Please take care.']),
      specialist('problem-solver', 'problem', ['Leave the property and seek immediate help.'], {
        issue: { summary: 'Possible gas smell', severity: 'urgent' },
        escalation: {
          title: 'Possible gas smell',
          detail: 'Immediate human review required.',
          severity: 'urgent',
        },
      }),
      { finalResponse: 'Please leave the property now and seek immediate help.', safetyNotes: ['urgent'] },
    ])

    const result = await orchestrateWithAi(contextFor(
      'There is a strange smell like gas near the boiler and it is getting stronger.',
    ), { runtime })

    expect(result.decision.severity).toBe('urgent')
    expect(result.decision.activations.find((item) => item.agentId === 'problem-solver')?.status).toBe('done')
    expect(result.trace?.safetyRulesApplied).toContain('life-safety-fire-gas')
    expect(result.trace?.groundedKnowledge).toContain('emergency-contact')
    expect(result.finalResponse).toContain('999')
    expect(result.escalation?.severity).toBe('urgent')
  })

  it('does not invent property knowledge when no verified fact was requested', async () => {
    const runtime = new ScriptedRuntime([
      route({
        intents: ['local-discovery'],
        selections: [{ agentId: 'local-guide', reason: 'The guest asks for a local activity.' }],
      }),
      specialist('local-guide', 'local-discovery', [
        'I don’t have a verified late-night venue in the property guide, so the host should confirm one.',
      ]),
    ])
    const result = await orchestrateWithAi(contextFor(
      'Could you suggest somewhere unusual nearby that stays open after midnight?',
    ), { runtime })

    expect(result.trace?.groundedKnowledge).toEqual([])
    expect(result.finalResponse).toContain('don’t have a verified')
    expect(runtime.calls).toHaveLength(2)
  })

  it('avoids an extra synthesis call for one bounded routine specialist', async () => {
    const runtime = new ScriptedRuntime([
      route({
        intents: ['practical-stay'],
        selections: [{ agentId: 'front-desk', reason: 'The guest needs verified access details.' }],
        knowledgeKeys: ['access'],
      }),
      specialist('front-desk', 'practical-stay', ['Use the lower brass keypad at the blue door and enter 2841#.'], {
        factsUsed: ['access'],
      }),
    ])
    const result = await orchestrateWithAi(contextFor(
      'I’m staring at the blue entrance and can’t work out which keypad lets us inside.',
      { stage: 'arrival' },
    ), { runtime })

    expect(result.finalResponse).toContain('2841#')
    expect(runtime.calls).toHaveLength(2)
    expect(runtime.calls.every((call) => call.model === 'gpt-5.4-mini')).toBe(true)
  })

  it('deterministically suppresses a review request while an issue is unresolved', async () => {
    const runtime = new ScriptedRuntime([
      route({
        intents: ['review', 'relationship'],
        selections: [{ agentId: 'guest-experience', reason: 'Review follow-up needs relationship care.' }],
      }),
      specialist('guest-experience', 'review', ['If you have a moment, we would love a review of your stay.']),
    ])
    const result = await orchestrateWithAi(contextFor(
      'The guest has checked out.',
      {
        stage: 'review-follow-up',
        eventType: 'host-action',
        memory: {
          ...emptyMemory,
          issues: [{
            id: 'issue-open',
            summary: 'Heating problem',
            severity: 'high',
            status: 'escalated',
            openedAt: '2026-08-17T10:00:00.000Z',
          }],
        },
      },
    ), { runtime })

    expect(result.finalResponse).toContain('holding off on a review request')
    expect(result.finalResponse).toContain('heating problem')
    expect(result.trace?.policyRulesApplied).toContain('review-request-suppressed-unresolved-issue')
  })

  it('surfaces provider failure instead of substituting deterministic reasoning', async () => {
    const runtime = new ScriptedRuntime([
      new ModelRuntimeError('timeout', 'The model timed out.'),
    ])
    await expect(orchestrateWithAi(contextFor('The room feels wrong somehow.'), { runtime }))
      .rejects.toMatchObject({ code: 'timeout' })
    expect(runtime.calls).toHaveLength(1)
  })
})
