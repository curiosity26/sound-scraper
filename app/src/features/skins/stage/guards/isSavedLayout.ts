import type { SavedLayout, SavedPanel } from '@/features/skins/stage/types'
import {
  isArrayOf,
  isBoolean,
  isNumber,
  isOptional,
  isShape,
  isString,
} from '@/shared/utils/guards'

const isSavedPanel = isShape<SavedPanel>({
  id: isString,
  x: isNumber,
  y: isNumber,
  w: isNumber,
  h: isNumber,
  visible: isOptional(isBoolean),
})

export const isSavedLayout = isShape<SavedLayout>({
  panels: isOptional(isArrayOf(isSavedPanel)),
  scale: isOptional(isNumber),
})
