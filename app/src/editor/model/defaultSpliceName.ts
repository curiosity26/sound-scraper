import type { Edits } from './types'

/** "Track N" for the track a new splice at `atMs` would start. */
export function defaultSpliceName(e: Edits, atMs: number): string {
  return `Track ${e.splices.filter(s => s.atMs < atMs).length + 2}`
}
