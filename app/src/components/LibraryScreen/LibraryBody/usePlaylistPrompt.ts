import { useContext } from 'react'

import { PlaylistPromptContext } from './PlaylistPromptContext'
import type { PlaylistPromptState } from './types'

/** The library's in-panel prompt (inside a PlaylistPromptProvider). */
export const usePlaylistPrompt = (): PlaylistPromptState => {
  const state = useContext(PlaylistPromptContext)
  if (!state) {
    throw new Error('usePlaylistPrompt outside a PlaylistPromptProvider')
  }
  return state
}
