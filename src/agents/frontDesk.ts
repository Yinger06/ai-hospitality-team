import type { AgentContribution, SpecialistAgent } from '../domain/types'
import { includesAny } from './utils'

export const frontDeskAgent: SpecialistAgent = {
  id: 'front-desk',
  name: 'Front Desk',
  handles: ['practical-stay', 'checkout'],
  run(context, intents): AgentContribution | null {
    const text = context.message.toLowerCase()
    const parts: string[] = []

    if (includesAny(text, ['bags', 'luggage', 'before check-in'])) {
      parts.push(`You’re very welcome to leave your bags with us from 1:00 PM, before check-in at ${context.property.checkIn}.`)
    }
    if (includesAny(text, ['blue door', 'get in', 'outside', 'key', 'keys'])) {
      if (context.stage === 'check-out') {
        parts.push(`For check-out by ${context.property.checkOut}, just leave both keys in the little brass bowl inside the blue door.`)
      } else {
        parts.push('Use the lower brass keypad at the blue door and enter 2841#, then take the garden path on your left.')
      }
    }
    if (includesAny(text, ['wi-fi', 'wifi', 'internet', 'password'])) {
      parts.push(`The Wi-Fi is “${context.property.wifiName}” and the password is “${context.property.wifiPassword}”.`)
    }
    if (context.eventType === 'booking-event') {
      parts.push(`Check-in is from ${context.property.checkIn}; I’ll share the simple door instructions before you arrive.`)
    }
    if (intents.includes('checkout') && !parts.some((part) => part.includes('check-out'))) {
      parts.push(`Check-out is by ${context.property.checkOut}; keys can go in the brass bowl inside the blue door.`)
    }

    if (!parts.length) return null
    return {
      agentId: 'front-desk',
      intent: intents.includes('checkout') ? 'checkout' : 'practical-stay',
      summary: 'Prepared the relevant stay instructions',
      responseParts: parts,
    }
  },
}
