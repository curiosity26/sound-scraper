import type { ExportAnswer } from '@/bridge/generated'
import { isNumber, isShape } from '@/shared/utils/guards'

export const isExportAnswer = isShape<ExportAnswer>({ missing: isNumber })
