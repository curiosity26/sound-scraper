import type { EditList } from '@/native/bridge'

import type { Edits } from './types'

/** The edit list the core keeps (the edits without their ids). */
export const editsToList = (e: Edits): EditList => {
  return {
    firstName: e.firstName,
    splices: e.splices.map(s => ({ atMs: s.atMs, name: s.name })),
    deleted: e.deleted.map(r => ({ startMs: r.startMs, endMs: r.endMs })),
  }
}
