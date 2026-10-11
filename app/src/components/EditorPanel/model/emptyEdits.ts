import type { Edits } from './types'

export const emptyEdits = (firstName: string): Edits => {
  return { firstName, splices: [], deleted: [] }
}
