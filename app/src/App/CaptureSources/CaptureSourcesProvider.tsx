import type { FC, ReactNode } from 'react'

import { CaptureSourcesContext } from './CaptureSourcesContext'
import { useCaptureSourcesState } from './useCaptureSourcesState'

export type CaptureSourcesProviderProps = {
  readonly children: ReactNode
}

/** Gives its children the recordable apps and the chosen source. */
export const CaptureSourcesProvider: FC<
  CaptureSourcesProviderProps
> = props => (
  <CaptureSourcesContext value={useCaptureSourcesState()}>
    {props.children}
  </CaptureSourcesContext>
)
