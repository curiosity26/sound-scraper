import type { ResolvedElement } from '@/bridge/generated'
import { usePlaylists } from '@/features/playlists/hooks/usePlaylists'
import { useTransport } from '@/features/recorder/components/MainPanel/useTransport'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { windows } from '@/features/skins/windows'

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
  element: ResolvedElement,
): UseSourceDisplayResult => {
  const s = useSkinScale()
  const pl = usePlaylists()
  const transport = useTransport()
  const { recorder: r, active, busy, loaded, shownMessage } = transport
  const { setMessage } = r

  const choose = async () => {
    transport.dismissMessage()
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
