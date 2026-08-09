import type { AgentContribution, SpecialistAgent } from '../domain/types'

export const localGuideAgent: SpecialistAgent = {
  id: 'local-guide',
  name: 'Local Guide',
  handles: ['local-discovery'],
  run(context): AgentContribution {
    const message = context.message.toLowerCase()
    const remembersGreenwich =
      message.includes('greenwich') || context.memory.futurePlans.includes('Greenwich')
    const wantsVegetarian =
      message.includes('vegetarian') || context.memory.preferences.includes('Vegetarian-friendly food')

    let recommendation = 'I can put together a short local plan around the pace and food you enjoy.'
    if (remembersGreenwich && wantsVegetarian) {
      recommendation = 'For Greenwich, try the market for an easy vegetarian lunch, then walk through the park to the observatory. Midday is livelier; 11:30 is the gentler window.'
    } else if (remembersGreenwich) {
      recommendation = 'For Greenwich tomorrow, the river boat from Westminster is the scenic route; the market and park make a lovely unhurried afternoon.'
    }

    return {
      agentId: 'local-guide',
      intent: 'local-discovery',
      summary: remembersGreenwich
        ? 'Built a Greenwich suggestion using saved plans and food preferences'
        : 'Prepared a personalised local suggestion',
      responseParts: [recommendation],
    }
  },
}
