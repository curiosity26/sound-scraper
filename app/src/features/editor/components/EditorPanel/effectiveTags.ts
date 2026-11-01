import type { Tags } from '@/bridge/types'

import type { TrackRow } from './types'

const pick = (own: string | undefined, recording: string | null | undefined) =>
  own === undefined ? recording ?? null : own || null

/**
 * The tags a track is saved with: its name as the title, its own tags over
 * the recording's, and its place as the track number unless it sets one.
 * `coverPath` finds a cover stored in the draft (null when it's gone).
 */
export const effectiveTags = (
  recording: Tags | undefined,
  track: TrackRow,
  index: number,
  coverPath: (id: string) => string | null,
): Tags => {
  const own = track.tags ?? {}
  return {
    title: track.name,
    artist: pick(own.artist, recording?.artist),
    album: pick(own.album, recording?.album),
    albumArtist: pick(own.albumArtist, recording?.albumArtist),
    date: pick(own.date, recording?.date),
    genre: pick(own.genre, recording?.genre),
    comment: pick(own.comment, recording?.comment),
    track: own.track ?? index + 1,
    coverPath:
      own.cover === undefined
        ? recording?.coverPath ?? null
        : own.cover
        ? coverPath(own.cover)
        : null,
  }
}
