export const formatElapsed = (ms: number, tenths = true): string => {
  const total = Math.floor(ms / 100)
  const seconds = Math.floor(total / 10) % 60
  const minutes = Math.floor(total / 600)
  if (!tenths) {
    // MM:SS, like a clock (skins with flip-card digits).
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0',
    )}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${total % 10}`
}
