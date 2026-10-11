import type { MastersUsage } from '@/bridge/generated'
import { isNumber, isShape } from '@/shared/utils/guards'

export const isMastersUsage = isShape<MastersUsage>({
  count: isNumber,
  bytes: isNumber,
})
