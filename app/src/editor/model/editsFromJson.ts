import { isRecord } from '@/utils/isRecord'

import { emptyEdits } from './emptyEdits'
import { newId } from './newId'
import type { Edits, Region, Splice } from './types'

const toSplices = (value: unknown): Splice[] =>
  (Array.isArray(value) ? value : []).flatMap((s: unknown) =>
    isRecord(s) && typeof s.atMs === 'number'
      ? [
          {
            id: newId(),
            atMs: s.atMs,
            name:
              typeof s.name === 'string' || typeof s.name === 'number'
                ? String(s.name)
                : '',
          },
        ]
      : [],
  )

const toRegions = (value: unknown): Region[] =>
  (Array.isArray(value) ? value : []).flatMap((r: unknown) =>
    isRecord(r) && typeof r.startMs === 'number' && typeof r.endMs === 'number'
      ? [{ id: newId(), startMs: r.startMs, endMs: r.endMs }]
      : [],
  )

/** Parses a saved draft (from the core), giving everything ids. */
export const editsFromJson = (json: string, firstName: string): Edits => {
  try {
    const raw: unknown = JSON.parse(json)
    if (!isRecord(raw)) {
      return emptyEdits(firstName)
    }
    return {
      firstName:
        typeof raw.firstName === 'string' && raw.firstName.trim()
          ? raw.firstName
          : firstName,
      splices: toSplices(raw.splices),
      deleted: toRegions(raw.deleted),
    }
  } catch {
    return emptyEdits(firstName)
  }
}
