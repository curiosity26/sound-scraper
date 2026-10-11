import type { Playlist } from '@/native/bridge'
import { isNumber, isShape, isString } from '@/utils/guards'

export const isPlaylist = isShape<Playlist>({
  id: isNumber,
  name: isString,
  count: isNumber,
})
