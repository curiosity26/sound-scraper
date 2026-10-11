import { createContext } from 'react'

import type { Skin } from './types'

export const SkinContext = createContext<Skin | undefined>(undefined)
