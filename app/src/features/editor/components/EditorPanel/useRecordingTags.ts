// The recording's own tags: what each track is saved with, unless the
// track overrides it.
import { useEffect, useState } from 'react'

import type { Tags } from '@/bridge/types'
import { library } from '@/features/library/library'
import { onRejected } from '@/shared/utils/onRejected'

export type UseRecordingTagsResult = {
  /** The recording's tags; undefined while they're read (or if they can't be). */
  readonly tags: Tags | undefined
}

// The tracks then show only their own tags; nothing more the editor can do.
const warnReadFailed = (message: string) => {
  console.warn(`Reading the recording's tags failed: ${message}`)
}

export const useRecordingTags = (fileName: string): UseRecordingTagsResult => {
  const [tags, setTags] = useState<Tags>()
  useEffect(() => {
    let live = true
    library
      .readTags(fileName)
      .then(t => {
        if (live) {
          setTags(t)
        }
      })
      .catch(onRejected(warnReadFailed))
    return () => {
      live = false
    }
  }, [fileName])
  return { tags }
}
