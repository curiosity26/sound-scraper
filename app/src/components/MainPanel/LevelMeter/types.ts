import type { SkinElement } from '@/skin/types'

export type MeterProps = {
  readonly element: SkinElement
  /** Linear 0..1: the louder channel's peak, and each channel's. */
  readonly peak: number
  readonly left: number
  readonly right: number
  /** Each channel's RMS (needle meters), when known. */
  readonly rmsLeft?: number
  readonly rmsRight?: number
}
