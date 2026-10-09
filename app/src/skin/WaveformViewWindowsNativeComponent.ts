// Windows: the track editor's waveform view
// (app/windows/SoundScraper/WaveformView.h), a Fabric component.
// codegenNativeComponent gives it a static view config.
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native'
import { codegenNativeComponent } from 'react-native'

export interface NativeProps extends ViewProps {
  editorId?: CodegenTypes.Double
  startMs?: CodegenTypes.Double
  msPerPoint?: CodegenTypes.Double
  /** The skin's waveform colors, as JSON. */
  colors?: string
}

export default codegenNativeComponent<NativeProps>(
  'SSWaveformView',
) as HostComponent<NativeProps>
