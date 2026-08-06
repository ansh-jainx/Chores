import { useEffect, useMemo, useState } from 'react'
import type {
  AwayMap,
  Household,
  WeekAssignmentOverride,
  WeekOverrideMap,
} from '../types'
import { choresDueInWeek, isAway } from '../lib/scheduler'
import {
  buildSeedPairDrafts,
  refreshWeekTwoDraft,
  validateSeedWeek,
} from '../lib/seedRotaDraft'
import { addWeeks, currentWeekKey, formatWeekLabel } from '../lib/weeks'

interface SeedRotaPanelProps {
  household: Household
  away: AwayMap
  overrides: WeekOverrideMap
  onOverridesChange: (overrides: WeekOverrideMap) => void
}

function isWeekInputValue(value: string): boolean {
  return /^\d{4}-W\d{2}$/.test(value)
}

function SeedRotaPanel({
  household,
  away,
  overrides,
  onOverridesChange,
}: SeedRotaPanelProps) {
  const [startWeek, setStartWeek] = useState(currentWeekKey)
  const weekTwo = addWeeks(startWeek, 1)
  const [draftOne, setDraftOne] = useState<WeekAssignmentOverride>({})
  const [draftTwo, setDraftTwo] = useState<WeekAssignmentOverride>({})
  const [draftTwoEdited, setDraftTwoEdited] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const pair = buildSeedPairDrafts(household, away, startWeek, overrides)
    setDraftOne(pair.draftOne)
    setDraftTwo(pair.draftTwo)
    setDraftTwoEdited(false)
    setStatus('idle')
    setError('')
  }, [household, away, startWeek, weekTwo, overrides])

  const lockedWeeks = useMemo(
    () => Object.keys(overrides).sort(),
    [overrides],
  )

  const updateDraftOne = (next: WeekAssignmentOverride) => {
    setDraftOne(next)
    if (draftTwoEdited) {
      return
    }

    const refreshed = refreshWeekTwoDraft(
      household,
      away,
      startWeek,
      overrides,
      next,
    )
    if (refreshed !== null) {
      setDraftTwo(refreshed)
    }
  }

  const updateDraftTwo = (next: WeekAssignmentOverride) => {
    setDraftTwo(next)
    setDraftTwoEdited(true)
  }

  const handleSave = () => {
    const firstError =
      validateSeedWeek(household, away, startWeek, draftOne) ??
      validateSeedWeek(household, away, weekTwo, draftTwo)
    if (firstError) {
      setStatus('error')
      setError(firstError)
      return
    }

    const next: WeekOverrideMap = { ...overrides }
    next[startWeek] = { ...draftOne }
    next[weekTwo] = { ...draftTwo }
    onOverridesChange(next)
    setStatus('saved')
    setError('')
    window.setTimeout(() => setStatus('idle'), 1800)
  }

  const handleClearPair = () => {
    const next = { ...overrides }
    delete next[startWeek]
    delete next[weekTwo]
    onOverridesChange(next)
    setDraftTwoEdited(false)
    setStatus('idle')
    setError('')
  }

  const handleClearAll = () => {
    onOverridesChange({})
    setDraftTwoEdited(false)
    setStatus('idle')
    setError('')
  }

  const renderWeekEditor = (
    weekKey: string,
    draft: WeekAssignmentOverride,
    onDraftChange: (next: WeekAssignmentOverride) => void,
  ) => {
    const due = choresDueInWeek(household, weekKey)
    const assigned = new Set(Object.values(draft))
    const freePeople = household.people.filter(
      (person) => !assigned.has(person.id) && !isAway(away, person.id, weekKey),
    )

    return (
      <div className="seed-week" key={weekKey}>
        <h4>{formatWeekLabel(weekKey)}</h4>
        <p className="field-help">
          {freePeople.length === 1
            ? `Free: ${freePeople[0].name}`
            : freePeople.length === 0
              ? 'No free person (everyone assigned or away).'
              : `${freePeople.length} people free`}
        </p>
        <div className="setup-list">
          {due.map((chore) => (
            <label className="field" key={chore.id}>
              <span>{chore.name}</span>
              <select
                value={draft[chore.id] ?? ''}
                onChange={(event) =>
                  onDraftChange({ ...draft, [chore.id]: event.target.value })
                }
              >
                <option value="" disabled>
                  Choose person
                </option>
                {household.people.map((person) => {
                  const awayThisWeek = isAway(away, person.id, weekKey)
                  return (
                    <option
                      key={person.id}
                      value={person.id}
                      disabled={awayThisWeek}
                    >
                      {person.name}
                      {awayThisWeek ? ' (holiday)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <section className="setup-section" aria-labelledby="setup-seed-heading">
      <div className="setup-section__header">
        <h3 id="setup-seed-heading">Start rota (2 weeks)</h3>
      </div>
      <p className="field-help">
        Lock who does what for two starting weeks. Later weeks auto-rotate from
        that history. Add trips in the Holidays tab first so away people are
        skipped from week 3 onward.
      </p>

      <label className="field">
        <span>First week</span>
        <input
          type="week"
          value={startWeek}
          onChange={(event) => {
            const value = event.target.value
            if (isWeekInputValue(value)) {
              setStartWeek(value)
            }
          }}
        />
      </label>

      <div className="seed-week-grid">
        {renderWeekEditor(startWeek, draftOne, updateDraftOne)}
        {renderWeekEditor(weekTwo, draftTwo, updateDraftTwo)}
      </div>

      <div className="field-row seed-actions">
        <button type="button" className="primary-button" onClick={handleSave}>
          Save start weeks
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={handleClearPair}
        >
          Unlock these two
        </button>
        {lockedWeeks.length > 0 ? (
          <button
            type="button"
            className="danger-button"
            onClick={handleClearAll}
          >
            Clear all locks
          </button>
        ) : null}
      </div>

      <p className="field-help" aria-live="polite">
        {status === 'saved'
          ? 'Start weeks saved. Open This week to browse the rota.'
          : status === 'error'
            ? error
            : lockedWeeks.length > 0
              ? `Locked weeks: ${lockedWeeks.join(', ')}`
              : 'No weeks locked yet — the rota is fully automatic.'}
      </p>
    </section>
  )
}

export default SeedRotaPanel
