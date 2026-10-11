import React, { type FC } from 'react'

import { TransportButton } from '@/features/recorder/components/MainPanel/TransportButton'
import { useMainWindow } from '@/features/recorder/components/MainPanel/useMainWindow'
import { windows } from '@/features/skins/windows'

import { WindowButton } from './WindowButton'

/** The window's own buttons: side panels, minimize, shade and close. */
export const WindowButtons: FC = () => {
  const win = useMainWindow()
  return (
    <>
      <WindowButton
        name="toggleLibrary"
        label="Library"
        onPress={() => {
          win.togglePanel('library')
        }}
        active={win.panels.library}
      />
      <WindowButton
        name="toggleSettings"
        label="Settings"
        onPress={() => {
          win.togglePanel('settings')
        }}
        active={win.panels.settings}
      />
      <WindowButton
        name="minimize"
        label="Minimize"
        onPress={windows.minimize}
      />
      <WindowButton
        name="shade"
        label={win.shaded ? 'Expand' : 'Collapse'}
        onPress={win.toggleShade}
        active={win.shaded}
      />
      {/* Close quits, like the transport's buttons. */}
      <TransportButton name="close" control="quit" />
    </>
  )
}
