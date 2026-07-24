import { useState } from 'react'
import type { BathZone, Cadence, Chore, Household, Person } from '../types'

interface SetupPanelProps {
  household: Household
  onChange: (household: Household) => void
  onReset: () => void
  onCopyShareLink: () => Promise<string>
}

const bathZones: BathZone[] = ['up', 'down']
const cadences: Cadence[] = ['weekly', 'biweekly']

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
  onChange,
  onReset,
  onCopyShareLink,
}: SetupPanelProps) {
  const [copyStatus, setCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'error'
  >('idle')

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
    }

    updateHousehold({ chores: [...household.chores, chore] })
  }

  const removeChore = (choreId: string) => {
    updateHousehold({
      chores: household.chores.filter((chore) => chore.id !== choreId),
    })
  }

  const handleCopyShareLink = async () => {
    setCopyStatus('copying')

    try {
      await onCopyShareLink()
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 2400)
    }
  }

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
                  onChange={(event) =>
                    updatePerson(person.id, { name: event.target.value })
                  }
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
                onClick={() => removePerson(person.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
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
                  onChange={(event) =>
                    updateChore(chore.id, { name: event.target.value })
                  }
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
                onClick={() => removeChore(chore.id)}
              >
                Remove
              </button>
            </div>
          ))}
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
            disabled={copyStatus === 'copying'}
            onClick={() => void handleCopyShareLink()}
          >
            {copyStatus === 'copied' ? 'Copied!' : 'Copy share link'}
          </button>
          <span className="copy-feedback" aria-live="polite">
            {copyStatus === 'error' ? 'Could not copy link.' : ''}
          </span>
        </div>
      </section>
    </section>
  )
}

export default SetupPanel
