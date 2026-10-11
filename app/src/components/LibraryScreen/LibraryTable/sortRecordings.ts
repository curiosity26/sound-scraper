import { sortBy } from '@/library/sortBy'
import type { Sort } from '@/library/types'
import type { Recording } from '@/native/types'

export const sortRecordings = (
  items: readonly Recording[],
  sort: Sort,
): Recording[] => {
  return sortBy(items, r => r, sort)
}
