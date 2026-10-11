import { isRecord } from '@/utils/isRecord'

import type { Skin } from './types'

/** A shallow check of a skin from the native side (its identity and parts). */
export const isSkin = (value: unknown): value is Skin =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.dir === 'string' &&
  isRecord(value.fonts) &&
  isRecord(value.panels) &&
  isRecord(value.visualizer)
