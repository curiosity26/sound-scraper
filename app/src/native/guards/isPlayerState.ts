import type { PlayerState } from '@/native/types'

import { isUnionOf } from './isUnionOf'

/** The codegen spec types the player's state as a string. */
export const isPlayerState = isUnionOf<PlayerState>()(
  'empty',
  'stopped',
  'playing',
  'paused',
)
