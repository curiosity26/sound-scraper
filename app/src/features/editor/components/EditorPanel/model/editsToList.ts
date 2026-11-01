import type { EditList } from '@/bridge/generated'

import { isEmptyTags } from './isEmptyTags'
import type { Edits } from './types'

/** The edit list the core keeps (the edits without their ids). */
export const editsToList = (e: Edits): EditList => {
  return {
    firstName: e.firstName,
    ...(e.firstTags && !isEmptyTags(e.firstTags)
      ? { firstTags: e.firstTags }
      : {}),
    splices: e.splices.map(s => ({
      atMs: s.atMs,
      name: s.name,
      ...(s.tags && !isEmptyTags(s.tags) ? { tags: s.tags } : {}),
    })),
    deleted: e.deleted.map(r => ({ startMs: r.startMs, endMs: r.endMs })),
  }
}
