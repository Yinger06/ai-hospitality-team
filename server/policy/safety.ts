import type { AgentContribution, AgentContext, Severity } from '../../src/domain/types.js'

export interface SafetyAssessment {
  severity: Severity
  rules: string[]
  escalation?: NonNullable<AgentContribution['escalation']>
  urgentGuestGuidance?: string
}

interface SafetyRule {
  id: string
  pattern: RegExp
  severity: Severity
  title: string
  guidance: (context: AgentContext) => string
}

const rules: SafetyRule[] = [
  {
    id: 'life-safety-fire-gas',
    pattern: /\b(smoke|fire|gas (?:leak|smell)|smell(?:s|ing)? like gas|carbon monoxide)\b/i,
    severity: 'urgent',
    title: 'Possible fire or gas safety incident',
    guidance: (context) => `Please leave the property immediately if it is safe to do so and call emergency services on ${context.property.knowledge.emergencyServices}. Then contact ${context.property.hostName} on ${context.property.emergencyPhone}.`,
  },
  {
    id: 'medical-emergency',
    pattern: /\b(can(?:not|'t) breathe|unconscious|medical emergency|severe bleeding|chest pain)\b/i,
    severity: 'urgent',
    title: 'Possible medical emergency',
    guidance: (context) => `Please call emergency services on ${context.property.knowledge.emergencyServices} now. Contact ${context.property.hostName} on ${context.property.emergencyPhone} when you can do so safely.`,
  },
  {
    id: 'immediate-property-risk',
    pattern: /\b(electrical sparks?|major flood|water (?:is )?pouring|break[- ]in|someone threatening)\b/i,
    severity: 'urgent',
    title: 'Immediate property or security risk',
    guidance: (context) => `Move to a safe place and call emergency services on ${context.property.knowledge.emergencyServices} if there is immediate danger. Contact ${context.property.hostName} on ${context.property.emergencyPhone}.`,
  },
]

export const assessSafety = (context: AgentContext): SafetyAssessment => {
  const match = rules.find((rule) => rule.pattern.test(context.message))
  if (!match) return { severity: 'low', rules: [] }
  return {
    severity: match.severity,
    rules: [match.id],
    escalation: {
      title: match.title,
      detail: 'Human review is required immediately. No automated operational action has been taken.',
      severity: match.severity,
    },
    urgentGuestGuidance: match.guidance(context),
  }
}

const unauthorisedActionClaims = [
  /\bI(?:'ve| have) (?:issued|processed) (?:a )?refund\b/i,
  /\bI(?:'ve| have) booked\b/i,
  /\bI(?:'ve| have) (?:notified|contacted|alerted)\b/i,
  /\bmaintenance (?:has been|is) dispatched\b/i,
  /\bcompensation (?:has been|is) approved\b/i,
]

export const assertNoUnauthorisedActionClaim = (response: string) => {
  if (unauthorisedActionClaims.some((pattern) => pattern.test(response))) {
    throw new Error('Model response claimed an unauthorised external action')
  }
}
