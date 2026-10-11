import { Platform } from 'react-native'

import type { Sort, SortKey } from './types'

export const DEFAULT_SORT: Sort = { key: 'date', ascending: false }

const isWindows = Platform.OS === 'windows'

export const REVEAL_LABEL = isWindows ? 'Show in Explorer' : 'Show in Finder'

export const TRASH_LABEL = isWindows ? 'Move to Recycle Bin' : 'Move to Trash'

export const TRASH_NAME = isWindows ? 'the Recycle Bin' : 'the Trash'

export const COLUMNS = [
  { key: 'name', label: 'Name', flex: 4 },
  { key: 'duration', label: 'Duration', flex: 1 },
  { key: 'date', label: 'Date recorded', flex: 2 },
  { key: 'size', label: 'Size', flex: 1 },
  { key: 'artist', label: 'Artist / Album', flex: 2 },
] as const satisfies readonly {
  key: SortKey
  label: string
  flex: number
}[]
