/** "1:05", "1:05.3", "1:05.250", or "1:02:05" past an hour. */
export function formatTime(ms: number, step = 1000): string {
  const negative = ms < 0
  const abs = Math.abs(ms)
  const decimals = step >= 1000 ? 0 : step >= 100 ? 1 : step >= 10 ? 2 : 3
  const scale = 10 ** decimals
  const totalUnits = Math.round((abs / 1000) * scale)
  const units = totalUnits % (60 * scale)
  const totalMinutes = Math.floor(totalUnits / (60 * scale))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const sec = Math.floor(units / scale)
  const frac = units % scale
  const s =
    String(sec).padStart(2, '0') +
    (decimals > 0 ? '.' + String(frac).padStart(decimals, '0') : '')
  const m = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return (negative ? '-' : '') + (hours > 0 ? `${hours}:` : '') + `${m}:${s}`
}
