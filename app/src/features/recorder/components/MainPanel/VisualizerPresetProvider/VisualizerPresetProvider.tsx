import type { FC, ReactNode } from 'react'

import { VisualizerPresetContext } from '@/features/recorder/components/MainPanel/VisualizerPresetContext'

import { useVisualizerPresetState } from './useVisualizerPresetState'

export type VisualizerPresetProviderProps = {
  readonly children: ReactNode
}

/**
 * Holds the visualizer look chosen in the main window, above its main and
 * shade layouts, so shading keeps it.
 */
export const VisualizerPresetProvider: FC<
  VisualizerPresetProviderProps
> = props => {
  const preset = useVisualizerPresetState()
  return (
    <VisualizerPresetContext value={preset}>
      {props.children}
    </VisualizerPresetContext>
  )
}
