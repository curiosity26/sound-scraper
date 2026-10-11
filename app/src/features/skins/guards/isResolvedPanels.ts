import type { ResolvedPanels } from '@/bridge/generated'
import { isShape } from '@/shared/utils/guards'

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
