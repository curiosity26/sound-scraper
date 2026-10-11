import { useMemo, useState } from 'react'

export type UseVisualizerPresetStateResult = {
  /** The chosen preset's index (wrapped to the skin's presets when read). */
  readonly chosen: number
  readonly setChosen: (update: (chosen: number) => number) => void
}

/** Which of the skin's visualizer presets was chosen by clicking it. */
export const useVisualizerPresetState = (): UseVisualizerPresetStateResult => {
  const [chosen, setChosen] = useState(0)
  return useMemo(() => ({ chosen, setChosen }), [chosen])
}
