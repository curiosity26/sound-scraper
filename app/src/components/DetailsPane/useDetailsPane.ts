import { useContext } from 'react'

import { DetailsPaneContext, type DetailsPaneState } from './DetailsPaneContext'

/** The details pane this component is part of (inside a DetailsPane). */
export const useDetailsPane = (): DetailsPaneState => {
  const pane = useContext(DetailsPaneContext)
  if (!pane) {
    throw new Error('useDetailsPane outside a DetailsPane')
  }
  return pane
}
