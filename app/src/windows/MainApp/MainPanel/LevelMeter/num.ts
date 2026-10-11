import type { JsonValue } from '@/native/bridge'

/** A style value that's a finite number, else the fallback. */
export const num = (v: JsonValue | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
