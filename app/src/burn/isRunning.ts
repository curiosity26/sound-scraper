import type { BurnStatus } from '@/native/bridge'

export const isRunning = (s: BurnStatus | null): boolean =>
  s?.state === 'preparing' || s?.state === 'writing'
