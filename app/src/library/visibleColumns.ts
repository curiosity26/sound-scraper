import { COLUMNS } from './constants'
import type { SortKey } from './types'

/** Columns that fit a table `width` points wide (0 = not measured yet). */
export function visibleColumns(width: number): SortKey[] {
  return COLUMNS.map(c => c.key).filter(
    key =>
      width === 0 ||
      (key === 'artist' ? width >= 620 : key === 'size' ? width >= 470 : true),
  )
}
