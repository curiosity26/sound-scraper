import type { Recording } from '@/native/types'

import { sortBy } from './sortBy'
import type { Sort } from './types'

export const sortRecordings = (
  items: readonly Recording[],
  sort: Sort,
): Recording[] => {
  return sortBy(items, r => r, sort)
}
