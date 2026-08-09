import { describe, expect, it } from 'vitest'
import { demoJourney, emptyMemory, sampleGuest, sampleProperty } from '../data/sampleData'
import type { AgentContext, GuestMemory } from '../domain/types'
import { futureAgentSlots } from '../agents/registry'
import { orchestrate, resolveLatestIssue } from './headButler'

const contextFor = (
  message: string,
  overrides: Partial<AgentContext> = {},
): AgentContext => ({
  message,
  stage: 'during-stay',
  guest: sampleGuest,
  property: sampleProperty,
  memory: emptyMemory,
  now: '2026-08-16T18:00:00.000Z',
  eventType: 'guest-message',
  ...overrides,
})

describe('Head Butler orchestration', () => {
  it('routes a multi-intent message to four specialists and skips Front Desk', () => {
    const result = orchestrate(contextFor(demoJourney[4].message))
    const activeAgents = result.decision.activations
      .filter((activation) => activation.status === 'done')
      .map((activation) => activation.agentId)

    expect(result.decision.intents).toEqual(expect.arrayContaining([
      'memory-update',
      'local-discovery',
      'problem',
      'relationship',
    ]))
    expect(activeAgents).toEqual(expect.arrayContaining([
      'head-butler',
      'guest-memory',
      'guest-experience',
      'local-guide',
      'problem-solver',
    ]))
    expect(result.decision.activations.find((item) => item.agentId === 'front-desk')?.status).toBe('skipped')
  })

  it('persists useful stay facts and creates a host escalation', () => {
    const result = orchestrate(contextFor(demoJourney[4].message))

    expect(result.memory.visitedPlaces).toContain('British Museum')
    expect(result.memory.futurePlans).toContain('Greenwich')
    expect(result.memory.issues[0]).toMatchObject({
      summary: 'Shower water is cold',
      severity: 'medium',
      status: 'escalated',
    })
    expect(result.escalation?.title).toBe('Shower water is cold')
    expect(result.finalResponse).toContain('British Museum')
    expect(result.finalResponse).toContain('Mia')
    expect(result.finalResponse).toContain('Greenwich')
    expect(result.finalResponse).toContain('shower running cold')
    expect(result.finalResponse.indexOf('British Museum')).toBeLessThan(result.finalResponse.indexOf('shower running cold'))
    expect(result.finalResponse.indexOf('shower running cold')).toBeLessThan(result.finalResponse.indexOf('Greenwich'))
  })

  it('uses saved plans and current preferences in a later local recommendation', () => {
    const first = orchestrate(contextFor(demoJourney[4].message))
    const second = orchestrate(contextFor(demoJourney[5].message, {
      stage: 'problem-resolution',
      memory: first.memory,
    }))

    expect(second.finalResponse).toContain('Greenwich')
    expect(second.finalResponse).toContain('vegetarian')
    expect(second.memory.preferences).toContain('Vegetarian-friendly food')
  })

  it('marks the latest issue resolved and produces a recovery follow-up', () => {
    const issueMemory: GuestMemory = {
      ...emptyMemory,
      issues: [{
        id: 'issue-1',
        summary: 'Shower water is cold',
        severity: 'medium',
        status: 'escalated',
        openedAt: '2026-08-16T18:00:00.000Z',
      }],
    }
    const resolved = resolveLatestIssue(issueMemory, demoJourney[6].message)
    const result = orchestrate(contextFor(demoJourney[6].message, {
      stage: 'problem-resolution',
      eventType: 'host-action',
      memory: resolved,
    }))

    expect(resolved.issues[0].status).toBe('resolved')
    expect(result.finalResponse).toContain('hot water is running properly again')
    expect(result.finalResponse).toContain('mind checking it')
  })

  it('holds review requests until all issues are resolved', () => {
    const unresolvedMemory: GuestMemory = {
      ...emptyMemory,
      issues: [{
        id: 'issue-2',
        summary: 'Heating problem',
        severity: 'high',
        status: 'escalated',
        openedAt: '2026-08-17T10:00:00.000Z',
      }],
    }
    const result = orchestrate(contextFor('The guest has checked out.', {
      stage: 'review-follow-up',
      eventType: 'host-action',
      memory: unresolvedMemory,
    }))

    expect(result.finalResponse).toContain('holding the review request')
    expect(result.finalResponse).toContain('unresolved stay issue')
  })

  it('personalises an approved review request with journey memory', () => {
    const memory: GuestMemory = {
      ...emptyMemory,
      visitedPlaces: ['British Museum'],
      futurePlans: ['Greenwich'],
      issues: [{
        id: 'issue-3',
        summary: 'Shower water is cold',
        severity: 'medium',
        status: 'resolved',
        openedAt: '2026-08-16T18:00:00.000Z',
        resolution: 'Mixer reset',
      }],
    }
    const result = orchestrate(contextFor(demoJourney[8].message, {
      stage: 'review-follow-up',
      eventType: 'host-action',
      memory,
    }))

    expect(result.finalResponse).toContain('British Museum')
    expect(result.finalResponse).toContain('Greenwich')
    expect(result.finalResponse).toContain('shared how your stay felt')
  })

  it('changes generated copy when the property voice changes', () => {
    const warm = orchestrate(contextFor(demoJourney[0].message, {
      stage: 'booking-confirmed',
      eventType: 'booking-event',
      property: { ...sampleProperty, personality: 'warm-professional' },
    }))
    const minimal = orchestrate(contextFor(demoJourney[0].message, {
      stage: 'booking-confirmed',
      eventType: 'booking-event',
      property: { ...sampleProperty, personality: 'minimal' },
    }))

    expect(warm.finalResponse).toContain('comfortable from the moment you arrive')
    expect(minimal.finalResponse).toContain('We look forward to welcoming you both.')
    expect(warm.finalResponse).not.toBe(minimal.finalResponse)
  })

  it('keeps a registry slot for pre-booking without implementing pricing', () => {
    expect(futureAgentSlots).toEqual([
      expect.objectContaining({
        id: 'enquiry-pricing',
        lifecycleStage: 'pre-booking',
        status: 'not-implemented',
      }),
    ])
  })
})
