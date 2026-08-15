// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { emptyMemory, sampleGuest, sampleProperty } from '../src/data/sampleData.js'
import type { OrchestrationResult } from '../src/domain/types.js'
import { translateA2aPayload, validateRequestContext } from './orchestrate.js'

const orchestrationResult: OrchestrationResult = {
  decision: {
    traceId: 'trace-fixture',
    intents: ['relationship'],
    sentiment: 'positive',
    severity: 'low',
    rationale: 'A warm reply is appropriate.',
    activations: [],
  },
  contributions: [],
  finalResponse: 'Welcome back, Maya.',
  memory: {
    preferences: [],
    visitedPlaces: [],
    futurePlans: [],
    importantRequests: [],
    conversationFacts: [],
    sentimentHistory: ['positive'],
    issues: [],
  },
}

const textPart = (value: unknown) => ({ kind: 'text', text: JSON.stringify(value) })
const rpc = (result: unknown) => ({ jsonrpc: '2.0', id: 'rpc-1', result })
const checkoutContext = {
  message: 'What time is check-out?',
  stage: 'check-out',
  eventType: 'guest-message',
  now: '2026-08-10T20:00:00.000Z',
  guest: sampleGuest,
  property: sampleProperty,
  memory: emptyMemory,
} as const

describe('Manyfold A2A response translation', () => {
  it('accepts an A2A Message containing the structured orchestration result', () => {
    expect(translateA2aPayload(rpc({
      kind: 'message',
      messageId: 'message-1',
      role: 'agent',
      parts: [textPart(orchestrationResult)],
    }), checkoutContext)).toEqual({ type: 'final', result: orchestrationResult })
  })

  it('accepts a completed Task artifact', () => {
    expect(translateA2aPayload(rpc({
      kind: 'task',
      id: 'task-1',
      status: { state: 'completed' },
      artifacts: [{ artifactId: 'artifact-1', parts: [textPart(orchestrationResult)] }],
    }), checkoutContext)).toEqual({ type: 'final', result: orchestrationResult })
  })

  it('accepts a completed Task status message when no artifact is present', () => {
    expect(translateA2aPayload(rpc({
      kind: 'task',
      id: 'task-2',
      status: {
        state: 'completed',
        message: { kind: 'message', parts: [textPart(orchestrationResult)] },
      },
    }), checkoutContext)).toEqual({ type: 'final', result: orchestrationResult })
  })

  it('accepts a plain-text completed Task by preserving the frontend contract', () => {
    expect(translateA2aPayload(rpc({
      kind: 'task',
      id: 'task-plain-text',
      status: { state: 'completed' },
      artifacts: [{ artifactId: 'artifact-plain-text', parts: [{ kind: 'text', text: 'Check-out is by 11:00 AM.' }] }],
    }), checkoutContext)).toEqual({
      type: 'final',
      result: expect.objectContaining({
        finalResponse: 'Check-out is by 11:00 AM.',
        decision: expect.objectContaining({
          activations: expect.arrayContaining([
            expect.objectContaining({ agentId: 'head-butler', status: 'done' }),
            expect.objectContaining({ agentId: 'front-desk', status: 'done' }),
          ]),
        }),
      }),
    })
  })

  it.each([
    ['failed', 'a2a_task_failed', true],
    ['canceled', 'a2a_task_cancelled', true],
    ['cancelled', 'a2a_task_cancelled', true],
    ['rejected', 'a2a_task_rejected', false],
    ['working', 'a2a_task_incomplete', true],
    ['submitted', 'a2a_task_incomplete', true],
    ['input-required', 'a2a_task_requires_input', false],
    ['auth-required', 'a2a_task_requires_input', false],
  ])('maps Task state %s to a bounded NDJSON error event', (state, code, retryable) => {
    expect(translateA2aPayload(rpc({
      kind: 'task',
      id: `task-${state}`,
      status: {
        state,
        message: { kind: 'message', parts: [{ kind: 'text', text: 'Untrusted status detail' }] },
      },
    }))).toMatchObject({ type: 'error', error: { code, retryable } })
  })

  it('rejects a completed Task with malformed output', () => {
    expect(translateA2aPayload(rpc({
      kind: 'task',
      id: 'task-malformed',
      status: { state: 'completed' },
      artifacts: [{ artifactId: 'artifact-malformed', parts: [{ kind: 'text', text: 'not json' }] }],
    }))).toMatchObject({ type: 'error', error: { code: 'malformed_a2a_result' } })
  })

  it('maps a JSON-RPC error without treating it as a successful result', () => {
    expect(translateA2aPayload({
      jsonrpc: '2.0',
      id: 'rpc-error',
      error: { code: -32602, message: 'message required' },
    })).toEqual({
      type: 'error',
      error: { code: '-32602', message: 'message required', retryable: true },
    })
  })

  it('rejects malformed JSON-RPC envelopes and unknown Task states', () => {
    expect(translateA2aPayload({ result: orchestrationResult }))
      .toMatchObject({ type: 'error', error: { code: 'malformed_response' } })
    expect(translateA2aPayload(rpc({
      kind: 'task',
      id: 'task-unknown',
      status: { state: 'mystery' },
    }))).toMatchObject({ type: 'error', error: { code: 'a2a_task_unknown' } })
  })
})

describe('public orchestration context validation', () => {
  const context = {
    message: 'Could you remind me how to get inside?',
    stage: 'arrival',
    eventType: 'guest-message',
    now: '2026-08-10T20:00:00.000Z',
    guest: sampleGuest,
    property: sampleProperty,
    memory: emptyMemory,
  }

  it('accepts the bounded application contract', () => {
    expect(validateRequestContext(context)).toBe(true)
  })

  it('rejects oversized messages and incomplete memory scope', () => {
    expect(validateRequestContext({ ...context, message: 'x'.repeat(2_001) })).toBe(false)
    expect(validateRequestContext({ ...context, memory: {} })).toBe(false)
  })
})
