/** `#rgb`/`#rrggbb` with an alpha byte (0..255). */
export const withAlpha = (hex: string, alpha: number): string => {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split('')
      .map(x => x + x)
      .join('')
  }
  return `#${h.slice(0, 6)}${Math.round(alpha).toString(16).padStart(2, '0')}`
}
