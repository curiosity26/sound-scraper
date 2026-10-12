export const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = String(total % 60).padStart(2, '0')
  return h > 0
    ? `${String(h)}:${String(m).padStart(2, '0')}:${s}`
    : `${String(m)}:${s}`
}
