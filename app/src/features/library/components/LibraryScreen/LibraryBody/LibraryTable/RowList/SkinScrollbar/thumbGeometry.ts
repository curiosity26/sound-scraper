/** Where the thumb goes: [top, length] in a track `track` points long. */
export const thumbGeometry = (
  track: number,
  viewport: number,
  content: number,
  offset: number,
  minLength: number,
): [number, number] => {
  if (content <= viewport || track <= 0) {
    return [0, track]
  }
  const length = Math.max(minLength, (track * viewport) / content)
  const travel = track - length
  const ratio = Math.min(1, Math.max(0, offset / (content - viewport)))
  return [travel * ratio, length]
}
