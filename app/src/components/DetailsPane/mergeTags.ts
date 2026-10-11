import type { Tags } from '@/native/types'
import type { Field, Merged } from '@/tags/types'

import { fieldText } from './fieldText'

/** Shared values for each field; differing values become 'mixed'. */
export const mergeTags = (all: readonly Tags[]): Record<Field, Merged> => {
  const merge = (field: Field): Merged => {
    const texts = new Set(all.map(t => fieldText(t, field)))
    return texts.size <= 1
      ? { kind: 'value', text: [...texts][0] ?? '' }
      : { kind: 'mixed' }
  }
  // Every field in TEXT_FIELDS; the return type checks none is missing.
  return {
    title: merge('title'),
    artist: merge('artist'),
    album: merge('album'),
    albumArtist: merge('albumArtist'),
    date: merge('date'),
    track: merge('track'),
    genre: merge('genre'),
    comment: merge('comment'),
  }
}
