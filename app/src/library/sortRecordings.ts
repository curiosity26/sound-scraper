import type { Recording } from '@/native/types'

import { sortBy } from './sortBy'
import type { Sort } from './types'

export function sortRecordings(items: Recording[], sort: Sort): Recording[] {
  return sortBy(items, r => r, sort)
}
