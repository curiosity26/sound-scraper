import type { ExportAnswer } from '@/native/bridge'
import { isNumber, isShape } from '@/utils/guards'

export const isExportAnswer = isShape<ExportAnswer>({ missing: isNumber })
