import { useState } from 'react'
import { encodeShareHash } from '../lib/share'
import type {
  AwayMap,
  BathZone,
  Cadence,
  Chore,
  Household,
  Person,
} from '../types'

interface SetupPanelProps {
  household: Household
  away: AwayMap
  onChange: (household: Household) => void
  onAwayChange: (away: AwayMap) => void
  onReset: () => void
  onCopyShareLink: () => Promise<string>
}

const bathZones: BathZone[] = ['up', 'down']
const cadences: Cadence[] = ['weekly', 'biweekly']
const cleanName = (value: string, fallback: string) => value.trim() || fallback

const slugify = (value: string, fallback: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || fallback
}

const randomSuffix = () => Math.random().toString(36).slice(2, 7)

const makeUniqueId = (
  name: string,
  existingIds: Iterable<string>,
  fallback: string,
) => {
  const takenIds = new Set(existingIds)
  const baseId = slugify(name, fallback)

  if (!takenIds.has(baseId)) {
    return baseId
  }

  let id = `${baseId}-${randomSuffix()}`
  while (takenIds.has(id)) {
    id = `${baseId}-${randomSuffix()}`
  }

  return id
}

function SetupPanel({
  household,
  away,
  onChange,
  onAwayChange,
  onReset,
  onCopyShareLink,
}: SetupPanelProps) {
  const [copyStatus, setCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'error'
  >('idle')
  const [shareUrl, setShareUrl] = useState('')
  const hasBlankNames =
    household.people.some((person) => person.name.trim().length === 0) ||
    household.chores.some((chore) => chore.name.trim().length === 0)

  const updateHousehold = (changes: Partial<Household>) => {
    onChange({ ...household, ...changes })
  }

  const updatePerson = (personId: string, changes: Partial<Person>) => {
    updateHousehold({
      people: household.people.map((person) =>
        person.id === personId ? { ...person, ...changes } : person,
      ),
    })
  }

  const addPerson = () => {
    const name = 'New person'
    const person: Person = {
      id: makeUniqueId(
        name,
        household.people.map((person) => person.id),
        'person',
      ),
      name,
      bathZone: 'up',
    }

    updateHousehold({ people: [...household.people, person] })
  }

  const removePerson = (personId: string) => {
    updateHousehold({
      people: household.people.filter((person) => person.id !== personId),
    })

    if (personId in away) {
      const nextAway = { ...away }
      delete nextAway[personId]
      onAwayChange(nextAway)
    }
  }

  const finalizePersonName = (personId: string, value: string) => {
    const name = cleanName(value, 'Unnamed person')

    if (name !== value) {
      updatePerson(personId, { name })
    }
  }

  const updateChore = (choreId: string, changes: Partial<Chore>) => {
    updateHousehold({
      chores: household.chores.map((chore) =>
        chore.id === choreId ? { ...chore, ...changes } : chore,
      ),
    })
  }

  const addChore = () => {
    const name = 'New chore'
    const chore: Chore = {
      id: makeUniqueId(
        name,
        household.chores.map((chore) => chore.id),
        'chore',
      ),
      name,
      cadence: 'weekly',
      effort: 'heavy',
    }

    updateHousehold({ chores: [...household.chores, chore] })
  }

  const removeChore = (choreId: string) => {
    updateHousehold({
      chores: household.chores.filter((chore) => chore.id !== choreId),
    })
  }

  const finalizeChoreName = (choreId: string, value: string) => {
    const name = cleanName(value, 'Unnamed chore')

    if (name !== value) {
      updateChore(choreId, { name })
    }
  }

  const buildManualShareUrl = () => {
    if (typeof window === 'undefined') {
      return ''
    }

    const shareHash = encodeShareHash({ household, away })
    const url = new URL(window.location.href)
    url.hash = shareHash.startsWith('#') ? shareHash : `#${shareHash}`

    return url.toString()
  }

  const handleCopyShareLink = async () => {
    if (hasBlankNames) {
      setCopyStatus('error')
      setShareUrl('')
      return
    }

    setCopyStatus('copying')

    try {
      const copiedUrl = await onCopyShareLink()
      setShareUrl(copiedUrl)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    } catch {
      setShareUrl(buildManualShareUrl())
      setCopyStatus('error')
    }
  }

  const copyFeedback =
    hasBlankNames
      ? 'Names are required before sharing.'
      : copyStatus === 'error'
        ? shareUrl
          ? 'Clipboard blocked the copy. Select the link below to copy it manually.'
          : 'Could not create a share link.'
        : ''

  return (
    <section className="setup-panel" aria-labelledby="setup-heading">
      <div className="setup-panel__header">
        <div>
          <h2 id="setup-heading">Setup</h2>
          <p className="setup-panel__note">
            Share links sync the household and away weeks for your flatmates.
          </p>
        </div>
      </div>

      <section className="setup-section" aria-labelledby="setup-people-heading">
        <div className="setup-section__header">
          <h3 id="setup-people-heading">People</h3>
          <button type="button" className="secondary-button" onClick={addPerson}>
            Add person
          </button>
        </div>

        <div className="setup-list">
          {household.people.map((person) => (
            <div className="field-row" key={person.id}>
              <label className="field field-name">
                <span>Name</span>
                <input
                  type="text"
                  value={person.name}
                  required
                  aria-invalid={person.name.trim().length === 0}
                  aria-describedby="setup-name-help"
                  onChange={(event) =>
                    updatePerson(person.id, { name: event.target.value })
                  }
                  onBlur={() => finalizePersonName(person.id, person.name)}
                />
              </label>

              <label className="field field-zone">
                <span>Bath zone</span>
                <select
                  value={person.bathZone}
                  onChange={(event) =>
                    updatePerson(person.id, {
                      bathZone: event.target.value as BathZone,
                    })
                  }
                >
                  {bathZones.map((zone) => (
                    <option value={zone} key={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="danger-button"
                aria-label={`Remove ${person.name.trim() || 'unnamed person'}`}
                onClick={() => removePerson(person.id)}
              >
                Remove
              </button>
            </div>
          ))}
          {household.people.length === 0 ? (
            <p className="empty-state">No people yet. Add someone to build the rota.</p>
          ) : null}
        </div>
        <p id="setup-name-help" className="field-help">
          Names are trimmed on blur and cannot be blank before sharing.
        </p>
      </section>

      <section className="setup-section" aria-labelledby="setup-chores-heading">
        <div className="setup-section__header">
          <h3 id="setup-chores-heading">Chores</h3>
          <button type="button" className="secondary-button" onClick={addChore}>
            Add chore
          </button>
        </div>

        <div className="setup-list">
          {household.chores.map((chore) => (
            <div className="field-row" key={chore.id}>
              <label className="field field-name">
                <span>Name</span>
                <input
                  type="text"
                  value={chore.name}
                  required
                  aria-invalid={chore.name.trim().length === 0}
                  aria-describedby="setup-name-help"
                  onChange={(event) =>
                    updateChore(chore.id, { name: event.target.value })
                  }
                  onBlur={() => finalizeChoreName(chore.id, chore.name)}
                />
              </label>

              <label className="field field-cadence">
                <span>Cadence</span>
                <select
                  value={chore.cadence}
                  onChange={(event) =>
                    updateChore(chore.id, {
                      cadence: event.target.value as Cadence,
                    })
                  }
                >
                  {cadences.map((cadence) => (
                    <option value={cadence} key={cadence}>
                      {cadence}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field-zone">
                <span>Zone</span>
                <select
                  value={chore.zone ?? 'none'}
                  onChange={(event) =>
                    updateChore(chore.id, {
                      zone:
                        event.target.value === 'none'
                          ? undefined
                          : (event.target.value as BathZone),
                    })
                  }
                >
                  <option value="none">none</option>
                  {bathZones.map((zone) => (
                    <option value={zone} key={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="danger-button"
                aria-label={`Remove ${chore.name.trim() || 'unnamed chore'}`}
                onClick={() => removeChore(chore.id)}
              >
                Remove
              </button>
            </div>
          ))}
          {household.chores.length === 0 ? (
            <p className="empty-state">No chores yet. Add one when the flat is ready.</p>
          ) : null}
        </div>
      </section>

      <section className="setup-section" aria-labelledby="setup-parity-heading">
        <h3 id="setup-parity-heading">Biweekly parity</h3>
        <div className="field-row field-row--compact">
          <label className="field field-toggle">
            <span>Parity</span>
            <select
              value={household.biweeklyParity}
              onChange={(event) =>
                updateHousehold({
                  biweeklyParity: Number(event.target.value) as 0 | 1,
                })
              }
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
            </select>
          </label>
          <p className="field-help">
            Biweekly chores run when the ISO week number has this parity.
          </p>
        </div>
      </section>

      <section className="setup-section" aria-label="Setup actions">
        <div className="setup-actions">
          <button type="button" className="danger-button" onClick={onReset}>
            Reset to defaults
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={copyStatus === 'copying' || hasBlankNames}
            aria-describedby="copy-feedback"
            onClick={() => void handleCopyShareLink()}
          >
            {copyStatus === 'copying'
              ? 'Copying...'
              : copyStatus === 'copied'
                ? 'Copied!'
                : 'Copy share link'}
          </button>
          <span id="copy-feedback" className="copy-feedback" aria-live="polite">
            {copyFeedback}
          </span>
          {copyStatus === 'error' && shareUrl ? (
            <label className="field share-link-fallback">
              <span>Share link</span>
              <input
                type="text"
                value={shareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          ) : null}
        </div>
      </section>
    </section>
  )
}

export default SetupPanel
