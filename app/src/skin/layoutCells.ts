/**
 * The cells to draw in a `capacity`-cell field: aligned, padded with spaces
 * when `pad` (to show a font's unlit cells), and scrolled by `offset` when
 * too long (a marquee, joined with a gap).
 */
export function layoutCells(
  chars: string[],
  capacity: number,
  align: 'left' | 'center' | 'right',
  pad: boolean,
  offset: number,
): string[] {
  if (chars.length > capacity) {
    const loop = [...chars, ' ', ' ', ' ', ' ']
    return Array.from(
      { length: capacity },
      (_, i) => loop[(offset + i) % loop.length],
    )
  }
  const free = capacity - chars.length
  const before =
    align === 'right' ? free : align === 'center' ? Math.floor(free / 2) : 0
  const after = free - before
  const space = (n: number) => Array.from({ length: n }, () => ' ')
  return pad || before > 0
    ? [...space(before), ...chars, ...(pad ? space(after) : [])]
    : chars
}
