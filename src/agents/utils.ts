import type { GuestMemory, Personality, Sentiment } from '../domain/types'

export const includesAny = (value: string, words: string[]) =>
  words.some((word) => value.toLowerCase().includes(word))

export const unique = <T>(values: T[]) => [...new Set(values)]

export const mergeMemory = (
  current: GuestMemory,
  patch: Partial<GuestMemory>,
): GuestMemory => ({
  preferences: unique([...current.preferences, ...(patch.preferences ?? [])]),
  visitedPlaces: unique([...current.visitedPlaces, ...(patch.visitedPlaces ?? [])]),
  futurePlans: unique([...current.futurePlans, ...(patch.futurePlans ?? [])]),
  importantRequests: unique([
    ...current.importantRequests,
    ...(patch.importantRequests ?? []),
  ]),
  conversationFacts: unique([
    ...current.conversationFacts,
    ...(patch.conversationFacts ?? []),
  ]).slice(-10),
  sentimentHistory: [...current.sentimentHistory, ...(patch.sentimentHistory ?? [])].slice(-12),
  issues: patch.issues ?? current.issues,
})

export const detectSentiment = (message: string): Sentiment => {
  if (includesAny(message, ['emergency', 'danger', 'flood', 'smoke', 'locked out'])) return 'negative'
  if (includesAny(message, ['broken', 'cold', 'not working', 'problem', 'upset', 'disappointed'])) {
    return 'concerned'
  }
  if (includesAny(message, ['wonderful', 'lovely', 'perfect', 'thank', 'five stars', 'good stay'])) {
    return 'positive'
  }
  return 'neutral'
}

export const styleClosing = (personality: Personality): string => {
  const closings: Record<Personality, string> = {
    'warm-professional': 'Please let me know if there is anything else I can arrange.',
    friendly: 'Just message me if you need anything else.',
    'cute-playful': 'I’m only a message away if you need a hand.',
    luxury: 'It would be my pleasure to arrange anything further.',
    minimal: 'Let me know if you need anything else.',
  }
  return closings[personality]
}
