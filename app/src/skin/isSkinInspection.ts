import { isRecord } from '@/utils/isRecord'

import type { SkinInspection } from './types'

/** A shallow check of a .sskin inspection from the native side. */
export const isSkinInspection = (value: unknown): value is SkinInspection =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.path === 'string' &&
  Array.isArray(value.warnings)
