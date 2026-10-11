import { isRecord } from '@/utils/isRecord'

import type { SkinSummary } from './types'

/** A shallow check of an installed skin's summary from the native side. */
export const isSkinSummary = (value: unknown): value is SkinSummary =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.dir === 'string'
