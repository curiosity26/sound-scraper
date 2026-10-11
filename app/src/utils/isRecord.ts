/** Narrows `unknown` (parsed JSON, native results) to a plain object. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
