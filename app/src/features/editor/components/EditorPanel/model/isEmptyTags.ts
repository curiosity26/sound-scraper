import type { TrackTags } from '@/bridge/generated'

/**
 * No overrides: the track is tagged like the recording. A field set to
 * undefined is no override (and isn't saved, as JSON leaves it out).
 */
export const isEmptyTags = (tags: TrackTags | undefined): boolean => {
  return !tags || JSON.stringify(tags) === '{}'
}
