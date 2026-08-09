const stringArray = { type: 'array', items: { type: 'string' } }
const enumArray = (values: string[]) => ({
  type: 'array',
  items: { type: 'string', enum: values },
})

const intents = [
  'memory-update', 'practical-stay', 'local-discovery', 'problem', 'relationship', 'checkout', 'review',
]
const agents = ['guest-memory', 'front-desk', 'guest-experience', 'local-guide', 'problem-solver']
const severities = ['low', 'medium', 'high', 'urgent']
const knowledgeKeys = [
  'check-in', 'check-out', 'access', 'wifi', 'luggage', 'emergency-contact', 'house-rules',
  'local-bloomsbury', 'local-greenwich', 'local-vegetarian',
]
const memoryCandidate = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: ['preference', 'visited-place', 'future-plan', 'important-request', 'conversation-fact'],
    },
    value: { type: 'string' },
  },
  required: ['category', 'value'],
}

export const routeSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intents: enumArray(intents),
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'concerned', 'negative'] },
    severity: { type: 'string', enum: severities },
    rationale: { type: 'string' },
    selections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentId: { type: 'string', enum: agents },
          reason: { type: 'string' },
        },
        required: ['agentId', 'reason'],
      },
    },
    knowledgeKeys: enumArray(knowledgeKeys),
    memoryCandidates: { type: 'array', items: memoryCandidate },
  },
  required: [
    'intents', 'sentiment', 'severity', 'rationale', 'selections', 'knowledgeKeys', 'memoryCandidates',
  ],
}

export const specialistSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agentId: { type: 'string', enum: agents },
    intent: { type: 'string', enum: intents },
    summary: { type: 'string' },
    responseParts: stringArray,
    factsUsed: enumArray(knowledgeKeys),
    memoryCandidates: { type: 'array', items: memoryCandidate },
    issue: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            summary: { type: 'string' },
            severity: { type: 'string', enum: severities },
          },
          required: ['summary', 'severity'],
        },
      ],
    },
    escalation: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            severity: { type: 'string', enum: severities },
          },
          required: ['title', 'detail', 'severity'],
        },
      ],
    },
  },
  required: [
    'agentId', 'intent', 'summary', 'responseParts', 'factsUsed', 'memoryCandidates', 'issue', 'escalation',
  ],
}

export const synthesisSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    finalResponse: { type: 'string' },
    safetyNotes: stringArray,
  },
  required: ['finalResponse', 'safetyNotes'],
}
