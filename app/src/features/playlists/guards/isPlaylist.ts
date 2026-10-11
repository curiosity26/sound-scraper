import type { Playlist } from '@/bridge/generated'
import { isNumber, isShape, isString } from '@/shared/utils/guards'

export const isPlaylist = isShape<Playlist>({
  id: isNumber,
  name: isString,
  count: isNumber,
})
