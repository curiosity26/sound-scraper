import { Platform } from 'react-native'

import type { Quality, Settings } from '@/bridge/generated'

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

/** The ID3 versions; the default differs (Windows can't show v2.4 covers). */
export const ID3_VERSIONS: readonly {
  readonly value: Settings['id3Version']
  readonly label: string
  readonly detail: string
}[] = [
  {
    value: '2.4',
    label: 'ID3v2.4',
    detail:
      Platform.OS === 'windows'
        ? 'Modern players (Windows Explorer and Media Player can’t show its cover art)'
        : 'Modern players · default',
  },
  {
    value: '2.3',
    label: 'ID3v2.3',
    detail:
      Platform.OS === 'windows'
        ? 'Widest compatibility, shows cover art in Windows · default'
        : 'For older players, car stereos and Windows',
  },
]
