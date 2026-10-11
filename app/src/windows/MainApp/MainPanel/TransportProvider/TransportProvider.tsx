import type { FC, ReactNode } from 'react'

import type { SkinLayout } from '@/skin/types'
import { TransportContext } from '@/windows/MainApp/MainPanel/TransportContext'

import { useTransportState } from './useTransportState'

export type TransportProviderProps = {
  /** The layout's elements: which buttons the skin has decides what they do. */
  readonly elements: SkinLayout['elements']
  readonly children: ReactNode
}

/**
 * Owns the main panel's tape transport (the recorder's state and events,
 * the playback, the message showing) once for the window, for the buttons
 * and displays to read with useTransport. It stays mounted while the
 * window shades, so nothing resets when elements come and go.
 */
export const TransportProvider: FC<TransportProviderProps> = props => {
  const transport = useTransportState(props.elements)
  return (
    <TransportContext.Provider value={transport}>
      {props.children}
    </TransportContext.Provider>
  )
}
