import { sortSplices } from './sortSplices'
import type { Edits, Splice } from './types'

/** The splice after (dir 1) or before (dir -1) `ms`. */
export const adjacentSplice = (
  e: Edits,
  ms: number,
  dir: 1 | -1,
): Splice | undefined => {
  const s = sortSplices(e.splices)
  return dir > 0
    ? s.find(x => x.atMs > ms + 1)
    : s.toReversed().find(x => x.atMs < ms - 1)
}
