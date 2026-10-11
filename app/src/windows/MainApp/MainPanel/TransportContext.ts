import { createContext } from 'react'

import type { Transport } from './types'

/** The main panel's tape transport (see TransportProvider, useTransport). */
export const TransportContext = createContext<Transport | undefined>(undefined)
