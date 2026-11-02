import type { EditList } from '@/bridge/generated'

import { emptyEdits } from './emptyEdits'
import { newId } from './newId'
import type { Edits } from './types'

/** A saved draft (from the core, or null), giving everything ids. */
export const editsFromList = (
  list: EditList | null,
  firstName: string,
): Edits => {
  if (!list) {
    return emptyEdits(firstName)
  }
  return {
    // The core reads a missing name as "": keep the recording's title then.
    firstName: list.firstName.trim() ? list.firstName : firstName,
    ...(list.firstTags ? { firstTags: list.firstTags } : {}),
    splices: list.splices.map(s => ({
      id: newId(),
      atMs: s.atMs,
      name: s.name,
      ...(s.tags ? { tags: s.tags } : {}),
    })),
    deleted: list.deleted.map(r => ({
      id: newId(),
      startMs: r.startMs,
      endMs: r.endMs,
    })),
  }
}
