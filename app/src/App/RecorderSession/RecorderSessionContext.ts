import { createContext } from 'react'

import type { UseRecorderSessionResult } from './useRecorderSession'

export const RecorderSessionContext = createContext<
  UseRecorderSessionResult | undefined
>(undefined)
