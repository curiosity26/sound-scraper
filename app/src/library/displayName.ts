import type { Recording } from '@/native/types'

/** The file name without `.mp3`; what rename edits. */
export function displayName(r: Recording): string {
  return r.fileName.replace(/\.mp3$/i, '')
}
