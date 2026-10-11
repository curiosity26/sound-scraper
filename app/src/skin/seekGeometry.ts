/** Thumb left edge and fill width (points) for `progress` 0..1. */
export function seekGeometry(
  width: number,
  thumbWidth: number,
  progress: number,
): { thumbX: number; fillWidth: number } {
  const p = Math.min(1, Math.max(0, progress))
  const thumbX = Math.round(Math.max(0, width - thumbWidth) * p)
  return { thumbX, fillWidth: thumbX + Math.round(thumbWidth / 2) }
}
