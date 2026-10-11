import type { SortKey } from '@/library/types'

import type { UseCheckBoxesResult } from './useCheckBoxes'
import type { UseLibraryRowsResult } from './useLibraryRows'

/**
 * What the table's parts share (LibraryTableContext): the rows shown with
 * their search and sort, the check boxes, and the columns that fit.
 */
export type LibraryTableState = UseLibraryRowsResult & {
  readonly checks: UseCheckBoxesResult
  /** The columns that fit. */
  readonly columnsShown: readonly SortKey[]
}
