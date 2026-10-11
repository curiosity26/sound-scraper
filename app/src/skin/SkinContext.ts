import { createContext } from 'react'

import type { ResolvedSkin } from '@/native/bridge'

export const SkinContext = createContext<ResolvedSkin | undefined>(undefined)
