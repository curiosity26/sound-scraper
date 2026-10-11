export const color = (v: unknown, fallback: string) =>
  typeof v === 'string' ? v : fallback
