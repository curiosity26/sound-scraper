/** A 0–1 share as a style width or offset, "42.5%", clamped to 0–100%. */
export const toPercent = (fraction: number): `${number}%` => {
  const text = `${String(Math.min(1, Math.max(0, fraction)) * 100)}%`
  assertPercent(text)
  return text
}

/** Narrows a number written out with "%" to the type styles take. */
function assertPercent(text: string): asserts text is `${number}%` {
  if (!text.endsWith('%')) {
    throw new Error(`Not a percentage: ${text}`)
  }
}
