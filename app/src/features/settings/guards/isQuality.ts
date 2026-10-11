import type { Quality } from '@/bridge/generated'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

export const isQuality = isUnionOf<Quality>()(
  'cbr128',
  'cbr192',
  'cbr256',
  'cbr320',
  'vbr0',
  'vbr2',
)
