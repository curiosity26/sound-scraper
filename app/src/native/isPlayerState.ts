import type { PlayerState } from './types'

export const isPlayerState = (value: string): value is PlayerState =>
  value === 'empty' ||
  value === 'stopped' ||
  value === 'playing' ||
  value === 'paused'
