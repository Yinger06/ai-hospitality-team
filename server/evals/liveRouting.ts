import type { AgentContext, AgentId, GuestMemory, Property } from '../../src/domain/types.js'
import { orchestrateWithAi } from '../orchestration/headButlerAi.js'
import { ManyfoldCodexRuntime } from '../runtime/manyfoldCodexRuntime.js'

const property: Property = {
  id: 'primrose-house',
  name: 'Primrose House',
  shortName: 'PH',
  location: 'Bloomsbury, London',
  address: '18 Tavistock Place, London WC1',
  hostName: 'Mia',
  personality: 'cute-playful',
  checkIn: '3:00 PM',
  checkOut: '11:00 AM',
  wifiName: 'Primrose_Guest',
  wifiPassword: 'teacup2026',
  emergencyPhone: '+44 20 7946 0182',
  knowledge: {
    accessInstructions: 'Use the lower brass keypad at the blue door and enter 2841#, then take the garden path on the left.',
    luggageInstructions: 'Guests may leave luggage with the host from 1:00 PM on arrival day.',
    houseRules: ['Quiet hours are from 10:00 PM to 7:00 AM.', 'The property is smoke-free.'],
    localRecommendations: {
      bloomsbury: ['The British Museum is a 10-minute walk from Primrose House.'],
      greenwich: ['The Thames Clipper from Embankment is a scenic route to Greenwich.'],
      vegetarian: ['Greenwich Market has vegetarian lunch stalls; opening hours should be checked.'],
    },
    emergencyServices: '999',
  },
  heroImage: '/assets/primrose-house.jpg',
}

const emptyMemory: GuestMemory = {
  preferences: [],
  visitedPlaces: [],
  futurePlans: [],
  importantRequests: [],
  conversationFacts: [],
  sentimentHistory: [],
  issues: [],
}

const baseContext = (message: string): AgentContext => ({
  message,
  stage: 'during-stay',
  guest: {
    id: 'eval-guest',
    name: 'Maya Chen',
    initials: 'MC',
    room: 'Garden Room',
    bookingCode: 'EVAL-001',
    arrivalDate: '14 Aug',
    departureDate: '18 Aug',
    companions: ['Leo Chen'],
    channel: 'Direct',
  },
  property,
  memory: emptyMemory,
  now: new Date().toISOString(),
  eventType: 'guest-message',
})

interface EvaluationCase {
  name: string
  message: string
  expectedAgents: AgentId[]
  forbiddenAgents?: AgentId[]
  expectedSeverity?: 'urgent'
}

const cases: EvaluationCase[] = [
  {
    name: 'paraphrased multi-intent',
    message: 'The galleries were brilliant today. The water never gets more than lukewarm, though, and we fancy taking a boat downriver to Greenwich tomorrow.',
    expectedAgents: ['guest-memory', 'guest-experience', 'local-guide', 'problem-solver'],
    forbiddenAgents: ['front-desk'],
  },
  {
    name: 'indirect urgent safety report',
    message: 'There is a strange smell like gas near the boiler and it seems to be getting stronger.',
    expectedAgents: ['problem-solver'],
    expectedSeverity: 'urgent',
  },
  {
    name: 'irrelevant friendly chat',
    message: 'We just made tea and are having a quiet evening. Hope you are having a nice night too!',
    expectedAgents: ['guest-experience'],
    forbiddenAgents: ['front-desk', 'local-guide', 'problem-solver'],
  },
]

const runtime = new ManyfoldCodexRuntime()
let failures = 0

for (const evaluation of cases) {
  try {
    const result = await orchestrateWithAi(baseContext(evaluation.message), { runtime })
    const activeAgents = result.decision.activations
      .filter((activation) => activation.agentId !== 'head-butler' && activation.status === 'done')
      .map((activation) => activation.agentId)
    const missing = evaluation.expectedAgents.filter((agent) => !activeAgents.includes(agent))
    const unexpected = (evaluation.forbiddenAgents ?? []).filter((agent) => activeAgents.includes(agent))
    const severityMismatch = evaluation.expectedSeverity && result.decision.severity !== evaluation.expectedSeverity
    const passed = !missing.length && !unexpected.length && !severityMismatch
    if (!passed) failures += 1

    console.log(JSON.stringify({
      case: evaluation.name,
      passed,
      activeAgents,
      missing,
      unexpected,
      intents: result.decision.intents,
      severity: result.decision.severity,
      modelCalls: result.trace?.modelCalls.map((call) => ({
        task: call.task,
        agentId: call.agentId,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      })),
      memoryChanges: result.trace?.memoryChanges,
      safetyRules: result.trace?.safetyRulesApplied,
    }, null, 2))
  } catch (error) {
    failures += 1
    console.error(JSON.stringify({
      case: evaluation.name,
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown evaluation failure',
    }))
  }
}

if (failures) process.exitCode = 1
