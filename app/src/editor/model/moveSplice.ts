import { sortSplices } from './sortSplices'
import type { Edits } from './types'

export function moveSplice(e: Edits, id: number, atMs: number): Edits {
  return {
    ...e,
    splices: sortSplices(
      e.splices.map(s => (s.id === id ? { ...s, atMs } : s)),
    ),
  }
}
