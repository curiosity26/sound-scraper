import type { JsonValue } from '@/bridge/generated'
import {
  isArrayOf,
  isBoolean,
  isNumber,
  isRecordOf,
  isString,
} from '@/shared/utils/guards'

/** Any JSON (a serde_json::Value: element styles, visualizer presets). */
export const isJsonValue = (value: unknown): value is JsonValue =>
  value === null ||
  isString(value) ||
  isNumber(value) ||
  isBoolean(value) ||
  isArrayOf(isJsonValue)(value) ||
  isRecordOf(isJsonValue)(value)
