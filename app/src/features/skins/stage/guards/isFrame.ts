import type { Frame } from '@/features/skins/stage/types'
import { isNumber, isShape } from '@/shared/utils/guards'

export const isFrame = isShape<Frame>({
  x: isNumber,
  y: isNumber,
  w: isNumber,
  h: isNumber,
})
