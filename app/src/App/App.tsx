import type { FC } from 'react'

import { AppWindow } from './AppWindow'
import { CaptureSourcesProvider } from './CaptureSources'
import { OverlayProvider } from './Overlay'
import { RecorderSessionProvider } from './RecorderSession'

/** The plain (unskinned) UI, used when skins aren't available. */
export const App: FC = () => (
  <RecorderSessionProvider>
    <CaptureSourcesProvider>
      <OverlayProvider>
        <AppWindow />
      </OverlayProvider>
    </CaptureSourcesProvider>
  </RecorderSessionProvider>
)
