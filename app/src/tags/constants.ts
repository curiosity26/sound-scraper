import type { Field } from './types'

export const TEXT_FIELDS = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'date',
  'track',
  'genre',
  'comment',
] as const

export const FIELD_LABELS: Record<Field, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  date: 'Year / date',
  track: 'Track #',
  genre: 'Genre',
  comment: 'Comment',
}
