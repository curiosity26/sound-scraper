/** What the row needs from a press or pointer event's native event. */
export type MouseLike = { button?: number; pageX?: number; pageY?: number }

/** macOS: a right-click is an "aux click", with the point in the row's own
 * coordinates. */
export type AuxClick = { button?: number; clientX?: number; clientY?: number }

/**
 * A right-clicked row: its file name, its item id in a playlist, and the key
 * it's checked under (see rowKey).
 */
export type RowTarget = { fileName: string; itemId?: number; key: string }
