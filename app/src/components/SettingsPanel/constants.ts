import type { Quality } from '@/native/types'

export const QUALITIES: readonly {
  readonly value: Quality
  readonly label: string
  readonly detail: string
}[] = [
  { value: 'cbr128', label: '128 kbps', detail: 'Constant bitrate · smallest' },
  { value: 'cbr192', label: '192 kbps', detail: 'Constant bitrate · default' },
  { value: 'cbr256', label: '256 kbps', detail: 'Constant bitrate' },
  { value: 'cbr320', label: '320 kbps', detail: 'Constant bitrate · largest' },
  { value: 'vbr0', label: 'VBR V0', detail: 'Variable · about 245 kbps' },
  { value: 'vbr2', label: 'VBR V2', detail: 'Variable · about 190 kbps' },
]
