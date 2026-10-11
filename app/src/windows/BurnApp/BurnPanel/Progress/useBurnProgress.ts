import { useContext } from 'react'

import { BurnProgressContext } from './BurnProgressContext'
import type { UseBurnProgressStateResult } from './useBurnProgressState'

export type UseBurnProgressResult = UseBurnProgressStateResult

/** The burn job's status and actions, inside Progress. */
export const useBurnProgress = (): UseBurnProgressResult => {
  const progress = useContext(BurnProgressContext)
  if (!progress) {
    throw new Error('useBurnProgress is used outside Progress')
  }
  return progress
}
