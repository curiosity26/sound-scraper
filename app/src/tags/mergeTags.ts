import type { Tags } from '@/native/types'

import { TEXT_FIELDS } from './constants'
import { fieldText } from './fieldText'
import type { Field, Merged } from './types'

/** Shared values for each field; differing values become 'mixed'. */
export function mergeTags(all: Tags[]): Record<Field, Merged> {
  const out = {} as Record<Field, Merged>
  for (const field of TEXT_FIELDS) {
    const texts = new Set(all.map(t => fieldText(t, field)))
    out[field] =
      texts.size <= 1
        ? { kind: 'value', text: [...texts][0] ?? '' }
        : { kind: 'mixed' }
  }
  return out
}
