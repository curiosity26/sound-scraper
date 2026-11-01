import { defaultSpliceName } from './defaultSpliceName'
import { newId } from './newId'
import { sortSplices } from './sortSplices'
import { tagsAt } from './tagsAt'
import type { Edits } from './types'

/**
 * A slice at `atMs`. The new track starts with the tags of the track it
 * splits (its title is its own name), and goes after any slice already at
 * that point.
 */
export const addSplice = (
  e: Edits,
  atMs: number,
  name?: string,
): { edits: Edits; id: number } => {
  const id = newId()
  const tags = tagsAt(e, atMs)
  const splice = {
    id,
    atMs,
    name: name ?? defaultSpliceName(e, atMs),
    ...(tags ? { tags: { ...tags } } : {}),
  }
  return { edits: { ...e, splices: sortSplices([...e.splices, splice]) }, id }
}
