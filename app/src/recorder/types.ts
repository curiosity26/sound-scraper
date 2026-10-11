export type Message = { readonly text: string; readonly isError: boolean }

/** Linear 0..1: overall peak/RMS and each channel's peak and RMS. */
export type Levels = {
  readonly peak: number
  readonly rms: number
  readonly left: number
  readonly right: number
  readonly rmsLeft: number
  readonly rmsRight: number
}
