import type { BurnLogLine } from '@/bridge/generated'
import { isNumber, isShape, isString } from '@/shared/utils/guards'

export const isBurnLogLine = isShape<BurnLogLine>({
  atMs: isNumber,
  text: isString,
})
