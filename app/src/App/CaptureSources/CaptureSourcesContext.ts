import { createContext } from 'react'

import type { UseCaptureSourcesResult } from './useCaptureSources'

export const CaptureSourcesContext = createContext<
  UseCaptureSourcesResult | undefined
>(undefined)
