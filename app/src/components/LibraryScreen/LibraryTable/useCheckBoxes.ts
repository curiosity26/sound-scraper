// The check boxes: one row's, the header's (all of them), and what's
// checked among the rows shown.
import type { Row } from '@/library/types'

import { rowKey } from './rowKey'

export type UseCheckBoxesProps = {
  readonly rows: readonly Row[]
  readonly checked: Set<string>
  readonly onCheckedChange: (checked: Set<string>) => void
}

export type UseCheckBoxesResult = {
  /** Every row shown is checked. */
  readonly allChecked: boolean
  readonly toggle: (key: string) => void
  readonly toggleAll: () => void
  /** File names of the checked rows that aren't missing, each once. */
  readonly checkedNames: string[]
  /** Item ids of the checked playlist rows. */
  readonly checkedItemIds: readonly number[]
}

export const useCheckBoxes = (
  props: UseCheckBoxesProps,
): UseCheckBoxesResult => {
  const { rows, checked, onCheckedChange } = props
  const allChecked = rows.length > 0 && rows.every(r => checked.has(rowKey(r)))
  const checkedRows = rows.filter(r => checked.has(rowKey(r)))
  return {
    allChecked,
    toggle: key => {
      const next = new Set(checked)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      onCheckedChange(next)
    },
    toggleAll: () => {
      onCheckedChange(allChecked ? new Set() : new Set(rows.map(rowKey)))
    },
    checkedNames: [
      ...new Set(checkedRows.filter(r => r.recording).map(r => r.fileName)),
    ],
    checkedItemIds: checkedRows
      .map(r => r.itemId)
      .filter((id): id is number => id !== undefined),
  }
}
