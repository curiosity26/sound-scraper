import type { Edits } from './types'

export function emptyEdits(firstName: string): Edits {
  return { firstName, splices: [], deleted: [] }
}
