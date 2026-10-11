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

export const MIN_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120]
export const BUDGETS_GB = [1, 2, 5, 10, 20, 50, 100]
export const AGES_DAYS = [7, 14, 30, 60, 90, 180, 365]
