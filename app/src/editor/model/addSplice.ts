import { defaultSpliceName } from './defaultSpliceName'
import { newId } from './newId'
import { sortSplices } from './sortSplices'
import type { Edits } from './types'

export function addSplice(
  e: Edits,
  atMs: number,
  name?: string,
): { edits: Edits; id: number } {
  const id = newId()
  const splice = { id, atMs, name: name ?? defaultSpliceName(e, atMs) }
  return { edits: { ...e, splices: sortSplices([...e.splices, splice]) }, id }
}
