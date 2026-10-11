import type { Edits } from './types'

export const removeSplice = (e: Edits, id: number): Edits => {
  return { ...e, splices: e.splices.filter(s => s.id !== id) }
}
