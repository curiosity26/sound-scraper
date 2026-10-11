import type { StoredSettings } from '@/bridge/generated'
import {
  isBoolean,
  isNullable,
  isNumber,
  isShape,
  isString,
} from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

import { isQuality } from './isQuality'
import { isSourceRef } from './isSourceRef'

export const isStoredSettings = isShape<StoredSettings>({
  effectiveRecordingsDir: isString,
  version: isNumber,
  recordingsDir: isNullable(isString),
  quality: isQuality,
  id3Version: isUnionOf<StoredSettings['id3Version']>()('2.4', '2.3'),
  lastSource: isNullable(isSourceRef),
  skin: isNullable(isString),
  doubleSize: isBoolean,
  trimSilence: isBoolean,
  keepMasters: isBoolean,
  masterMinMinutes: isNumber,
  masterBudgetGb: isNumber,
  masterMaxAgeDays: isNumber,
})
