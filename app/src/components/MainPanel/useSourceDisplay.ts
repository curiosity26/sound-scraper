import { useEffect, useState } from 'react'

import { usePlaylists } from '@/hooks/usePlaylists'
import { useSkinScale } from '@/hooks/useSkinScale'
import { playback } from '@/playback/playback'
import type { Message } from '@/recorder/types'
import type { SkinElement } from '@/skin/types'
import { windows } from '@/skin/windows'

import type { UseTransportResult } from './useTransport'

export type UseSourceDisplayResult = {
  /** A recent message, the title playing back, or the capture source. */
  readonly text: string
  readonly accessibilityLabel: string
  /** Shows the source menu under the element. */
  readonly choose: () => Promise<void>
}

/**
 * The source display: the capture source (and the playlist a recording
 * goes into), the title loaded for playback, or for a while the latest
 * message; clicking it chooses the source from a menu.
 */
export const useSourceDisplay = (
  transport: UseTransportResult,
  element: SkinElement | undefined,
): UseSourceDisplayResult => {
  const s = useSkinScale()
  const pl = usePlaylists()
  const [shownMessage, setShownMessage] = useState<Message>()
  const { recorder: r, active, busy, loaded } = transport

  const { setMessage } = r
  useEffect(
    () =>
      playback.onError(text => {
        setMessage({ text, isError: true })
      }),
    [setMessage],
  )

  // Messages show in the source display for a while.
  useEffect(() => {
    if (!r.message) {
      return
    }
    setShownMessage(r.message)
    const timer = setTimeout(
      () => {
        setShownMessage(undefined)
      },
      r.message.isError ? 12000 : 6000,
    )
    return () => {
      clearTimeout(timer)
    }
  }, [r.message])

  const choose = async () => {
    setShownMessage(undefined)
    if (!element) {
      return
    }
    if (active || busy) {
      setMessage({
        text: 'Stop recording to change the source',
        isError: false,
      })
      return
    }
    const apps = r.refreshApps()
    const items = [
      'All system audio',
      '-',
      ...apps.map(a => `${a.isPlaying ? '♪ ' : ''}${a.name}`),
    ]
    const index = apps.findIndex(a => a.pid === r.selectedPid)
    const checked = r.selectedPid === 0 || index < 0 ? 0 : index + 2
    const [x, y, , h] = element.rect
    const chosen = await windows.showMenu(
      items,
      checked,
      x * s,
      (y + h + 2) * s,
    )
    if (chosen === 0) {
      r.setSelectedPid(0)
    } else if (chosen >= 2) {
      const app = apps[chosen - 2]
      if (app) {
        r.setSelectedPid(app.pid)
      }
    }
  }

  // While recording with a playlist showing, the recording goes into it.
  const into =
    active && pl.activeId !== null
      ? pl.playlists.find(x => x.id === pl.activeId)?.name
      : undefined
  const title = transport.playback.title
  const text =
    shownMessage?.text ??
    (loaded && title
      ? `♪ ${title}`
      : into
      ? `${r.sourceName} → ${into}`
      : r.sourceName)

  return {
    text,
    accessibilityLabel: `Source: ${r.sourceName}`,
    choose,
  }
}
