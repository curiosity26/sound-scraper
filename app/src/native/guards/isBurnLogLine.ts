import type { BurnLogLine } from '@/native/bridge'
import { isNumber, isShape, isString } from '@/utils/guards'

export const isBurnLogLine = isShape<BurnLogLine>({
  atMs: isNumber,
  text: isString,
})
