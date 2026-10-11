import type { Edits, History } from './types'

// ------------------------------------------------------------------ undo

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
