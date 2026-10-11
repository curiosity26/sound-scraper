import type { BurnStatus } from '@/bridge/generated'

export const isRunning = (s: BurnStatus | null): boolean =>
  s?.state === 'preparing' || s?.state === 'writing'
