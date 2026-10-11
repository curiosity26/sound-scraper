import type { PlaylistItem } from '@/native/bridge'
import { isNumber, isShape, isString } from '@/utils/guards'

export const isPlaylistItem = isShape<PlaylistItem>({
  id: isNumber,
  fileName: isString,
})
