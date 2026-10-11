import { useContext } from 'react'

import { SkinContext } from './SkinContext'
import type { Skin } from './types'

export function useSkin(): Skin {
  const skin = useContext(SkinContext)
  if (!skin) {
    throw new Error('useSkin outside a loaded SkinProvider')
  }
  return skin
}
