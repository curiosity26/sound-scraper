import type { TEXT_FIELDS } from './constants'

export type Field = (typeof TEXT_FIELDS)[number]

/** A field's value across the selection: shared text, or mixed. */
export type Merged = { kind: 'value'; text: string } | { kind: 'mixed' }

export type CoverState =
  | { kind: 'none' }
  | { kind: 'image'; path: string }
  | { kind: 'mixed' }

export type CoverChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'set'; path: string }
