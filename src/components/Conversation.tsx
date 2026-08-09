import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, CheckCheck, Ellipsis, Paperclip, Play, Sparkles } from 'lucide-react'
import { demoJourney, sampleGuest } from '../data/sampleData'
import type { ChatMessage, StayStage } from '../domain/types'

const stageLabel: Record<StayStage, string> = {
  'booking-confirmed': 'Booking confirmed',
  'pre-arrival': 'Pre-arrival',
  arrival: 'Arrival',
  'during-stay': 'During stay',
  'problem-resolution': 'Problem resolution',
  'check-out': 'Check-out',
  'review-follow-up': 'Review follow-up',
}

interface ConversationProps {
  messages: ChatMessage[]
  stage: StayStage
  demoIndex: number
  isProcessing: boolean
  onSend: (value: string) => void
  onRunNext: () => void
}

export const Conversation = ({ messages, stage, demoIndex, isProcessing, onSend, onRunNext }: ConversationProps) => {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const nextStep = demoJourney[demoIndex]

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [isProcessing, messages])

  const submit = () => {
    if (!draft.trim() || isProcessing) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <main className="conversation-panel">
      <header className="conversation-header">
        <div className="conversation-guest">
          <span className="guest-avatar large">{sampleGuest.initials}</span>
          <div>
            <div><strong>{sampleGuest.name}</strong><span className="online-dot" /></div>
            <span>{sampleGuest.channel} · {sampleGuest.bookingCode} · {sampleGuest.room}</span>
          </div>
        </div>
        <div className="conversation-meta">
          <span className="stage-pill">{stageLabel[stage]}</span>
          <button className="icon-button" type="button" aria-label="More conversation actions"><Ellipsis size={19} /></button>
        </div>
      </header>

      <div className="chat-scroll" aria-live="polite">
        <div className="date-separator"><span>Guest conversation</span></div>
        {messages.map((message) => (
          <article key={message.id} className={`message message-${message.sender}`}>
            {message.sender === 'host' ? <span className="message-avatar"><Bot size={15} /></span> : null}
            <div className="message-content">
              {message.label ? <span className="message-label">{message.label}</span> : null}
              <div className="message-bubble">{message.body}</div>
              <small>
                {message.timestamp}
                {message.sender === 'host' ? <CheckCheck size={13} /> : null}
                {message.traceId ? <span>Coordinated by Head Butler</span> : null}
              </small>
            </div>
          </article>
        ))}
        {isProcessing ? (
          <article className="message message-host typing-message">
            <span className="message-avatar"><Bot size={15} /></span>
            <div className="message-content">
              <div className="message-bubble"><i /><i /><i /><span>Team is coordinating</span></div>
            </div>
          </article>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="composer-wrap">
        {nextStep ? (
          <button className="next-scene" type="button" onClick={onRunNext} disabled={isProcessing}>
            <span className="next-scene-icon"><Play size={14} fill="currentColor" /></span>
            <span>
              <small>Next demo moment</small>
              <strong>{nextStep.label}</strong>
            </span>
            <span className="next-scene-helper">{nextStep.helper}</span>
          </button>
        ) : (
          <div className="journey-complete"><Sparkles size={15} /><span>Full guest journey complete</span></div>
        )}
        <div className="composer">
          <button className="icon-button subtle" type="button" aria-label="Attach file"><Paperclip size={18} /></button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="Write as the guest…"
            rows={1}
          />
          <button className="send-button" type="button" onClick={submit} disabled={!draft.trim() || isProcessing} aria-label="Send guest message">
            <ArrowUp size={18} />
          </button>
        </div>
        <p><Sparkles size={12} /> Head Butler will choose only the specialists this message needs</p>
      </div>
    </main>
  )
}
