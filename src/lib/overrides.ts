import type { WeekOverrideMap } from '../types'

/**
 * Drop any locked week that assigned `personId`. Hollow/partial locks are
 * unsafe (scheduler treats key presence as a full manual week).
 */
export function removePersonFromOverrides(
  overrides: WeekOverrideMap,
  personId: string,
): WeekOverrideMap {
  const next: WeekOverrideMap = {}

  for (const [weekKey, weekOverride] of Object.entries(overrides)) {
    if (Object.values(weekOverride).includes(personId)) {
      continue
    }
    next[weekKey] = { ...weekOverride }
  }

  return next
}
