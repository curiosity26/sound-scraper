import type { JsonValue } from '@/bridge/generated'

/** A style value that's a string (a color), else the fallback. */
export const color = (v: JsonValue | undefined, fallback: string) =>
  typeof v === 'string' ? v : fallback
