// The library's recordings, as a promise for use() under <Suspense>. A
// refresh swaps in a new promise inside a transition, so the table keeps
// showing the old rows while the folder is read again.
import { startTransition, useEffect, useState } from 'react'

import type { Recording } from '@/bridge/types'
import { library } from '@/features/library/library'
import { refreshers } from '@/features/library/refreshers'
import { playlists } from '@/features/playlists/playlists'
import { errorText } from '@/shared/utils/errorText'

import type { OnMessage } from './types'

/** Reads that failed, so Retry knows to read again. */
const failed = new WeakSet<Promise<readonly Recording[]>>()

const track = (
  read: Promise<readonly Recording[]>,
): Promise<readonly Recording[]> => {
  read.catch(() => {
    failed.add(read)
  })
  return read
}

/** Renames and trashing through the core update playlists too. A failure
 * here is reported, and the recordings still show. */
const refreshPlaylists = (onMessage: OnMessage) => {
  try {
    playlists.refresh()
  } catch (e) {
    onMessage({
      text: `Couldn't read the library: ${errorText(e)}`,
      isError: true,
    })
  }
}

/** The first read (and a retry): nothing shows yet, so the playlists can
 * follow once the list is in. */
const firstRead = (onMessage: OnMessage): Promise<readonly Recording[]> =>
  track(
    library.list().then(recordings => {
      refreshPlaylists(onMessage)
      return recordings
    }),
  )

export type UseRecordingListResult = {
  /** Resolves with the recordings; replaced on every refresh. */
  readonly recordings: Promise<readonly Recording[]>
  /** Reads again after a failed read (the error boundary's Retry). */
  readonly retry: () => void
}

export const useRecordingList = (
  onMessage: OnMessage,
): UseRecordingListResult => {
  const [recordings, setRecordings] = useState(() => firstRead(onMessage))

  useEffect(() => {
    const refresh = () => {
      startTransition(() => {
        setRecordings(track(library.list()))
        // Re-read the playlists now, in the same transition, so they show
        // with the new list (a renamed track never shows as missing).
        refreshPlaylists(onMessage)
      })
    }
    refreshers.add(refresh)
    const subscription = library.onChanged(refresh)
    return () => {
      refreshers.delete(refresh)
      subscription.remove()
    }
  }, [onMessage])

  return {
    recordings,
    // The boundary also resets when a refresh brings a new promise; only a
    // failed read needs reading again.
    retry: () => {
      if (failed.has(recordings)) {
        setRecordings(firstRead(onMessage))
      }
    },
  }
}
