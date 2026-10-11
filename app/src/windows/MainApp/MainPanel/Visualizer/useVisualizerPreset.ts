import { useSyncExternalStore } from 'react'

import { nextPreset } from './nextPreset'

// The chosen look, shared by the main and shade layouts.
let chosenPreset = 0
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getChosen = () => chosenPreset

export type UseVisualizerPresetResult = {
  /** The skin's preset showing, or {} when it has none. */
  readonly preset: Readonly<Record<string, unknown>>
  /** Moves on to the next preset. */
  readonly cycle: () => void
}

/** The visualizer preset chosen by clicking the visualizer. */
export const useVisualizerPreset = (
  presets: readonly Record<string, unknown>[],
): UseVisualizerPresetResult => {
  const index = useSyncExternalStore(subscribe, getChosen)
  const preset =
    (presets.length > 0 ? presets[index % presets.length] : undefined) ?? {}
  return {
    preset,
    cycle: () => {
      chosenPreset = nextPreset(chosenPreset, presets.length)
      listeners.forEach(l => {
        l()
      })
    },
  }
}
