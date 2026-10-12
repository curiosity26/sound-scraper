/** 1:05, or 1:02:05. */
export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = String(total % 60).padStart(2, '0')
  return h > 0
    ? `${String(h)}:${String(m).padStart(2, '0')}:${s}`
    : `${String(m)}:${s}`
}
