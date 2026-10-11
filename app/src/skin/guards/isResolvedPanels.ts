import type { ResolvedPanels } from '@/native/bridge'
import { isShape } from '@/utils/guards'

import { isResolvedFramePanel } from './isResolvedFramePanel'
import { isResolvedMain } from './isResolvedMain'

export const isResolvedPanels = isShape<ResolvedPanels>({
  main: isResolvedMain,
  library: isResolvedFramePanel,
  settings: isResolvedFramePanel,
  details: isResolvedFramePanel,
  editor: isResolvedFramePanel,
  burn: isResolvedFramePanel,
})
