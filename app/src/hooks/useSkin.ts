import { useContext } from 'react'

import { SkinContext } from '@/skin/SkinContext'
import type { Skin } from '@/skin/types'

export const useSkin = (): Skin => {
  const skin = useContext(SkinContext)
  if (!skin) {
    throw new Error('useSkin outside a loaded SkinProvider')
  }
  return skin
}
