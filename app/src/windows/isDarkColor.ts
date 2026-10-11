export function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '')
  const v = (i: number) =>
    parseInt(h.length < 6 ? h[i] + h[i] : h.slice(i * 2, i * 2 + 2), 16)
  return 0.299 * v(0) + 0.587 * v(1) + 0.114 * v(2) < 128
}
