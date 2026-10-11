import type { ResolvedFramePanel } from '@/native/bridge'
import {
  isBoolean,
  isNullable,
  isRecordOf,
  isShape,
  isString,
} from '@/utils/guards'

import { isNumberPair } from './isNumberPair'
import { isResolvedClose } from './isResolvedClose'
import { isResolvedFrame } from './isResolvedFrame'
import { isResolvedScrollbar } from './isResolvedScrollbar'
import { isResolvedTitle } from './isResolvedTitle'

export const isResolvedFramePanel = isShape<ResolvedFramePanel>({
  minSize: isNullable(isNumberPair),
  resizable: isBoolean,
  frame: isNullable(isResolvedFrame),
  table: isRecordOf(isString),
  scrollbar: isNullable(isResolvedScrollbar),
  controls: isRecordOf(isString),
  waveform: isRecordOf(isString),
  playlist: isRecordOf(isString),
  progress: isRecordOf(isString),
  title: isNullable(isResolvedTitle),
  close: isNullable(isResolvedClose),
  menu: isNullable(isResolvedClose),
  grip: isNumberPair,
})
