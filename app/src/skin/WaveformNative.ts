// macOS: SSWaveformView.mm, a legacy view manager (Fabric interop).
import { requireNativeComponent, type ViewProps } from 'react-native';

export type WaveformProps = ViewProps & {
  /** From editorCore.open. */
  editorId: number;
  /** The time at the left edge, and milliseconds per point. */
  startMs: number;
  msPerPoint: number;
  /** The skin's waveform colors, as JSON. */
  colors: string;
};

export default requireNativeComponent<WaveformProps>('SSWaveformView');
