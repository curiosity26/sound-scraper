import type { TrackRow } from './types'

/** What a track is called in labels: "Track 2", or "Deleted track". */
export const trackLabel = (track: TrackRow): string => {
  return track.number === null
    ? 'Deleted track'
    : `Track ${String(track.number)}`
}
