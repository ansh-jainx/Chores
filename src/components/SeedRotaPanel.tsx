import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AwayMap,
  Household,
  WeekAssignmentOverride,
  WeekOverrideMap,
} from '../types'
import { choresDueInWeek, isAway } from '../lib/scheduler'
import { buildWeekDraft, validateSeedWeek } from '../lib/seedRotaDraft'
import { parseSeedHistoryImport } from '../lib/seedRotaImport'
import { addWeeks, currentWeekKey, formatWeekLabel } from '../lib/weeks'

interface SeedRotaPanelProps {
  household: Household
  away: AwayMap
  overrides: WeekOverrideMap
  onOverridesChange: (overrides: WeekOverrideMap) => void
}

const MIN_WEEKS = 2
const MAX_WEEKS = 12

function isWeekInputValue(value: string): boolean {
  return /^\d{4}-W\d{2}$/.test(value)
}

function weekKeysFromStart(startWeek: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addWeeks(startWeek, index))
}

function buildDraftsForRange(
  household: Household,
  away: AwayMap,
  weekKeys: string[],
  overrides: WeekOverrideMap,
): Record<string, WeekAssignmentOverride> {
  const drafts: Record<string, WeekAssignmentOverride> = {}
  const provisional: WeekOverrideMap = { ...overrides }

  for (const weekKey of weekKeys) {
    const draft = buildWeekDraft(household, away, weekKey, provisional)
    drafts[weekKey] = draft
    provisional[weekKey] = draft
  }

  return drafts
}

function SeedRotaPanel({
  household,
  away,
  overrides,
  onOverridesChange,
}: SeedRotaPanelProps) {
  const [startWeek, setStartWeek] = useState(currentWeekKey)
  const [weekCount, setWeekCount] = useState(2)
  const [weekText, setWeekText] = useState(currentWeekKey)
  const [drafts, setDrafts] = useState<Record<string, WeekAssignmentOverride>>(
    {},
  )
  const manualWeeksRef = useRef<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'imported'>(
    'idle',
  )
  const [error, setError] = useState('')
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const weekKeys = useMemo(
    () => weekKeysFromStart(startWeek, weekCount),
    [startWeek, weekCount],
  )

  useEffect(() => {
    setWeekText(startWeek)
  }, [startWeek])

  useEffect(() => {
    setDrafts(buildDraftsForRange(household, away, weekKeys, overrides))
    manualWeeksRef.current = new Set()
    setStatus('idle')
    setError('')
  }, [household, away, weekKeys, overrides])

  const lockedWeeks = useMemo(
    () => Object.keys(overrides).sort(),
    [overrides],
  )

  const applyStartWeek = (next: string) => {
    if (!isWeekInputValue(next)) {
      return
    }
    setStartWeek(next)
  }

  const updateDraft = (weekKey: string, next: WeekAssignmentOverride) => {
    const updatedManual = new Set(manualWeeksRef.current).add(weekKey)
    manualWeeksRef.current = updatedManual

    setDrafts((currentDrafts) => {
      const updated = { ...currentDrafts, [weekKey]: next }
      const provisional: WeekOverrideMap = { ...overrides }
      for (const key of weekKeys) {
        provisional[key] = updated[key] ?? {}
      }

      let sawEdited = false
      for (const key of weekKeys) {
        if (key === weekKey) {
          sawEdited = true
          continue
        }
        if (!sawEdited) {
          continue
        }
        if (updatedManual.has(key)) {
          provisional[key] = updated[key] ?? {}
          continue
        }
        if (
          overrides[key] !== undefined &&
          Object.keys(overrides[key]).length > 0
        ) {
          provisional[key] = overrides[key]
          updated[key] = { ...overrides[key] }
          continue
        }
        updated[key] = buildWeekDraft(household, away, key, provisional)
        provisional[key] = updated[key]
      }
      return updated
    })
  }

  const handleSave = () => {
    for (const weekKey of weekKeys) {
      const draft = drafts[weekKey] ?? {}
      const validationError = validateSeedWeek(household, away, weekKey, draft)
      if (validationError) {
        setStatus('error')
        setError(validationError)
        return
      }
    }

    const next: WeekOverrideMap = { ...overrides }
    for (const weekKey of weekKeys) {
      next[weekKey] = { ...drafts[weekKey] }
    }
    onOverridesChange(next)
    manualWeeksRef.current = new Set()
    setStatus('saved')
    setError('')
    window.setTimeout(() => setStatus('idle'), 1800)
  }

  const handleClearRange = () => {
    const next = { ...overrides }
    for (const weekKey of weekKeys) {
      delete next[weekKey]
    }
    onOverridesChange(next)
    manualWeeksRef.current = new Set()
    setStatus('idle')
    setError('')
  }

  const handleClearAll = () => {
    onOverridesChange({})
    manualWeeksRef.current = new Set()
    setStatus('idle')
    setError('')
  }

  const handleImport = () => {
    const result = parseSeedHistoryImport(household, importText)
    if (!result.ok) {
      setStatus('error')
      setError(result.error)
      return
    }

    onOverridesChange({ ...overrides, ...result.overrides })
    const importedKeys = Object.keys(result.overrides).sort()
    if (importedKeys.length > 0) {
      applyStartWeek(importedKeys[0])
      setWeekCount(
        Math.min(
          MAX_WEEKS,
          Math.max(MIN_WEEKS, importedKeys.length),
        ),
      )
    }
    manualWeeksRef.current = new Set()
    setImportOpen(false)
    setStatus('imported')
    setError(
      result.warnings.length > 0
        ? `Imported ${importedKeys.length} week(s). Notes: ${result.warnings.slice(0, 3).join(' · ')}`
        : '',
    )
    window.setTimeout(() => setStatus('idle'), 2400)
  }

  const renderWeekEditor = (weekKey: string) => {
    const draft = drafts[weekKey] ?? {}
    const due = choresDueInWeek(household, weekKey)
    const assigned = new Set(Object.values(draft))
    const freePeople = household.people.filter(
      (person) => !assigned.has(person.id) && !isAway(away, person.id, weekKey),
    )
    const locked = overrides[weekKey] !== undefined

    return (
      <div className="seed-week" key={weekKey}>
        <h4>
          {formatWeekLabel(weekKey)}
          {locked ? <span className="seed-week__lock"> locked</span> : null}
        </h4>
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
                  updateDraft(weekKey, {
                    ...draft,
                    [chore.id]: event.target.value,
                  })
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
        <h3 id="setup-seed-heading">Start rota / import history</h3>
      </div>
      <p className="field-help">
        Lock past or current weeks so auto rotation continues from real history.
        Use Prev/Next to pick any ISO week, or import JSON from an older chore
        wheel. Locked weeks may give one person multiple chores (matches an old
        wheel / holiday stacking).
      </p>

      <div className="field-row seed-week-nav">
        <button
          type="button"
          className="secondary-button"
          onClick={() => applyStartWeek(addWeeks(startWeek, -1))}
        >
          Prev week
        </button>
        <label className="field">
          <span>First week (YYYY-Www)</span>
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            value={weekText}
            aria-invalid={weekText !== '' && !isWeekInputValue(weekText)}
            onChange={(event) => setWeekText(event.target.value.toUpperCase())}
            onBlur={() => {
              if (isWeekInputValue(weekText)) {
                applyStartWeek(weekText)
              } else {
                setWeekText(startWeek)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isWeekInputValue(weekText)) {
                event.preventDefault()
                applyStartWeek(weekText)
              }
            }}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => applyStartWeek(addWeeks(startWeek, 1))}
        >
          Next week
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => applyStartWeek(currentWeekKey())}
        >
          This week
        </button>
        <label className="field field-zone">
          <span>Weeks to edit</span>
          <select
            value={weekCount}
            onChange={(event) => {
              setWeekCount(Number(event.target.value))
              manualWeeksRef.current = new Set()
            }}
          >
            {Array.from({ length: MAX_WEEKS - MIN_WEEKS + 1 }, (_, index) => {
              const count = MIN_WEEKS + index
              return (
                <option value={count} key={count}>
                  {count}
                </option>
              )
            })}
          </select>
        </label>
      </div>

      <p className="field-help">
        Editing {formatWeekLabel(weekKeys[0])}
        {weekKeys.length > 1
          ? ` → ${formatWeekLabel(weekKeys[weekKeys.length - 1])}`
          : ''}
        .
      </p>

      <div className="seed-week-grid">
        {weekKeys.map((weekKey) => renderWeekEditor(weekKey))}
      </div>

      <div className="field-row seed-actions">
        <button type="button" className="primary-button" onClick={handleSave}>
          Save these weeks
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={handleClearRange}
        >
          Unlock this range
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setImportOpen((open) => !open)}
        >
          {importOpen ? 'Hide import' : 'Import history JSON'}
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

      {importOpen ? (
        <div className="seed-import">
          <p className="field-help">
            Paste weeks from an older chore wheel. Chore and person values can be
            ids or names, e.g.{' '}
            <code>{`{"2026-W28":{"kitchen":"Person 1","bath-up":"Person 3"}}`}</code>
          </p>
          <label className="field">
            <span>History JSON</span>
            <textarea
              rows={8}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              spellCheck={false}
              placeholder='{"2026-W28":{"kitchen":"Person 1","bath-up":"Person 3","bath-down":"Person 2","hallway":"Person 5","cardboard":"Person 4"}}'
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={handleImport}
          >
            Merge import into locks
          </button>
        </div>
      ) : null}

      {lockedWeeks.length > 0 ? (
        <div className="seed-locked-list">
          <p className="field-help">Locked weeks — tap to edit from there:</p>
          <div className="seed-locked-chips">
            {lockedWeeks.map((weekKey) => (
              <button
                key={weekKey}
                type="button"
                className="secondary-button"
                onClick={() => applyStartWeek(weekKey)}
              >
                {weekKey}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="field-help" aria-live="polite">
        {status === 'saved'
          ? 'Weeks saved. Later auto weeks rotate from this history.'
          : status === 'imported'
            ? error || 'History imported.'
            : status === 'error'
              ? error
              : lockedWeeks.length > 0
                ? `${lockedWeeks.length} locked week(s) on file.`
                : 'No weeks locked yet — the rota is fully automatic.'}
      </p>
    </section>
  )
}

export default SeedRotaPanel
