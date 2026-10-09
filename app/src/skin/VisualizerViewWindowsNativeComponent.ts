// Windows: the visualizer view (app/windows/SoundScraper/VisualizerView.h),
// a Fabric component. codegenNativeComponent gives it a static view config.
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native'
import { codegenNativeComponent } from 'react-native'

export interface NativeProps extends ViewProps {
  /** One of the skin's visualizer presets, as JSON. */
  preset?: string
  pixelated?: boolean
  skinScale?: CodegenTypes.Double
}

export default codegenNativeComponent<NativeProps>(
  'SSVisualizerView',
) as HostComponent<NativeProps>
