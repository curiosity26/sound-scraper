import { useSyncExternalStore } from 'react'

import { stage } from './stage'
import type { StageSnapshot } from './types'

/** The stage's panels (Linux), re-rendering as they move. */
export const useStage = (): StageSnapshot =>
  useSyncExternalStore(stage.subscribe, stage.getSnapshot)
