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
  undo: (h: History): History => {
    const previous = h.past.at(-1)
    return previous === undefined
      ? h
      : {
          past: h.past.slice(0, -1),
          present: previous,
          future: [h.present, ...h.future],
        }
  },
  redo: (h: History): History => {
    const [next, ...future] = h.future
    return next === undefined
      ? h
      : {
          past: [...h.past, h.present],
          present: next,
          future,
        }
  },
}
