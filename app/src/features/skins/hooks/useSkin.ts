import { useContext } from 'react'

import type { ResolvedSkin } from '@/bridge/generated'
import { SkinContext } from '@/features/skins/SkinContext'

export const useSkin = (): ResolvedSkin => {
  const skin = useContext(SkinContext)
  if (!skin) {
    throw new Error('useSkin outside a loaded SkinProvider')
  }
  return skin
}
