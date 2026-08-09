import type {
  Intent,
  KnowledgeKey,
  MemoryCandidate,
  Sentiment,
  Severity,
  SpecialistAgentId,
} from '../../src/domain/types.js'
import { ModelRuntimeError } from '../runtime/modelRuntime.js'

export interface RoutePlan {
  intents: Intent[]
  sentiment: Sentiment
  severity: Severity
  rationale: string
  selections: Array<{ agentId: SpecialistAgentId; reason: string }>
  knowledgeKeys: KnowledgeKey[]
  memoryCandidates: MemoryCandidate[]
}

export interface SpecialistPlan {
  agentId: SpecialistAgentId
  intent: Intent
  summary: string
  responseParts: string[]
  factsUsed: KnowledgeKey[]
  memoryCandidates: MemoryCandidate[]
  issue?: {
    summary: string
    severity: Severity
  }
  escalation?: {
    title: string
    detail: string
    severity: Severity
  }
}

export interface SynthesisPlan {
  finalResponse: string
  safetyNotes: string[]
}

const intentValues: Intent[] = [
  'memory-update', 'practical-stay', 'local-discovery', 'problem', 'relationship', 'checkout', 'review',
]
const agentValues: SpecialistAgentId[] = [
  'guest-memory', 'front-desk', 'guest-experience', 'local-guide', 'problem-solver',
]
const sentimentValues: Sentiment[] = ['positive', 'neutral', 'concerned', 'negative']
const severityValues: Severity[] = ['low', 'medium', 'high', 'urgent']
const knowledgeValues: KnowledgeKey[] = [
  'check-in', 'check-out', 'access', 'wifi', 'luggage', 'emergency-contact', 'house-rules',
  'local-bloomsbury', 'local-greenwich', 'local-vegetarian',
]
const memoryCategories: MemoryCandidate['category'][] = [
  'preference', 'visited-place', 'future-plan', 'important-request', 'conversation-fact',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cleanText = (value: unknown, field: string, max = 800) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ModelRuntimeError('malformed-output', `Model field ${field} was invalid.`)
  }
  return value.trim().slice(0, max)
}

const metaInstruction = /^(?:(?:warmly\s+)?(?:acknowledge|respond|mention|mirror|offer|express|recognise|recognize|reassure)|tell the guest|thank the guest|keep (?:the )?tone)\b/i
const guestFacingText = (value: unknown, field: string, max = 800) => {
  const text = cleanText(value, field, max)
  if (metaInstruction.test(text)) {
    throw new ModelRuntimeError('malformed-output', `Model field ${field} was not guest-facing copy.`)
  }
  return text
}

const enumArray = <T extends string>(value: unknown, allowed: T[], field: string): T[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && allowed.includes(item as T))) {
    throw new ModelRuntimeError('malformed-output', `Model field ${field} was invalid.`)
  }
  return [...new Set(value as T[])]
}

const memoryCandidates = (value: unknown): MemoryCandidate[] => {
  if (!Array.isArray(value)) throw new ModelRuntimeError('malformed-output', 'Memory candidates were invalid.')
  return value.slice(0, 8).map((candidate) => {
    if (!isRecord(candidate) || !memoryCategories.includes(candidate.category as MemoryCandidate['category'])) {
      throw new ModelRuntimeError('malformed-output', 'A memory candidate was invalid.')
    }
    return {
      category: candidate.category as MemoryCandidate['category'],
      value: cleanText(candidate.value, 'memory value', 160),
    }
  })
}

export const validateRoutePlan = (value: unknown): RoutePlan => {
  if (!isRecord(value) || !Array.isArray(value.selections)) {
    throw new ModelRuntimeError('malformed-output', 'The Head Butler route was invalid.')
  }
  const selections = value.selections.slice(0, agentValues.length).map((selection) => {
    if (!isRecord(selection) || !agentValues.includes(selection.agentId as SpecialistAgentId)) {
      throw new ModelRuntimeError('malformed-output', 'A specialist selection was invalid.')
    }
    return {
      agentId: selection.agentId as SpecialistAgentId,
      reason: cleanText(selection.reason, 'selection reason', 180),
    }
  })
  return {
    intents: enumArray(value.intents, intentValues, 'intents'),
    sentiment: sentimentValues.includes(value.sentiment as Sentiment) ? value.sentiment as Sentiment : 'neutral',
    severity: severityValues.includes(value.severity as Severity) ? value.severity as Severity : 'low',
    rationale: cleanText(value.rationale, 'rationale', 240),
    selections: selections.filter((selection, index) =>
      selections.findIndex((item) => item.agentId === selection.agentId) === index),
    knowledgeKeys: enumArray(value.knowledgeKeys, knowledgeValues, 'knowledge keys'),
    memoryCandidates: memoryCandidates(value.memoryCandidates),
  }
}

export const validateSpecialistPlan = (value: unknown): SpecialistPlan => {
  if (!isRecord(value)) throw new ModelRuntimeError('malformed-output', 'A specialist response was invalid.')
  const agentId = value.agentId as SpecialistAgentId
  if (!agentValues.includes(agentId)) throw new ModelRuntimeError('malformed-output', 'Specialist identity was invalid.')
  const intents = enumArray([value.intent], intentValues, 'specialist intent')
  if (!Array.isArray(value.responseParts)) throw new ModelRuntimeError('malformed-output', 'Response parts were invalid.')
  const issue = value.issue === null ? undefined : value.issue
  const escalation = value.escalation === null ? undefined : value.escalation
  return {
    agentId,
    intent: intents[0] ?? 'relationship',
    summary: cleanText(value.summary, 'specialist summary', 180),
    responseParts: value.responseParts.slice(0, 4).map((part) => guestFacingText(part, 'response part', 700)),
    memoryCandidates: memoryCandidates(value.memoryCandidates),
    factsUsed: enumArray(value.factsUsed, knowledgeValues, 'facts used'),
    issue: isRecord(issue) ? {
      summary: cleanText(issue.summary, 'issue summary', 180),
      severity: severityValues.includes(issue.severity as Severity) ? issue.severity as Severity : 'medium',
    } : undefined,
    escalation: isRecord(escalation) ? {
      title: cleanText(escalation.title, 'escalation title', 180),
      detail: cleanText(escalation.detail, 'escalation detail', 300),
      severity: severityValues.includes(escalation.severity as Severity) ? escalation.severity as Severity : 'medium',
    } : undefined,
  }
}

export const validateSynthesisPlan = (value: unknown): SynthesisPlan => {
  if (!isRecord(value) || !Array.isArray(value.safetyNotes)) {
    throw new ModelRuntimeError('malformed-output', 'The synthesis response was invalid.')
  }
  return {
    finalResponse: guestFacingText(value.finalResponse, 'final response', 2_000),
    safetyNotes: value.safetyNotes.slice(0, 6).map((note) => cleanText(note, 'safety note', 180)),
  }
}
