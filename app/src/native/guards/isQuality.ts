import type { Quality } from '@/native/bridge'

import { isUnionOf } from './isUnionOf'

export const isQuality = isUnionOf<Quality>()(
  'cbr128',
  'cbr192',
  'cbr256',
  'cbr320',
  'vbr0',
  'vbr2',
)
