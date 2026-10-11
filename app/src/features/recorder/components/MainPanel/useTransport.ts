import { useContext } from 'react'

import { TransportContext } from './TransportContext'
import type { Transport } from './types'

export type UseTransportResult = Transport

/**
 * The tape transport from the main panel's TransportProvider: one recorder
 * and playback subscription shared by the buttons and displays.
 */
export const useTransport = (): UseTransportResult => {
  const transport = useContext(TransportContext)
  if (!transport) {
    throw new Error('useTransport outside a TransportProvider')
  }
  return transport
}
