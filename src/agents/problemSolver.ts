import type { AgentContext, AgentContribution, GuestIssue, Severity, SpecialistAgent } from '../domain/types'
import { includesAny } from './utils'

const assessSeverity = (message: string): Severity => {
  if (includesAny(message, ['fire', 'smoke', 'gas', 'medical', 'danger', 'flood'])) return 'urgent'
  if (includesAny(message, ['locked out', 'no power', 'no water'])) return 'high'
  if (includesAny(message, ['cold', 'heating', 'broken', 'not working'])) return 'medium'
  return 'low'
}

const issueSummary = (context: AgentContext) => {
  const text = context.message.toLowerCase()
  if (text.includes('shower') && text.includes('cold')) return 'Shower water is cold'
  if (text.includes('wifi') || text.includes('wi-fi')) return 'Wi-Fi is not working'
  if (text.includes('heating')) return 'Heating problem'
  if (text.includes('locked out')) return 'Guest is locked out'
  return 'Guest-reported stay issue'
}

export const problemSolverAgent: SpecialistAgent = {
  id: 'problem-solver',
  name: 'Problem Solver',
  handles: ['problem'],
  run(context): AgentContribution {
    const severity = assessSeverity(context.message)
    const summary = issueSummary(context)
    const issue: GuestIssue = {
      id: `issue-${Date.now()}`,
      summary,
      severity,
      status: severity === 'low' ? 'open' : 'escalated',
      openedAt: context.now,
    }
    const guestFacingIssue: Record<string, string> = {
      'Shower water is cold': 'shower running cold',
      'Wi-Fi is not working': 'Wi-Fi trouble',
      'Heating problem': 'heating problem',
      'Guest is locked out': 'lockout',
      'Guest-reported stay issue': 'stay issue',
    }
    const urgent = severity === 'urgent'
    const response = urgent
      ? `I’m sorry — your safety comes first. Please leave the immediate area if needed and call emergency services on 999. I’ve alerted ${context.property.hostName}, your host, for immediate human support.`
      : `I’m sorry about the ${guestFacingIssue[summary]}. I’ve flagged it to ${context.property.hostName}, your host, now, and it will be checked in person rather than leave you troubleshooting it.`

    return {
      agentId: 'problem-solver',
      intent: 'problem',
      summary: `Assessed “${summary}” as ${severity} and ${severity === 'low' ? 'logged it' : 'escalated to the host'}`,
      responseParts: [response],
      issue,
      escalation:
        severity === 'low'
          ? undefined
          : {
              title: summary,
              detail: urgent
                ? `Immediate attention needed. Guest safety instructions sent; call ${context.property.emergencyPhone}.`
                : `Please inspect the ${context.guest.room} and update the guest within 15 minutes.`,
              severity,
            },
    }
  },
}
