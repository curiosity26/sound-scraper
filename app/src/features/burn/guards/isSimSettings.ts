import type { SimSettings } from '@/bridge/generated'
import { isBoolean, isShape } from '@/shared/utils/guards'

import { isSimFault } from './isSimFault'
import { isSimMedia } from './isSimMedia'

export const isSimSettings = isShape<SimSettings>({
  media: isSimMedia,
  fault: isSimFault,
  fast: isBoolean,
})
