import type { Sort, SortKey } from './types'

/** Clicking the active column flips direction; a new column starts sensibly. */
export const nextSort = (current: Sort, key: SortKey): Sort => {
  if (current.key === key) {
    return { key, ascending: !current.ascending }
  }
  return {
    key,
    ascending: key === 'name' || key === 'artist' || key === 'position',
  }
}
