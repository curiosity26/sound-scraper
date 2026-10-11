import { moveItems } from './moveItems'

/** Moves the items up (-1) or down (+1) one place, as a block. */
export function moveBy(
  order: number[],
  moving: number[],
  delta: -1 | 1,
): number[] {
  const set = new Set(moving)
  const indices = order
    .map((id, i) => (set.has(id) ? i : -1))
    .filter(i => i >= 0)
  if (indices.length === 0) {
    return order
  }
  if (delta < 0) {
    const first = indices[0]
    return first === 0 ? order : moveItems(order, moving, first - 1)
  }
  const last = indices[indices.length - 1]
  return last === order.length - 1 ? order : moveItems(order, moving, last + 2)
}
