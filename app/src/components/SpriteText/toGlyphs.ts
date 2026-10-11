/**
 * Maps `text` onto a font's glyphs: accents are dropped, lowercase falls
 * back to uppercase, and anything else missing becomes "?" (or a space).
 */
export const toGlyphs = (text: string, glyphs: string): string[] => {
  const available = new Set(Array.from(glyphs))
  const unknown = available.has('?') ? '?' : ' '
  return Array.from(text.normalize('NFD').replace(/[̀-ͯ]/g, '')).map(c => {
    if (available.has(c)) {
      return c
    }
    const upper = c.toUpperCase()
    return available.has(upper) ? upper : unknown
  })
}
