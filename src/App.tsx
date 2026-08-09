import { useState } from 'react'
import { AgentBoard } from './components/AgentBoard'
import { AppHeader } from './components/AppHeader'
import { Conversation } from './components/Conversation'
import { Sidebar } from './components/Sidebar'
import { demoJourney } from './data/sampleData'
import { useGuestJourney } from './hooks/useGuestJourney'
import './styles.css'

export default function App() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const guestJourney = useGuestJourney()

  return (
    <div className="app-shell">
      <AppHeader
        property={guestJourney.property}
        onPersonalityChange={guestJourney.changePersonality}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />
      <div className="workspace-grid">
        <Sidebar
          demoIndex={guestJourney.demoIndex}
          stage={guestJourney.stage}
          isOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          onReset={guestJourney.resetDemo}
          onRunStep={(index) => {
            if (!guestJourney.isProcessing) {
              void guestJourney.runStep(demoJourney[index], index)
              setMobileNavOpen(false)
            }
          }}
        />
        {mobileNavOpen ? <button className="sidebar-scrim" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Dismiss navigation" /> : null}
        <Conversation
          messages={guestJourney.messages}
          stage={guestJourney.stage}
          demoIndex={guestJourney.demoIndex}
          isProcessing={guestJourney.isProcessing}
          onSend={(message) => void guestJourney.processEvent(message)}
          onRunNext={guestJourney.runNextStep}
        />
        <AgentBoard
          activations={guestJourney.activations}
          result={guestJourney.result}
          memory={guestJourney.memory}
          isProcessing={guestJourney.isProcessing}
          error={guestJourney.orchestrationError}
        />
      </div>
    </div>
  )
}
