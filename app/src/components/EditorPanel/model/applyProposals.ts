import { addSplice } from './addSplice'
import { deleteRegion } from './deleteRegion'
import type { Edits, ProposedSplice } from './types'

/** Proposals closer than this to an existing splice are dropped. */
const PROPOSAL_MERGE_MS = 2000

/**
 * Adds Find Tracks' proposals as splices (and deleted gaps), skipping any
 * near a splice that's already there.
 */
export const applyProposals = (
  e: Edits,
  proposals: ProposedSplice[],
): Edits => {
  let next = e
  for (const p of proposals) {
    if (e.splices.some(s => Math.abs(s.atMs - p.atMs) < PROPOSAL_MERGE_MS)) {
      continue
    }
    next = addSplice(next, p.atMs).edits
    if (p.delete) {
      next = deleteRegion(next, p.delete[0], p.delete[1])
    }
  }
  return next
}
