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
export type AgentRunStatus = 'idle' | 'queued' | 'working' | 'done' | 'skipped'

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
}

export interface RouteDecision {
  traceId: string
  intents: Intent[]
  sentiment: Sentiment
  rationale: string
  activations: AgentActivation[]
}

export interface OrchestrationResult {
  decision: RouteDecision
  contributions: AgentContribution[]
  finalResponse: string
  memory: GuestMemory
  escalation?: AgentContribution['escalation']
}

export interface SpecialistAgent {
  id: Exclude<AgentId, 'head-butler'>
  name: string
  handles: Intent[]
  run: (context: AgentContext, intents: Intent[]) => AgentContribution | null
}

export interface DemoStep {
  id: string
  label: string
  stage: StayStage
  kind: 'guest' | 'booking' | 'host' | 'review'
  message: string
  helper: string
}
