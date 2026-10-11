// Dragging a row by its handle: the rows move together (all checked rows,
// if the dragged one is checked), landing before `drag.target`. The list
// box captures presses in the handle column (before the scroll view and
// the row see them), and works out the row from where the press was.
import { type RefObject, useRef, useState } from 'react'
import type { GestureResponderEvent, View } from 'react-native'

import type { PlaylistView, Row } from '@/library/types'

import { moveItems } from './moveItems'
import { rowKey } from './rowKey'

/** Presses this close to the list's left edge grab a row's ≡ handle. */
const HANDLE_HIT = 28

type Drag = { ids: readonly number[]; from: number; target: number }

export type UsePlaylistDragProps = {
  readonly rows: readonly Row[]
  readonly playlist: PlaylistView | undefined
  /** The playlist's item ids in its own order. */
  readonly order: readonly number[]
  readonly canReorder: boolean
  readonly checked: Set<string>
  readonly checkedItemIds: readonly number[]
  /** The list's scroll offset. */
  readonly scrollOffset: number
}

export type UsePlaylistDragResult = {
  /** The list box: measured to place presses, and the responder. */
  readonly box: RefObject<View | null>
  /** Where the list box sits in the window. */
  readonly boxAt: RefObject<{ x: number; y: number }>
  /** A row's height (set from the first row's layout). */
  readonly rowHeight: RefObject<number>
  /** The drag under way, if any. */
  readonly drag: Drag | null
  readonly measureBox: () => void
  /** For the list box's responder props. */
  readonly startCapture: (e: GestureResponderEvent) => boolean
  readonly begin: (e: GestureResponderEvent) => void
  readonly move: (e: GestureResponderEvent) => void
  readonly end: () => void
}

export const usePlaylistDrag = (
  props: UsePlaylistDragProps,
): UsePlaylistDragResult => {
  const {
    rows,
    playlist,
    order,
    canReorder,
    checked,
    checkedItemIds,
    scrollOffset,
  } = props
  const rowHeight = useRef(0)
  const box = useRef<View>(null)
  const boxAt = useRef({ x: 0, y: 0 })
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef(drag)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const dragStart = useRef(0)
  const measureBox = () =>
    box.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      boxAt.current = { x: pageX, y: pageY }
    })
  const inHandle = (pageX: number) =>
    canReorder && pageX - boxAt.current.x < HANDLE_HIT
  const rowAt = (pageY: number): Row | undefined => {
    if (rowHeight.current <= 0) {
      return undefined
    }
    const i = Math.floor(
      (pageY - boxAt.current.y + scrollOffset) / rowHeight.current,
    )
    return rows[i]
  }
  const end = () => {
    const d = dragRef.current
    if (d && playlist) {
      const next = moveItems(order, d.ids, d.target)
      if (next.some((id, i) => id !== order[i])) {
        playlist.onReorder(next)
      }
    }
    setDrag(null)
  }

  return {
    box,
    boxAt,
    rowHeight,
    drag,
    measureBox,
    startCapture: e => {
      measureBox()
      return (
        inHandle(e.nativeEvent.pageX) &&
        rowAt(e.nativeEvent.pageY) !== undefined
      )
    },
    begin: e => {
      const pageY = e.nativeEvent.pageY
      const row = rowAt(pageY)
      if (!row || row.itemId === undefined || row.index === undefined) {
        return
      }
      const key = rowKey(row)
      const ids =
        checked.has(key) && checkedItemIds.length > 0
          ? checkedItemIds
          : [row.itemId]
      dragStart.current = pageY
      setDrag({ ids, from: row.index, target: row.index })
    },
    move: e => {
      const pageY = e.nativeEvent.pageY
      const d = dragRef.current
      if (!d || rowHeight.current <= 0) {
        return
      }
      const delta = (pageY - dragStart.current) / rowHeight.current
      // Moving down lands after the row under the pointer.
      const raw = d.from + Math.round(delta) + (delta > 0 ? 1 : 0)
      const target = Math.max(0, Math.min(order.length, raw))
      if (target !== d.target) {
        setDrag({ ...d, target })
      }
    },
    end,
  }
}
