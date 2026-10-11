import { displayName } from '@/library/displayName'
import type { Sort } from '@/library/types'
import type { Recording } from '@/native/types'

/** Sorts anything holding a recording (`of` returns it); ties by file name. */
export const sortBy = <T>(
  items: readonly T[],
  of: (item: T) => Recording,
  sort: Sort,
): T[] => {
  const value = (r: Recording): string | number => {
    switch (sort.key) {
      case 'name':
        return displayName(r).toLowerCase()
      case 'duration':
        return r.durationMs
      case 'size':
        return r.sizeBytes
      case 'artist':
        return `${r.artist ?? ''}\u0000${r.album ?? ''}`.toLowerCase()
      case 'date':
      case 'position':
        return r.recordedAtMs
    }
  }
  const dir = sort.ascending ? 1 : -1
  return items.toSorted((x, y) => {
    const [a, b] = [of(x), of(y)]
    const [va, vb] = [value(a), value(b)]
    if (va < vb) {
      return -dir
    }
    if (va > vb) {
      return dir
    }
    return a.fileName.localeCompare(b.fileName)
  })
}
