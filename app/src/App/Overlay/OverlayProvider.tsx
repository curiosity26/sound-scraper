import { type FC, type ReactNode, useState } from 'react'

import { OverlayContext } from './OverlayContext'
import type { OverlayName } from './types'

export type OverlayProviderProps = {
  readonly children: ReactNode
}

/** Which side panel is open, for the title bar and the panel itself. */
export const OverlayProvider: FC<OverlayProviderProps> = props => {
  const [shown, setShown] = useState<OverlayName>()
  return (
    <OverlayContext
      value={{
        shown,
        open: setShown,
        close: () => {
          setShown(undefined)
        },
      }}
    >
      {props.children}
    </OverlayContext>
  )
}
