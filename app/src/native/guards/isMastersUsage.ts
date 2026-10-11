import type { MastersUsage } from '@/native/bridge'
import { isNumber, isShape } from '@/utils/guards'

export const isMastersUsage = isShape<MastersUsage>({
  count: isNumber,
  bytes: isNumber,
})
