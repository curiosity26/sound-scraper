import type { Edits, TrackOwner } from './types'

/** Names the tracks `owners` name (each its slice, or the first track). */
export const renameTracks = (
  e: Edits,
  owners: readonly TrackOwner[],
  name: string,
): Edits => {
  return {
    ...e,
    firstName: owners.includes('first') ? name : e.firstName,
    splices: e.splices.map(s => (owners.includes(s.id) ? { ...s, name } : s)),
  }
}
