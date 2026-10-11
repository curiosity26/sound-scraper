import { createContext } from 'react'

import type { ResolvedSkin } from '@/bridge/generated'

export const SkinContext = createContext<ResolvedSkin | undefined>(undefined)
