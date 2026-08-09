import type { ChatMessage, StayStage } from '../domain/types'

export interface IncomingMessage {
  body: string
  stage: StayStage
  source: 'demo' | 'manual'
}

export interface MessageAdapter {
  receive: (message: IncomingMessage) => Promise<IncomingMessage>
  send: (message: ChatMessage) => Promise<ChatMessage>
}

// The demo adapter mirrors the boundary where WhatsApp, a PMS, or an OTA inbox can plug in later.
export const simulatedMessageAdapter: MessageAdapter = {
  receive: async (message) => message,
  send: async (message) => message,
}
