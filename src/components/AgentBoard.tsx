import {
  Bell,
  BookHeart,
  Check,
  CircleDashed,
  Crown,
  HeartHandshake,
  MapPinned,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { AgentActivation, AgentId, GuestMemory, OrchestrationResult } from '../domain/types'

interface AgentMeta {
  name: string
  role: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  color: string
}

const agentMeta: Record<AgentId, AgentMeta> = {
  'head-butler': { name: 'Head Butler', role: 'Orchestrator', icon: Crown, color: 'mustard' },
  'guest-memory': { name: 'Guest Memory', role: 'Context keeper', icon: BookHeart, color: 'iris' },
  'front-desk': { name: 'Front Desk', role: 'Stay logistics', icon: Bell, color: 'blue' },
  'guest-experience': { name: 'Guest Experience', role: 'Care & relationship', icon: HeartHandshake, color: 'rose' },
  'local-guide': { name: 'Local Guide', role: 'Local discovery', icon: MapPinned, color: 'green' },
  'problem-solver': { name: 'Problem Solver', role: 'Issues & recovery', icon: Wrench, color: 'coral' },
}

const defaultActivations: AgentActivation[] = (Object.keys(agentMeta) as AgentId[]).map((agentId) => ({
  agentId,
  status: 'idle',
  task: agentId === 'head-butler' ? 'Waiting for a guest message' : 'Available when needed',
}))

const statusLabel = (activation: AgentActivation) => {
  if (activation.status === 'working') return 'Working'
  if (activation.status === 'done') return 'Done'
  if (activation.status === 'skipped') return 'Skipped'
  if (activation.status === 'queued') return 'Queued'
  if (activation.status === 'failed') return 'Failed'
  return 'Idle'
}

interface AgentBoardProps {
  activations: AgentActivation[]
  result: OrchestrationResult | null
  memory: GuestMemory
  isProcessing: boolean
  error: string | null
}

export const AgentBoard = ({ activations, result, memory, isProcessing, error }: AgentBoardProps) => {
  const runs = activations.length ? activations : defaultActivations
  const head = runs.find((activation) => activation.agentId === 'head-butler')!
  const specialists = runs.filter((activation) => activation.agentId !== 'head-butler')
  const memoryItems = [
    ...memory.preferences.map((value) => ({ label: 'Preference', value })),
    ...memory.visitedPlaces.map((value) => ({ label: 'Visited', value })),
    ...memory.futurePlans.map((value) => ({ label: 'Plan', value })),
    ...memory.importantRequests.map((value) => ({ label: 'Request', value })),
    ...memory.conversationFacts.map((value) => ({ label: 'Detail', value })),
  ].slice(-6)
  const latestIssue = memory.issues.at(-1)

  return (
    <aside className="agent-panel">
      <header className="agent-panel-header">
        <div>
          <span className="eyebrow">Live orchestration</span>
          <h2>Your small hotel team</h2>
        </div>
        <span className={`live-indicator ${isProcessing ? 'processing' : ''}`}><i />{isProcessing ? 'Live' : 'Ready'}</span>
      </header>

      <div className={`agent-network ${isProcessing ? 'network-active' : ''}`}>
        <div className="connector connector-left" />
        <div className="connector connector-right" />
        <AgentCard activation={head} featured />
        <div className="specialist-grid">
          {specialists.map((activation) => <AgentCard key={activation.agentId} activation={activation} />)}
        </div>
      </div>

      {result ? (
        <section className="trace-summary">
          <div className="trace-title">
            <Sparkles size={14} />
            <strong>One response synthesised</strong>
            <span>{result.decision.intents.length} intent{result.decision.intents.length === 1 ? '' : 's'}</span>
          </div>
          <p>{result.decision.rationale}</p>
          <div className="intent-chips">
            {result.decision.intents.map((intent) => <span key={intent}>{intent.replace('-', ' ')}</span>)}
          </div>
          {result.trace ? (
            <div className="runtime-summary">
              <div>
                <strong>{result.trace.mode === 'manyfold-runtime' ? 'Manyfold live AI' : 'Test fixture mode'}</strong>
                <span>
                  {result.trace.modelCalls.length}{' '}
                  {result.trace.mode === 'manyfold-runtime' ? 'model call' : 'fixture step'}
                  {result.trace.modelCalls.length === 1 ? '' : 's'} · {(result.trace.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="model-trace-list">
                {result.trace.modelCalls.map((call) => (
                  <span key={call.id} title={call.reason}>
                    {call.task === 'specialist' ? call.agentId.replace('-', ' ') : call.task}
                    <b>{call.model}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <section className="orchestration-error">
          <TriangleAlert size={17} />
          <div><strong>AI run stopped safely</strong><span>{error}</span></div>
        </section>
      ) : null}

      {result?.escalation ? (
        <section className="escalation-card">
          <span className="escalation-icon"><ShieldAlert size={17} /></span>
          <div>
            <span>Human review required · {result.escalation.severity}</span>
            <strong>{result.escalation.title}</strong>
            <p>{result.escalation.detail}</p>
          </div>
        </section>
      ) : latestIssue?.status === 'resolved' ? (
        <section className="resolved-card"><Check size={15} /><span><strong>Recovered</strong>{latestIssue.summary}</span></section>
      ) : null}

      <section className="memory-section">
        <div className="memory-heading">
          <div><BookHeart size={15} /><strong>Guest memory</strong></div>
          <span>{memoryItems.length} saved</span>
        </div>
        {memoryItems.length ? (
          <div className="memory-list">
            {memoryItems.map((item, index) => (
              <div key={`${item.label}-${item.value}-${index}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-memory">
            <CircleDashed size={18} />
            <span>Useful preferences, plans, and stay details will appear here.</span>
          </div>
        )}
      </section>
    </aside>
  )
}

const AgentCard = ({ activation, featured = false }: { activation: AgentActivation; featured?: boolean }) => {
  const meta = agentMeta[activation.agentId]
  const Icon = meta.icon
  return (
    <article className={`agent-card agent-${activation.status} tone-${meta.color} ${featured ? 'featured' : ''}`}>
      <div className="agent-card-top">
        <span className="agent-icon"><Icon size={featured ? 19 : 16} strokeWidth={1.8} /></span>
        <div>
          <strong>{meta.name}</strong>
          <span>{meta.role}</span>
        </div>
        <span className="agent-status"><i />{statusLabel(activation)}</span>
      </div>
      <p>{['done', 'failed'].includes(activation.status) && activation.result ? activation.result : activation.task}</p>
      {activation.status === 'working' ? <div className="work-bar"><span /></div> : null}
    </article>
  )
}
