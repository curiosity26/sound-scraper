import type { Splice } from './types'

export const sortSplices = (s: Splice[]) =>
  [...s].sort((a, b) => a.atMs - b.atMs)
