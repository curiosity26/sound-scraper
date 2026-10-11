import type { Sort } from '@/library/types'
import type { Recording } from '@/native/types'

import { sortBy } from './sortBy'

export const sortRecordings = (
  items: readonly Recording[],
  sort: Sort,
): Recording[] => {
  return sortBy(items, r => r, sort)
}
