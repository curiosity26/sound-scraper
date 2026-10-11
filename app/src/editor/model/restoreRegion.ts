import type { Edits } from './types'

export function restoreRegion(e: Edits, id: number): Edits {
  return { ...e, deleted: e.deleted.filter(r => r.id !== id) }
}
