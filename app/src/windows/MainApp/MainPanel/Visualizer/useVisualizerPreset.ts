import { useContext } from 'react'

import type { JsonValue } from '@/native/bridge'
import { VisualizerPresetContext } from '@/windows/MainApp/MainPanel/VisualizerPresetContext'

import { nextPreset } from './nextPreset'

export type UseVisualizerPresetResult = {
  /** The skin's preset showing, or {} when it has none. */
  readonly preset: Readonly<Record<string, JsonValue>>
  /** Moves on to the next preset. */
  readonly cycle: () => void
}

/**
 * The visualizer preset chosen by clicking the visualizer, shared by the
 * main and shade layouts through the main window's VisualizerPresetProvider.
 */
export const useVisualizerPreset = (
  presets: readonly Readonly<Record<string, JsonValue>>[],
): UseVisualizerPresetResult => {
  const state = useContext(VisualizerPresetContext)
  if (!state) {
    throw new Error('useVisualizerPreset outside a VisualizerPresetProvider')
  }
  const index = state.chosen
  const preset =
    (presets.length > 0 ? presets[index % presets.length] : undefined) ?? {}
  return {
    preset,
    cycle: () => {
      state.setChosen(chosen => nextPreset(chosen, presets.length))
    },
  }
}
