import type { Edits } from './types'

/** Removes a slice: its track joins the one before, which keeps its tags. */
export const removeSplice = (e: Edits, id: number): Edits => {
  return { ...e, splices: e.splices.filter(s => s.id !== id) }
}
