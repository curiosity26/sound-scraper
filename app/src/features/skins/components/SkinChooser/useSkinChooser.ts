import { useContext } from 'react'

import { SkinChooserContext, type SkinChooserState } from './SkinChooserContext'

/** The skin chooser this component is part of (inside a SkinChooser). */
export const useSkinChooser = (): SkinChooserState => {
  const chooser = useContext(SkinChooserContext)
  if (!chooser) {
    throw new Error('useSkinChooser outside a SkinChooser')
  }
  return chooser
}
