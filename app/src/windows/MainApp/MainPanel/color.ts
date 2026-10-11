import type { JsonValue } from '@/native/bridge'

/** A style value that's a string (a color), else the fallback. */
export const color = (v: JsonValue | undefined, fallback: string) =>
  typeof v === 'string' ? v : fallback
