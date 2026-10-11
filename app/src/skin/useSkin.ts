import { useContext } from 'react'

import { SkinContext } from './SkinContext'
import type { Skin } from './types'

export const useSkin = (): Skin => {
  const skin = useContext(SkinContext)
  if (!skin) {
    throw new Error('useSkin outside a loaded SkinProvider')
  }
  return skin
}
