import type { Tags } from '@/bridge/types'
import type { CoverState } from '@/features/tags/types'

/** Covers are cached by content, so identical covers share a path. */
export const mergeCovers = (all: readonly Tags[]): CoverState => {
  const paths = new Set(all.map(t => t.coverPath))
  if (paths.size !== 1) {
    return { kind: 'mixed' }
  }
  const path = [...paths][0]
  return path ? { kind: 'image', path } : { kind: 'none' }
}
