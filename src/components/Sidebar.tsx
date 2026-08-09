import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Inbox,
  LayoutDashboard,
  RotateCcw,
  Settings,
  UsersRound,
  X,
} from 'lucide-react'
import { demoJourney, sampleGuest } from '../data/sampleData'
import type { StayStage } from '../domain/types'

const nav = [
  { label: 'Today', icon: LayoutDashboard },
  { label: 'Guest inbox', icon: Inbox, active: true, badge: 1 },
  { label: 'Stays', icon: CalendarDays },
  { label: 'Guests', icon: UsersRound },
]

interface SidebarProps {
  demoIndex: number
  stage: StayStage
  isOpen: boolean
  onClose: () => void
  onReset: () => void
  onRunStep: (index: number) => void
}

export const Sidebar = ({ demoIndex, stage, isOpen, onClose, onReset, onRunStep }: SidebarProps) => (
  <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
    <div className="sidebar-mobile-head mobile-only">
      <strong>Navigation</strong>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
    </div>
    <nav className="primary-nav" aria-label="Primary navigation">
      {nav.map((item) => (
        <button key={item.label} className={item.active ? 'active' : ''} type="button">
          <item.icon size={17} />
          <span>{item.label}</span>
          {item.badge ? <b>{item.badge}</b> : null}
        </button>
      ))}
    </nav>

    <section className="guest-mini-card">
      <div className="section-label">Active guest</div>
      <div className="guest-row">
        <span className="guest-avatar">{sampleGuest.initials}</span>
        <div>
          <strong>{sampleGuest.name}</strong>
          <span>{sampleGuest.room}</span>
        </div>
        <ChevronRight size={16} />
      </div>
      <div className="stay-dates">
        <span>{sampleGuest.arrivalDate}</span>
        <i />
        <span>{sampleGuest.departureDate}</span>
        <small>4 nights</small>
      </div>
    </section>

    <section className="journey-section">
      <div className="journey-heading">
        <div>
          <span className="section-label">Live demo</span>
          <strong>Guest journey</strong>
        </div>
        <button className="icon-button subtle" type="button" onClick={onReset} title="Reset demo" aria-label="Reset demo">
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="journey-list">
        {demoJourney.map((step, index) => {
          const complete = index < demoIndex
          const current = index === demoIndex
          return (
            <button
              key={step.id}
              className={`${complete ? 'complete' : ''} ${current ? 'current' : ''}`}
              type="button"
              onClick={() => onRunStep(index)}
            >
              <span className="journey-node">{complete ? <Check size={11} /> : index + 1}</span>
              <span>
                <strong>{step.label}</strong>
                {current ? <small>{step.helper}</small> : null}
              </span>
            </button>
          )
        })}
      </div>
    </section>

    <div className="sidebar-footer">
      <button type="button"><CircleUserRound size={17} /><span>Team</span></button>
      <button type="button"><Settings size={17} /><span>Settings</span></button>
      <span className="environment-pill"><i /> Demo data</span>
      <span className="sr-only">Current stage: {stage}</span>
    </div>
  </aside>
)
