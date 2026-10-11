import { useContext } from 'react'

import type { ResolvedSkin } from '@/native/bridge'
import { SkinContext } from '@/skin/SkinContext'

export const useSkin = (): ResolvedSkin => {
  const skin = useContext(SkinContext)
  if (!skin) {
    throw new Error('useSkin outside a loaded SkinProvider')
  }
  return skin
}
