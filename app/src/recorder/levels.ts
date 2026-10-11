/** Linear 0..1: overall peak/RMS and each channel's peak and RMS. */
export type Levels = {
  peak: number
  rms: number
  left: number
  right: number
  rmsLeft: number
  rmsRight: number
}
export const SILENT: Levels = {
  peak: 0,
  rms: 0,
  left: 0,
  right: 0,
  rmsLeft: 0,
  rmsRight: 0,
}
