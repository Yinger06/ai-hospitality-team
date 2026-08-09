export const stayStages = [
  'booking-confirmed',
  'pre-arrival',
  'arrival',
  'during-stay',
  'problem-resolution',
  'check-out',
  'review-follow-up',
] as const

export type StayStage = (typeof stayStages)[number]
export type FutureStayStage = 'pre-booking'

export type Personality =
  | 'warm-professional'
  | 'friendly'
  | 'cute-playful'
  | 'luxury'
  | 'minimal'

export type AgentId =
  | 'head-butler'
  | 'guest-memory'
  | 'front-desk'
  | 'guest-experience'
  | 'local-guide'
  | 'problem-solver'

export type FutureAgentId = 'enquiry-pricing'

export type Intent =
  | 'memory-update'
  | 'practical-stay'
  | 'local-discovery'
  | 'problem'
  | 'relationship'
  | 'checkout'
  | 'review'

export type Sentiment = 'positive' | 'neutral' | 'concerned' | 'negative'
export type Severity = 'low' | 'medium' | 'high' | 'urgent'
export type AgentRunStatus = 'idle' | 'queued' | 'working' | 'done' | 'skipped' | 'failed'
export type SpecialistAgentId = Exclude<AgentId, 'head-butler'>
export type ModelTask = 'routing' | 'specialist' | 'synthesis'
export type ModelTier = 'economy' | 'reasoning'
export type RuntimeMode = 'manyfold-runtime' | 'test-fixture' | 'unavailable'

export type KnowledgeKey =
  | 'check-in'
  | 'check-out'
  | 'access'
  | 'wifi'
  | 'luggage'
  | 'emergency-contact'
  | 'house-rules'
  | 'local-bloomsbury'
  | 'local-greenwich'
  | 'local-vegetarian'

export type MemoryCategory =
  | 'preference'
  | 'visited-place'
  | 'future-plan'
  | 'important-request'
  | 'conversation-fact'

export interface MemoryCandidate {
  category: MemoryCategory
  value: string
}

export interface PropertyKnowledge {
  accessInstructions: string
  luggageInstructions: string
  houseRules: string[]
  localRecommendations: Record<'bloomsbury' | 'greenwich' | 'vegetarian', string[]>
  emergencyServices: string
}

export interface Property {
  id: string
  name: string
  shortName: string
  location: string
  address: string
  hostName: string
  personality: Personality
  checkIn: string
  checkOut: string
  wifiName: string
  wifiPassword: string
  emergencyPhone: string
  knowledge: PropertyKnowledge
  heroImage: string
}

export interface GuestProfile {
  id: string
  name: string
  initials: string
  room: string
  bookingCode: string
  arrivalDate: string
  departureDate: string
  companions: string[]
  channel: 'Direct' | 'Airbnb' | 'Booking.com' | 'Trip.com'
}

export interface GuestIssue {
  id: string
  summary: string
  severity: Severity
  status: 'open' | 'escalated' | 'resolved'
  openedAt: string
  resolution?: string
}

export interface GuestMemory {
  preferences: string[]
  visitedPlaces: string[]
  futurePlans: string[]
  importantRequests: string[]
  conversationFacts: string[]
  sentimentHistory: Sentiment[]
  issues: GuestIssue[]
}

export interface ChatMessage {
  id: string
  sender: 'guest' | 'host' | 'system'
  body: string
  timestamp: string
  stage: StayStage
  traceId?: string
  label?: string
}

export interface AgentContext {
  message: string
  stage: StayStage
  guest: GuestProfile
  property: Property
  memory: GuestMemory
  now: string
  eventType: 'guest-message' | 'booking-event' | 'host-action' | 'review-event'
}

export interface AgentContribution {
  agentId: AgentId
  intent: Intent
  summary: string
  responseParts: string[]
  memoryPatch?: Partial<GuestMemory>
  issue?: GuestIssue
  escalation?: {
    title: string
    detail: string
    severity: Severity
  }
}

export interface AgentActivation {
  agentId: AgentId
  status: AgentRunStatus
  task: string
  result?: string
  selectedBecause?: string
  model?: string
}

export interface RouteDecision {
  traceId: string
  intents: Intent[]
  sentiment: Sentiment
  severity: Severity
  rationale: string
  activations: AgentActivation[]
  knowledgeKeys?: KnowledgeKey[]
}

export interface ModelCallTrace {
  id: string
  task: ModelTask
  agentId: AgentId
  model: string
  tier: ModelTier
  reason: string
  durationMs: number
  status: 'completed' | 'failed'
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
}

export interface OrchestrationTrace {
  mode: RuntimeMode
  startedAt: string
  durationMs: number
  modelCalls: ModelCallTrace[]
  groundedKnowledge: KnowledgeKey[]
  memoryChanges: MemoryCandidate[]
  safetyRulesApplied: string[]
  policyRulesApplied: string[]
}

export interface OrchestrationResult {
  decision: RouteDecision
  contributions: AgentContribution[]
  finalResponse: string
  memory: GuestMemory
  escalation?: AgentContribution['escalation']
  trace?: OrchestrationTrace
}

export interface SpecialistAgent {
  id: SpecialistAgentId
  name: string
  handles: Intent[]
  run: (context: AgentContext, intents: Intent[]) => AgentContribution | null
}

export type OrchestrationStreamEvent =
  | { type: 'route'; decision: RouteDecision }
  | { type: 'agent-start'; agentId: SpecialistAgentId }
  | { type: 'agent-done'; activation: AgentActivation }
  | { type: 'final'; result: OrchestrationResult }
  | { type: 'error'; error: { code: string; message: string; retryable: boolean } }

export interface DemoStep {
  id: string
  label: string
  stage: StayStage
  kind: 'guest' | 'booking' | 'host' | 'review'
  message: string
  helper: string
}
