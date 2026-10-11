import type { PlayerState } from '@/bridge/types'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

/** The codegen spec types the player's state as a string. */
export const isPlayerState = isUnionOf<PlayerState>()(
  'empty',
  'stopped',
  'playing',
  'paused',
)
