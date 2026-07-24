import type { PersistedState } from '../types'

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return null
  }

  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(
      Math.ceil(value.length / 4) * 4,
      '=',
    )
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPersistedState(value: unknown): value is PersistedState {
  if (!isObject(value) || !isObject(value.household) || !isObject(value.away)) {
    return false
  }

  return Array.isArray(value.household.people) && Array.isArray(value.household.chores)
}

function getShareValue(hash: string): string | null {
  const hashParams = hash.startsWith('#') ? hash.slice(1) : hash
  const shareValue = new URLSearchParams(hashParams).get('s')

  return shareValue === '' ? null : shareValue
}

export function encodeShareHash(state: PersistedState): string {
  return `#s=${encodeBase64Url(JSON.stringify(state))}`
}

export function decodeShareHash(hash: string): PersistedState | null {
  const shareValue = getShareValue(hash)

  if (shareValue === null) {
    return null
  }

  const json = decodeBase64Url(shareValue)

  if (json === null) {
    return null
  }

  try {
    const parsedValue: unknown = JSON.parse(json)

    return isPersistedState(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

export function applyShareFromLocation(hash: string): PersistedState | null {
  return decodeShareHash(hash)
}
