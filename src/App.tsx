import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import AwayPanel from './components/AwayPanel'
import SetupPanel from './components/SetupPanel'
import ThisWeek from './components/ThisWeek'
import { useHousehold } from './hooks/useHousehold'
import { currentWeekKey } from './lib/weeks'
import './App.css'

type ActiveTab = 'week' | 'away' | 'setup'

const tabs: Array<{ id: ActiveTab; label: string; hint: string }> = [
  { id: 'week', label: 'This week', hint: 'Your chores' },
  { id: 'away', label: 'Away', hint: 'Mark holidays' },
  { id: 'setup', label: 'Setup', hint: 'Edit flat details' },
]

function App() {
  const {
    household,
    away,
    ready,
    setHousehold,
    setAway,
    toggleAway,
    resetToDefaults,
    copyShareLink,
  } = useHousehold()
  const [activeTab, setActiveTab] = useState<ActiveTab>('week')
  const [weekKey, setWeekKey] = useState('')

  useEffect(() => {
    if (ready && weekKey === '') {
      setWeekKey(currentWeekKey())
    }
  }, [ready, weekKey])

  const isLoading =
    !ready || weekKey === '' || household == null || away == null

  const activateTab = (tabId: ActiveTab) => {
    setActiveTab(tabId)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab)
    const lastIndex = tabs.length - 1
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1
    } else if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = lastIndex
    } else {
      return
    }

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    const tabButton = event.currentTarget.querySelector<HTMLButtonElement>(
      `#tab-${nextTab.id}`,
    )

    tabButton?.focus()
    activateTab(nextTab.id)
  }

  const renderPanel = () => {
    if (isLoading || household == null || away == null) {
      return (
        <section className="loading-card" aria-live="polite">
          <div className="loading-pulse" aria-hidden="true" />
          <p className="eyebrow">Loading household</p>
          <h2>Getting the rota ready</h2>
          <p>Flat Chores is checking saved people, chores, and away weeks.</p>
        </section>
      )
    }

    if (activeTab === 'away') {
      return (
        <AwayPanel
          household={household}
          away={away}
          weekKey={weekKey}
          onToggleAway={toggleAway}
        />
      )
    }

    if (activeTab === 'setup') {
      return (
        <SetupPanel
          household={household}
          away={away}
          onChange={setHousehold}
          onAwayChange={setAway}
          onReset={resetToDefaults}
          onCopyShareLink={copyShareLink}
        />
      )
    }

    return (
      <ThisWeek
        household={household}
        away={away}
        weekKey={weekKey}
        onWeekChange={setWeekKey}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Household rota</p>
          <h1>Flat Chores</h1>
          <p className="app-subtitle">
            Pick your name, see your chores for the week.
          </p>
        </div>
        <div className="header-chip" aria-label="Selected week">
          {weekKey || 'Preparing week'}
        </div>
      </header>

      <nav
        className="tab-list"
        aria-label="Flat Chores sections"
        role="tablist"
        onKeyDown={handleTabKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              className={`tab-button${isActive ? ' is-active' : ''}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => activateTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
            </button>
          )
        })}
      </nav>

      <main className="app-card">
        <div
          className="tab-panel"
          key={isLoading ? 'loading' : activeTab}
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
        >
          {renderPanel()}
        </div>
      </main>

      <footer className="install-hint">
        Add to Home Screen for a quick phone app.
      </footer>
    </div>
  )
}

export default App
