import type { PlaylistItem } from '@/bridge/generated'
import { isNumber, isShape, isString } from '@/shared/utils/guards'

export const isPlaylistItem = isShape<PlaylistItem>({
  id: isNumber,
  fileName: isString,
})
