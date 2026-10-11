/**
 * The order after moving `moving` (item ids, kept in their current order) so
 * they land before the item now at `toIndex` (`order.length` = the end).
 */
export function moveItems(
  order: number[],
  moving: number[],
  toIndex: number,
): number[] {
  const set = new Set(moving)
  const moved = order.filter(id => set.has(id))
  if (moved.length === 0) {
    return order
  }
  const before = order.slice(0, toIndex).filter(id => !set.has(id))
  const after = order.slice(toIndex).filter(id => !set.has(id))
  return [...before, ...moved, ...after]
}
