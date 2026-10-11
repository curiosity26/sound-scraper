import type { BurnStatus } from './types'

export function isRunning(s: BurnStatus | null): boolean {
  return s?.state === 'preparing' || s?.state === 'writing'
}
