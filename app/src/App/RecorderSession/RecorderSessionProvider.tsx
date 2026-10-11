import type { FC, ReactNode } from 'react'

import { RecorderSessionContext } from './RecorderSessionContext'
import { useRecorderSessionState } from './useRecorderSessionState'

export type RecorderSessionProviderProps = {
  readonly children: ReactNode
}

/** Gives its children the plain UI's recorder session. */
export const RecorderSessionProvider: FC<
  RecorderSessionProviderProps
> = props => (
  <RecorderSessionContext value={useRecorderSessionState()}>
    {props.children}
  </RecorderSessionContext>
)
