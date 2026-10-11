import type { Edits } from './types'

export function editsToJson(e: Edits): string {
  return JSON.stringify({
    firstName: e.firstName,
    splices: e.splices.map(s => ({ atMs: s.atMs, name: s.name })),
    deleted: e.deleted.map(r => ({ startMs: r.startMs, endMs: r.endMs })),
  })
}
