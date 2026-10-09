// The track editor's model (docs/track-editor-design.md §4): the edit list
// and its changes, undo, and the ruler/zoom/snap arithmetic. Pure, so it's
// unit-tested without the native side.

export type Splice = { id: number; atMs: number; name: string }
export type Region = { id: number; startMs: number; endMs: number }

export type Edits = {
  /** The name of the first track (starting at 0). */
  firstName: string
  splices: Splice[]
  deleted: Region[]
}

let nextId = 1
export const newId = (): number => nextId++

export function emptyEdits(firstName: string): Edits {
  return { firstName, splices: [], deleted: [] }
}

export function hasEdits(e: Edits): boolean {
  return e.splices.length > 0 || e.deleted.length > 0
}

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

export function editsToJson(e: Edits): string {
  return JSON.stringify({
    firstName: e.firstName,
    splices: e.splices.map(s => ({ atMs: s.atMs, name: s.name })),
    deleted: e.deleted.map(r => ({ startMs: r.startMs, endMs: r.endMs })),
  })
}

const sortSplices = (s: Splice[]) => [...s].sort((a, b) => a.atMs - b.atMs)

/** "Track N" for the track a new splice at `atMs` would start. */
export function defaultSpliceName(e: Edits, atMs: number): string {
  return `Track ${e.splices.filter(s => s.atMs < atMs).length + 2}`
}

export function addSplice(
  e: Edits,
  atMs: number,
  name?: string,
): { edits: Edits; id: number } {
  const id = newId()
  const splice = { id, atMs, name: name ?? defaultSpliceName(e, atMs) }
  return { edits: { ...e, splices: sortSplices([...e.splices, splice]) }, id }
}

export function moveSplice(e: Edits, id: number, atMs: number): Edits {
  return {
    ...e,
    splices: sortSplices(
      e.splices.map(s => (s.id === id ? { ...s, atMs } : s)),
    ),
  }
}

export function renameSplice(e: Edits, id: number, name: string): Edits {
  return {
    ...e,
    splices: e.splices.map(s => (s.id === id ? { ...s, name } : s)),
  }
}

export function removeSplice(e: Edits, id: number): Edits {
  return { ...e, splices: e.splices.filter(s => s.id !== id) }
}

/** Deletes a stretch, merging it with deleted regions it touches. */
export function deleteRegion(e: Edits, a: number, b: number): Edits {
  let start = Math.min(a, b)
  let end = Math.max(a, b)
  if (end - start <= 0) {
    return e
  }
  const kept: Region[] = []
  for (const r of e.deleted) {
    if (r.endMs < start || r.startMs > end) {
      kept.push(r)
    } else {
      start = Math.min(start, r.startMs)
      end = Math.max(end, r.endMs)
    }
  }
  kept.push({ id: newId(), startMs: start, endMs: end })
  kept.sort((x, y) => x.startMs - y.startMs)
  return { ...e, deleted: kept }
}

export function restoreRegion(e: Edits, id: number): Edits {
  return { ...e, deleted: e.deleted.filter(r => r.id !== id) }
}

/** The deleted region containing `ms`, if any. */
export function deletedAt(e: Edits, ms: number): Region | undefined {
  return e.deleted.find(r => ms >= r.startMs && ms < r.endMs)
}

/** The splice after (dir 1) or before (dir -1) `ms`. */
export function adjacentSplice(
  e: Edits,
  ms: number,
  dir: 1 | -1,
): Splice | undefined {
  const s = sortSplices(e.splices)
  return dir > 0
    ? s.find(x => x.atMs > ms + 1)
    : [...s].reverse().find(x => x.atMs < ms - 1)
}

// ------------------------------------------------------------------ undo

export type History = { past: Edits[]; present: Edits; future: Edits[] }

const MAX_UNDO = 200

export const history = {
  start: (present: Edits): History => ({ past: [], present, future: [] }),
  push: (h: History, next: Edits): History =>
    next === h.present
      ? h
      : {
          past: [...h.past, h.present].slice(-MAX_UNDO),
          present: next,
          future: [],
        },
  undo: (h: History): History =>
    h.past.length === 0
      ? h
      : {
          past: h.past.slice(0, -1),
          present: h.past[h.past.length - 1],
          future: [h.present, ...h.future],
        },
  redo: (h: History): History =>
    h.future.length === 0
      ? h
      : {
          past: [...h.past, h.present],
          present: h.future[0],
          future: h.future.slice(1),
        },
}

// ------------------------------------------------------- ruler and zoom

/** Ruler label steps and their minor ticks, in ms. */
const STEPS: Array<[number, number]> = [
  [1, 1],
  [2, 1],
  [5, 1],
  [10, 2],
  [20, 5],
  [50, 10],
  [100, 20],
  [200, 50],
  [500, 100],
  [1000, 200],
  [2000, 500],
  [5000, 1000],
  [10_000, 2000],
  [15_000, 5000],
  [30_000, 5000],
  [60_000, 10_000],
  [120_000, 30_000],
  [300_000, 60_000],
  [600_000, 120_000],
  [900_000, 300_000],
  [1_800_000, 300_000],
  [3_600_000, 600_000],
]

/** At least this many points between ruler labels. */
const LABEL_SPACING = 70

/**
 * The ruler's labelled step and its minor tick (the snap interval), for a
 * zoom of `msPerPoint`.
 */
export function rulerSteps(msPerPoint: number): {
  major: number
  minor: number
} {
  const [major, minor] =
    STEPS.find(([m]) => m / msPerPoint >= LABEL_SPACING) ??
    STEPS[STEPS.length - 1]
  return { major, minor }
}

/** Snaps `ms` to the nearest multiple of `step`. */
export function snap(ms: number, step: number): number {
  return step > 0 ? Math.round(ms / step) * step : ms
}

/** "1:05", "1:05.3", "1:05.250", or "1:02:05" past an hour. */
export function formatTime(ms: number, step = 1000): string {
  const negative = ms < 0
  const abs = Math.abs(ms)
  const decimals = step >= 1000 ? 0 : step >= 100 ? 1 : step >= 10 ? 2 : 3
  const scale = 10 ** decimals
  const totalUnits = Math.round((abs / 1000) * scale)
  const units = totalUnits % (60 * scale)
  const totalMinutes = Math.floor(totalUnits / (60 * scale))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const sec = Math.floor(units / scale)
  const frac = units % scale
  const s =
    String(sec).padStart(2, '0') +
    (decimals > 0 ? '.' + String(frac).padStart(decimals, '0') : '')
  const m = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return (negative ? '-' : '') + (hours > 0 ? `${hours}:` : '') + `${m}:${s}`
}

/** The deepest zoom (about 5 samples per point at 48 kHz). */
export const MIN_MS_PER_POINT = 0.1

/** The zoom that fits `durationMs` in `width` points. */
export function fitZoom(durationMs: number, width: number): number {
  return Math.max(MIN_MS_PER_POINT, durationMs / Math.max(1, width))
}

export function clampZoom(
  msPerPoint: number,
  durationMs: number,
  width: number,
): number {
  return Math.min(
    fitZoom(durationMs, width),
    Math.max(MIN_MS_PER_POINT, msPerPoint),
  )
}

/**
 * New scroll offset (points) after zooming to `next` ms/pt, keeping `ms`
 * where it was on screen (at `x` points from the view's left).
 */
export function zoomScroll(ms: number, x: number, next: number): number {
  return Math.max(0, ms / next - x)
}

/** A splice Find Tracks proposes (see native/editor.ts). */
export type ProposedSplice = {
  atMs: number
  delete: [number, number] | null
}

/** Proposals closer than this to an existing splice are dropped. */
const PROPOSAL_MERGE_MS = 2000

/**
 * Adds Find Tracks' proposals as splices (and deleted gaps), skipping any
 * near a splice that's already there.
 */
export function applyProposals(e: Edits, proposals: ProposedSplice[]): Edits {
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

/** The next value in `list` after (dir 1) or before (dir -1) `v`. */
export function stepIn(list: number[], v: number, dir: 1 | -1): number {
  const i = list.findIndex(x => x >= v)
  const at = i < 0 ? list.length - 1 : i
  const exact = list[at] === v
  const next = dir > 0 ? (exact ? at + 1 : at) : at - 1
  return list[Math.max(0, Math.min(list.length - 1, next))]
}
