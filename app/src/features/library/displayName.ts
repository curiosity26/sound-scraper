import type { Recording } from '@/bridge/types'

/** The file name without `.mp3`; what rename edits. */
export const displayName = (r: Recording): string => {
  return r.fileName.replace(/\.mp3$/i, '')
}
