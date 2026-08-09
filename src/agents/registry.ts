import type { AgentId, FutureAgentId, SpecialistAgent } from '../domain/types'
import { frontDeskAgent } from './frontDesk'
import { guestExperienceAgent } from './guestExperience'
import { guestMemoryAgent } from './guestMemory'
import { localGuideAgent } from './localGuide'
import { problemSolverAgent } from './problemSolver'

export const agentRegistry: Record<Exclude<AgentId, 'head-butler'>, SpecialistAgent> = {
  'guest-memory': guestMemoryAgent,
  'front-desk': frontDeskAgent,
  'guest-experience': guestExperienceAgent,
  'local-guide': localGuideAgent,
  'problem-solver': problemSolverAgent,
}

export interface FutureAgentRegistration {
  id: FutureAgentId
  lifecycleStage: 'pre-booking'
  status: 'not-implemented'
  description: string
}

export const futureAgentSlots: FutureAgentRegistration[] = [
  {
    id: 'enquiry-pricing',
    lifecycleStage: 'pre-booking',
    status: 'not-implemented',
    description: 'Reserved extension point for host-governed enquiry and pricing decisions.',
  },
]
