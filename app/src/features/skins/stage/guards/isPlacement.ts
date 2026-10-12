import type { Placement } from '@/features/skins/stage/types'
import { isNumber, isShape, isString } from '@/shared/utils/guards'

export const isPlacement = isShape<Placement>({
  id: isString,
  x: isNumber,
  y: isNumber,
  w: isNumber,
  h: isNumber,
})
