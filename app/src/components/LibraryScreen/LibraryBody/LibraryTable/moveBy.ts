import { moveItems } from './moveItems'

/** Moves the items up (-1) or down (+1) one place, as a block. */
export const moveBy = (
  order: readonly number[],
  moving: readonly number[],
  delta: -1 | 1,
): readonly number[] => {
  const set = new Set(moving)
  const indices = order
    .map((id, i) => (set.has(id) ? i : -1))
    .filter(i => i >= 0)
  const first = indices[0]
  const last = indices.at(-1)
  if (first === undefined || last === undefined) {
    return order
  }
  if (delta < 0) {
    return first === 0 ? order : moveItems(order, moving, first - 1)
  }
  return last === order.length - 1 ? order : moveItems(order, moving, last + 2)
}
