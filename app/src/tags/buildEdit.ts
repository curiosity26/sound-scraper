import type { TagEdit } from '@/native/types'

import { TEXT_FIELDS } from './constants'
import type { CoverChange, Field } from './types'

/** The edit for the fields the user changed (only those are written). */
export const buildEdit = (
  values: Partial<Record<Field, string>>,
  cover: CoverChange,
  id3v23: boolean,
): TagEdit => {
  const fields = TEXT_FIELDS.filter(f => values[f] !== undefined)
  const text = (f: Exclude<Field, 'track'>) => {
    const v = values[f]?.trim()
    return v ? v : null
  }
  const track = values.track?.trim()
  return {
    fields: [...fields],
    title: text('title'),
    artist: text('artist'),
    album: text('album'),
    albumArtist: text('albumArtist'),
    date: text('date'),
    genre: text('genre'),
    comment: text('comment'),
    track: track ? Number(track) : null,
    cover: cover.kind,
    coverPath: cover.kind === 'set' ? cover.path : null,
    id3v23,
  }
}
