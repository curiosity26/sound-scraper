import { platformText } from '@/shared/platformText'

import type { Sort, SortKey } from './types'

export const DEFAULT_SORT: Sort = { key: 'date', ascending: false }

export const REVEAL_LABEL = platformText.revealLabel

export const TRASH_LABEL = platformText.trashLabel

export const TRASH_NAME = platformText.trashName

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
