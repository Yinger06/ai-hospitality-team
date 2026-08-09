import { BellRing, ChevronDown, Command, Menu } from 'lucide-react'
import type { Personality, Property } from '../domain/types'

const personalityLabels: Record<Personality, string> = {
  'warm-professional': 'Warm & Professional',
  friendly: 'Friendly',
  'cute-playful': 'Cute & Playful',
  luxury: 'Luxury',
  minimal: 'Minimal',
}

interface AppHeaderProps {
  property: Property
  onPersonalityChange: (value: Personality) => void
  onOpenMobileNav: () => void
}

export const AppHeader = ({ property, onPersonalityChange, onOpenMobileNav }: AppHeaderProps) => (
  <header className="app-header">
    <div className="brand-lockup">
      <button className="icon-button mobile-only" type="button" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu size={19} />
      </button>
      <span className="brand-mark"><Command size={18} /></span>
      <div>
        <strong>AI Hospitality Team</strong>
        <span>Guest operations</span>
      </div>
    </div>

    <div className="header-actions">
      <div className="property-switcher">
        <img src={property.heroImage} alt="Primrose House exterior" />
        <div>
          <strong>{property.name}</strong>
          <span>{property.location}</span>
        </div>
        <ChevronDown size={15} />
      </div>
      <label className="personality-select">
        <span>Voice</span>
        <select
          value={property.personality}
          onChange={(event) => onPersonalityChange(event.target.value as Personality)}
        >
          {Object.entries(personalityLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <ChevronDown size={14} />
      </label>
      <button className="icon-button notification-button" type="button" aria-label="Notifications">
        <BellRing size={18} />
        <span />
      </button>
      <span className="host-avatar" aria-label={`${property.hostName}, host`}>MA</span>
    </div>
  </header>
)
