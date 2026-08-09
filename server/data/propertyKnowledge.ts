import type { KnowledgeKey, Property } from '../../src/domain/types.js'

export interface GroundedFact {
  key: KnowledgeKey
  value: string
}

export const retrievePropertyKnowledge = (
  property: Property,
  keys: KnowledgeKey[],
): GroundedFact[] => {
  const facts: Partial<Record<KnowledgeKey, string>> = {
    'check-in': `Check-in is from ${property.checkIn}.`,
    'check-out': `Check-out is by ${property.checkOut}.`,
    access: property.knowledge.accessInstructions,
    wifi: `Wi-Fi network: ${property.wifiName}. Password: ${property.wifiPassword}.`,
    luggage: property.knowledge.luggageInstructions,
    'emergency-contact': `Host emergency contact: ${property.emergencyPhone}. Emergency services: ${property.knowledge.emergencyServices}.`,
    'house-rules': property.knowledge.houseRules.join(' '),
    'local-bloomsbury': property.knowledge.localRecommendations.bloomsbury.join(' '),
    'local-greenwich': property.knowledge.localRecommendations.greenwich.join(' '),
    'local-vegetarian': property.knowledge.localRecommendations.vegetarian.join(' '),
  }

  return [...new Set(keys)].flatMap((key) => {
    const value = facts[key]
    return value ? [{ key, value }] : []
  })
}
