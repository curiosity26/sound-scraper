import type { Edits } from './types'

export function hasEdits(e: Edits): boolean {
  return e.splices.length > 0 || e.deleted.length > 0
}
