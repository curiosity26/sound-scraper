import { COLUMNS } from '@/library/constants'
import type { SortKey } from '@/library/types'

/** Columns that fit a table `width` points wide (0 = not measured yet). */
export const visibleColumns = (width: number): SortKey[] => {
  return COLUMNS.map(c => c.key).filter(
    key =>
      width === 0 ||
      (key === 'artist' ? width >= 620 : key === 'size' ? width >= 470 : true),
  )
}
