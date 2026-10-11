import { useEffect, useMemo, useState } from 'react'

import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { ResolvedLayout } from '@/native/bridge'
import type { ElementName, Rect } from '@/skin/types'
import { windows } from '@/skin/windows'

/** Elements that take clicks, so the window doesn't drag from them. */
const INTERACTIVE: ElementName[] = [
  'record',
  'play',
  'pause',
  'stop',
  'seek',
  'source',
  'toggleLibrary',
  'toggleSettings',
  'minimize',
  'shade',
  'close',
]

/** The side panels the main panel toggles. */
export type SidePanel = 'library' | 'settings'

export type UseMainWindowStateResult = {
  /** The shade layout while shaded (when the skin has one), else the main. */
  readonly layout: ResolvedLayout
  /** The layout's drag regions, scaled. */
  readonly dragRegions: readonly Rect[]
  readonly shaded: boolean
  readonly toggleShade: () => void
  /** Whether each side panel is showing. */
  readonly panels: Readonly<Record<SidePanel, boolean>>
  readonly togglePanel: (panel: SidePanel) => void
}

/**
 * The main window: shaded or not (the skin's shade layout), the side
 * panels it toggles, and its size, drag regions and click holes for the
 * native window. MainPanel owns it and shares it with its parts through
 * MainWindowContext (read with useMainWindow).
 */
export const useMainWindowState = (): UseMainWindowStateResult => {
  const skin = useSkin()
  const s = useSkinScale()
  const [shaded, setShaded] = useState(false)
  const [panels, setPanels] = useState(() => ({
    library: windows.isPanelVisible('library'),
    settings: windows.isPanelVisible('settings'),
  }))

  const shade = skin.panels.main.shade
  const layout = shaded && shade ? shade : skin.panels.main

  useEffect(() => {
    const subscription = windows.onEvent(e => {
      if (e.window === 'main' && e.event === 'toggleShade') {
        setShaded(on => !on)
      } else if (e.window === 'library' || e.window === 'settings') {
        setPanels(prev => ({ ...prev, [e.window]: e.event === 'shown' }))
      }
    })
    return () => {
      subscription.remove()
    }
  }, [])

  const dragRegions = useMemo(
    () => layout.dragRegions.map(rect => scaled(rect, s)),
    [layout, s],
  )

  useEffect(() => {
    const holes = INTERACTIVE.flatMap(name => {
      const el = layout.elements[name]
      return el ? [scaled(el.rect, s)] : []
    })
    windows.setMainLayout(
      [layout.size[0] * s, layout.size[1] * s],
      dragRegions,
      holes,
      s,
    )
  }, [layout, s, dragRegions])

  return {
    layout,
    dragRegions,
    shaded,
    toggleShade: () => {
      setShaded(on => !on)
    },
    panels,
    togglePanel: panel => {
      windows.setPanelVisible(panel, !panels[panel])
    },
  }
}

const scaled = (rect: Rect, s: number): Rect => [
  rect[0] * s,
  rect[1] * s,
  rect[2] * s,
  rect[3] * s,
]
