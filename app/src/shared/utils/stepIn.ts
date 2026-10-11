/** The next value in `list` after (dir 1) or before (dir -1) `v`. */
export const stepIn = (
  list: readonly number[],
  v: number,
  dir: 1 | -1,
): number => {
  const i = list.findIndex(x => x >= v)
  const at = i < 0 ? list.length - 1 : i
  const exact = list[at] === v
  const next = dir > 0 ? (exact ? at + 1 : at) : at - 1
  return list[Math.max(0, Math.min(list.length - 1, next))] ?? v
}
