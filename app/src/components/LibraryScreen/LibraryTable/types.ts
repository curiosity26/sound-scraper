/** What the row needs from a press or pointer event's native event. */
export type MouseLike = { button?: number; pageX?: number; pageY?: number }

/** macOS: a right-click is an "aux click", with the point in the row's own
 * coordinates. */
export type AuxClick = { button?: number; clientX?: number; clientY?: number }
