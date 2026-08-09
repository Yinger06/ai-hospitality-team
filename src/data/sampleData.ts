import type { DemoStep, GuestMemory, GuestProfile, Property } from '../domain/types'

export const sampleProperty: Property = {
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
    houseRules: [
      'Quiet hours are from 10:00 PM to 7:00 AM.',
      'The property is smoke-free.',
    ],
    localRecommendations: {
      bloomsbury: [
        'The British Museum is a 10-minute walk from Primrose House.',
        'Russell Square station is the closest Underground station.',
      ],
      greenwich: [
        'The Thames Clipper from Embankment is a scenic route to Greenwich.',
        'Greenwich Market is close to the Cutty Sark and the riverside.',
      ],
      vegetarian: [
        'Greenwich Market has several vegetarian lunch stalls, but opening hours should be checked before travel.',
      ],
    },
    emergencyServices: '999',
  },
  heroImage: '/assets/primrose-house.jpg',
}

export const sampleGuest: GuestProfile = {
  id: 'maya-chen',
  name: 'Maya Chen',
  initials: 'MC',
  room: 'Garden Room',
  bookingCode: 'PH-2841',
  arrivalDate: '14 Aug',
  departureDate: '18 Aug',
  companions: ['Leo Chen'],
  channel: 'Direct',
}

export const emptyMemory: GuestMemory = {
  preferences: [],
  visitedPlaces: [],
  futurePlans: [],
  importantRequests: [],
  conversationFacts: [],
  sentimentHistory: [],
  issues: [],
}

export const demoJourney: DemoStep[] = [
  {
    id: 'booking',
    label: 'Booking confirmed',
    stage: 'booking-confirmed',
    kind: 'booking',
    message: 'Booking PH-2841 has been confirmed for Maya and Leo Chen, 14–18 August.',
    helper: 'Guest Experience creates a personal welcome',
  },
  {
    id: 'pre-arrival',
    label: 'Pre-arrival',
    stage: 'pre-arrival',
    kind: 'guest',
    message: 'Hi Mia! Leo and I land at Heathrow around 12:30. We prefer a quiet room if possible, and is it okay to leave our bags before check-in?',
    helper: 'Memory + Front Desk + Guest Experience',
  },
  {
    id: 'arrival',
    label: 'Arrival',
    stage: 'arrival',
    kind: 'guest',
    message: "We’re at the blue door now. How do we get in?",
    helper: 'Front Desk handles access',
  },
  {
    id: 'settled',
    label: 'Settled in',
    stage: 'during-stay',
    kind: 'guest',
    message: 'We are in and the garden room is lovely. What is the Wi-Fi password?',
    helper: 'Front Desk + Guest Experience',
  },
  {
    id: 'multi-intent',
    label: 'Multi-intent moment',
    stage: 'during-stay',
    kind: 'guest',
    message: 'We had a wonderful day at the British Museum. The shower seems a little cold though. We’re going to Greenwich tomorrow.',
    helper: 'Four specialists coordinate at once',
  },
  {
    id: 'local',
    label: 'Local planning',
    stage: 'problem-resolution',
    kind: 'guest',
    message: 'A relaxed lunch in Greenwich would be perfect. Somewhere vegetarian-friendly?',
    helper: 'Local Guide uses remembered plans and preferences',
  },
  {
    id: 'recovery',
    label: 'Problem recovery',
    stage: 'problem-resolution',
    kind: 'host',
    message: 'The shower mixer has been reset and hot water is working again.',
    helper: 'Host resolution triggers a thoughtful follow-up',
  },
  {
    id: 'checkout',
    label: 'Check-out',
    stage: 'check-out',
    kind: 'guest',
    message: 'All sorted, thank you! We had such a good stay. What should we do with the keys tomorrow?',
    helper: 'Front Desk + Guest Experience prepare departure',
  },
  {
    id: 'review-request',
    label: 'Review request',
    stage: 'review-follow-up',
    kind: 'host',
    message: 'The guest has checked out and all reported issues are resolved.',
    helper: 'Review policy checks experience history first',
  },
  {
    id: 'review',
    label: 'Review received',
    stage: 'review-follow-up',
    kind: 'review',
    message: 'Five stars — a lovely little stay, and Mia fixed the shower so quickly. We would happily come back!',
    helper: 'Guest Experience writes a personal response',
  },
]
