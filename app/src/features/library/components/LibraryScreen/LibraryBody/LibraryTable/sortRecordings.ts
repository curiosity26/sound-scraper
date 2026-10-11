import type { Recording } from '@/bridge/types'
import type { Sort } from '@/features/library/types'

import { sortBy } from './sortBy'

export const sortRecordings = (
  items: readonly Recording[],
  sort: Sort,
): Recording[] => {
  return sortBy(items, r => r, sort)
}
