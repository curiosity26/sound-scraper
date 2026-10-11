import type { Splice } from './types'

export const sortSplices = (s: readonly Splice[]): Splice[] =>
  s.toSorted((a, b) => a.atMs - b.atMs)
