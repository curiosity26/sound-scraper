import type { Row } from '@/library/types'

/** The key a row is checked under. */
export const rowKey = (row: Row): string => {
  return row.itemId === undefined ? row.fileName : `#${row.itemId}`
}
