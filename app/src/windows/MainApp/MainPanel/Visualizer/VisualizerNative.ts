// macOS: SSVisualizerView.mm, a legacy view manager (Fabric interop).
import { requireNativeComponent, type ViewProps } from 'react-native'

import { skinsAvailable } from '@/skin/skinsAvailable'

type NativeProps = ViewProps & {
  /** One of the skin's visualizer presets, as JSON. */
  preset: string
  pixelated: boolean
  skinScale: number
}

export const VisualizerNative = skinsAvailable
  ? requireNativeComponent<NativeProps>('SSVisualizerView')
  : null
