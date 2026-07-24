import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getDatabase,
  onValue,
  ref,
  set,
  type Database,
} from 'firebase/database'
import type { PersistedState } from '../types'
import { parsePersistedState } from './persistedState'

export type SyncStatus =
  | 'local-only'
  | 'connecting'
  | 'synced'
  | 'saving'
  | 'error'

export interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  databaseURL: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
  householdPath?: string
}

interface CloudPayload {
  updatedAt: number
  state: PersistedState
}

const DEFAULT_PATH = 'households/flat-chores'

let app: FirebaseApp | null = null
let database: Database | null = null
let householdPath = DEFAULT_PATH

function isConfigured(config: FirebaseClientConfig): boolean {
  return (
    Boolean(config.apiKey) &&
    !config.apiKey.includes('REPLACE') &&
    Boolean(config.databaseURL) &&
    !config.databaseURL.includes('REPLACE') &&
    Boolean(config.projectId) &&
    !config.projectId.includes('REPLACE') &&
    Boolean(config.appId) &&
    !config.appId.includes('REPLACE')
  )
}

export async function loadFirebaseConfig(): Promise<FirebaseClientConfig | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}firebase-config.json`, {
      cache: 'no-store',
    })
    if (!response.ok) {
      return null
    }
    const config = (await response.json()) as FirebaseClientConfig
    return isConfigured(config) ? config : null
  } catch {
    return null
  }
}

export function initCloudSync(config: FirebaseClientConfig): boolean {
  if (!isConfigured(config)) {
    return false
  }

  if (app === null) {
    app = initializeApp(config)
    database = getDatabase(app)
  }

  householdPath = config.householdPath?.trim() || DEFAULT_PATH
  return true
}

export function subscribeCloudState(
  onChange: (payload: CloudPayload | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (database === null) {
    onChange(null)
    return () => undefined
  }

  const householdRef = ref(database, householdPath)
  return onValue(
    householdRef,
    (snapshot) => {
      const value = snapshot.val()
      if (value === null || value === undefined) {
        onChange(null)
        return
      }

      const parsed = parseCloudPayload(value)
      onChange(parsed)
    },
    (error) => {
      onError?.(error)
    },
  )
}

export async function pushCloudState(state: PersistedState): Promise<number> {
  if (database === null) {
    throw new Error('Cloud sync is not initialized')
  }

  const updatedAt = Date.now()
  const payload: CloudPayload = { updatedAt, state }
  await set(ref(database, householdPath), payload)
  return updatedAt
}

function parseCloudPayload(value: unknown): CloudPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const updatedAt = record.updatedAt
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    return null
  }

  const state = parsePersistedState(record.state)
  if (state === null) {
    return null
  }

  return { updatedAt, state }
}
