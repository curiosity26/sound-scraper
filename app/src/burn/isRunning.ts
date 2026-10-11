import type { BurnStatus } from './types'

export const isRunning = (s: BurnStatus | null): boolean =>
  s?.state === 'preparing' || s?.state === 'writing'
