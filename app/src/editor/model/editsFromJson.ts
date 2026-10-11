import { emptyEdits } from './emptyEdits'
import { newId } from './newId'
import type { Edits, Region, Splice } from './types'

/** Parses a saved draft (from the core), giving everything ids. */
export function editsFromJson(json: string, firstName: string): Edits {
  try {
    const raw = JSON.parse(json)
    if (!raw || typeof raw !== 'object') {
      return emptyEdits(firstName)
    }
    return {
      firstName:
        typeof raw.firstName === 'string' && raw.firstName.trim()
          ? raw.firstName
          : firstName,
      splices: (Array.isArray(raw.splices) ? raw.splices : [])
        .filter((s: Splice) => typeof s?.atMs === 'number')
        .map((s: Splice) => ({
          id: newId(),
          atMs: s.atMs,
          name: String(s.name ?? ''),
        })),
      deleted: (Array.isArray(raw.deleted) ? raw.deleted : [])
        .filter(
          (r: Region) =>
            typeof r?.startMs === 'number' && typeof r?.endMs === 'number',
        )
        .map((r: Region) => ({
          id: newId(),
          startMs: r.startMs,
          endMs: r.endMs,
        })),
    }
  } catch {
    return emptyEdits(firstName)
  }
}
