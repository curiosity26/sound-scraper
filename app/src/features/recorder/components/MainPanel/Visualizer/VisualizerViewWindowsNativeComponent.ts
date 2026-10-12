// Windows and Linux: the visualizer view (app/windows/SoundScraper/VisualizerView.h,
// app/linux/src/Views.cc), a Fabric component. codegenNativeComponent gives it
// a static view config.
import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native'

export interface NativeProps extends ViewProps {
  /** One of the skin's visualizer presets, as JSON. */
  preset?: string
  pixelated?: boolean
  skinScale?: CodegenTypes.Double
}

export default codegenNativeComponent<NativeProps>('SSVisualizerView')
