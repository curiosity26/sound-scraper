import type { SimSettings } from '@/native/bridge'
import { isBoolean, isShape } from '@/utils/guards'

import { isSimFault } from './isSimFault'
import { isSimMedia } from './isSimMedia'

export const isSimSettings = isShape<SimSettings>({
  media: isSimMedia,
  fault: isSimFault,
  fast: isBoolean,
})
