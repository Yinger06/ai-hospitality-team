import type { AgentContribution, SpecialistAgent } from '../domain/types'
import { detectSentiment, styleClosing } from './utils'

const hasUnresolvedIssue = (issues: { status: string }[]) =>
  issues.some((issue) => issue.status !== 'resolved')

const voiceCopy = {
  'warm-professional': {
    welcome: 'We’re looking forward to making your stay comfortable from the moment you arrive.',
    farewell: 'We hope to have the pleasure of welcoming you both again.',
    reviewAsk: 'If you have a moment, we’d be grateful if you shared your experience.',
    reviewReply: 'We would be delighted to welcome you both back.',
  },
  friendly: {
    welcome: 'We can’t wait to help you both feel at home in London.',
    farewell: 'We’d love to see you both here again.',
    reviewAsk: 'If you have a minute, we’d love to hear how the stay felt.',
    reviewReply: 'Come and stay again whenever London calls.',
  },
  'cute-playful': {
    welcome: 'The blue door is already looking forward to your arrival.',
    farewell: 'The blue door will be very happy to see you both again.',
    reviewAsk: 'If you have a minute, we’d be grateful if you shared how your stay felt.',
    reviewReply: 'The blue door will be very happy to see you both again.',
  },
  luxury: {
    welcome: 'We look forward to preparing a thoughtful and seamless stay for you both.',
    farewell: 'We would be honoured to welcome you both back to Primrose House.',
    reviewAsk: 'Should you wish to share your experience, your reflections would be greatly valued.',
    reviewReply: 'It would be our pleasure to welcome you both back.',
  },
  minimal: {
    welcome: 'We look forward to welcoming you both.',
    farewell: 'You’re welcome back anytime.',
    reviewAsk: 'We’d value a short review of your stay.',
    reviewReply: 'We hope to host you both again.',
  },
} as const

export const guestExperienceAgent: SpecialistAgent = {
  id: 'guest-experience',
  name: 'Guest Experience',
  handles: ['relationship', 'checkout', 'review'],
  run(context, intents): AgentContribution {
    const sentiment = detectSentiment(context.message)
    const firstName = context.guest.name.split(' ')[0]
    const voice = voiceCopy[context.property.personality]
    const parts: string[] = []
    let summary = 'Adjusted tone to match the guest’s experience'

    if (context.eventType === 'booking-event') {
      parts.push(`Hi ${firstName} — thank you for choosing ${context.property.name}. The Head Butler and house team are looking forward to welcoming you and Leo to London. ${voice.welcome}`)
      summary = 'Wrote a warm, personal booking welcome'
    } else if (context.eventType === 'review-event') {
      if (sentiment === 'positive') {
        parts.push(`Thank you, ${firstName}! It was such a pleasure hosting you and Leo. I’m glad the shower wobble was only a small chapter in a lovely stay. ${voice.reviewReply}`)
        summary = 'Prepared a personal response to a positive review'
      } else {
        parts.push(`Thank you for sharing this, ${firstName}. I’m sorry we missed the mark. The host team is reviewing what happened and will follow up with you directly.`)
        summary = 'Acknowledged a negative review without being defensive'
      }
    } else if (context.eventType === 'host-action' && context.stage === 'problem-resolution') {
      parts.push(`A quick update, ${firstName}: the shower mixer has been reset and the hot water is running properly again. I’m sorry it interrupted your evening — would you mind checking it when convenient?`)
      summary = 'Turned the host fix into an empathetic recovery follow-up'
    } else if (context.eventType === 'host-action' && context.stage === 'review-follow-up') {
      if (hasUnresolvedIssue(context.memory.issues)) {
        parts.push('I’m holding the review request for now because there’s still an unresolved stay issue. The host should follow up personally first.')
        summary = 'Held review request due to an unresolved issue'
      } else {
        const memoryMoment = context.memory.visitedPlaces.includes('British Museum')
          ? 'From the British Museum to your Greenwich day, it was lovely being part of the trip.'
          : 'It was lovely having you both at the house.'
        parts.push(`Hi ${firstName} — ${memoryMoment} ${voice.reviewAsk} Safe travels. ${voice.farewell}`)
        summary = 'Approved and personalised the review request using stay memories'
      }
    } else {
      if (sentiment === 'positive' || context.message.toLowerCase().includes('british museum')) {
        parts.push(context.message.toLowerCase().includes('british museum')
          ? 'The British Museum is a wonderful way to spend the day — I’m so glad you enjoyed it.'
          : 'I’m so glad to hear that.')
      }
      if (intents.includes('checkout')) {
        parts.push(`Thank you for staying with us, ${firstName}. It’s been a pleasure having you and Leo here. ${voice.farewell}`)
        summary = 'Added a warm, personal departure note'
      }
      if (context.stage === 'arrival' && sentiment === 'neutral') {
        parts.push('I’ll stay close by while you get settled.')
      }
      if (context.stage === 'during-stay' && sentiment === 'positive' && !intents.includes('problem')) {
        parts.push(styleClosing(context.property.personality))
      }
    }

    return {
      agentId: 'guest-experience',
      intent: intents.includes('review') ? 'review' : intents.includes('checkout') ? 'checkout' : 'relationship',
      summary,
      responseParts: parts,
    }
  },
}
