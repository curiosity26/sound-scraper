import { createContext } from 'react'

import type { UseVisualizerPresetStateResult } from './VisualizerPresetProvider'

/** The main window's chosen visualizer look (see VisualizerPresetProvider). */
export const VisualizerPresetContext =
  createContext<UseVisualizerPresetStateResult | null>(null)
