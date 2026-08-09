import type { AgentContext, AgentContribution, GuestMemory, SpecialistAgent } from '../domain/types'
import { detectSentiment, includesAny, unique } from './utils'

const extractMemory = (context: AgentContext): Partial<GuestMemory> => {
  const message = context.message.toLowerCase()
  const preferences: string[] = []
  const visitedPlaces: string[] = []
  const futurePlans: string[] = []
  const importantRequests: string[] = []
  const conversationFacts: string[] = []

  if (message.includes('quiet room')) preferences.push('Prefers a quiet room')
  if (message.includes('vegetarian')) preferences.push('Vegetarian-friendly food')
  if (message.includes('british museum')) visitedPlaces.push('British Museum')
  if (message.includes('greenwich')) futurePlans.push('Greenwich')
  if (message.includes('leave our bags') || message.includes('luggage')) {
    importantRequests.push('Early luggage drop')
  }
  if (message.includes('heathrow')) conversationFacts.push('Arriving via Heathrow around 12:30')
  if (includesAny(message, ['leo and i', 'maya and leo'])) conversationFacts.push('Travelling with Leo')

  return {
    preferences: unique(preferences),
    visitedPlaces: unique(visitedPlaces),
    futurePlans: unique(futurePlans),
    importantRequests: unique(importantRequests),
    conversationFacts: unique(conversationFacts),
    sentimentHistory: [detectSentiment(context.message)],
  }
}

export const guestMemoryAgent: SpecialistAgent = {
  id: 'guest-memory',
  name: 'Guest Memory',
  handles: ['memory-update'],
  run(context): AgentContribution {
    const patch = extractMemory(context)
    const learned = [
      ...(patch.preferences ?? []),
      ...(patch.visitedPlaces ?? []).map((place) => `Visited ${place}`),
      ...(patch.futurePlans ?? []).map((place) => `Plans: ${place}`),
      ...(patch.importantRequests ?? []),
      ...(patch.conversationFacts ?? []),
    ]

    return {
      agentId: 'guest-memory',
      intent: 'memory-update',
      summary: learned.length ? `Saved ${learned.join(' · ')}` : 'Updated sentiment history',
      responseParts: [],
      memoryPatch: patch,
    }
  },
}
