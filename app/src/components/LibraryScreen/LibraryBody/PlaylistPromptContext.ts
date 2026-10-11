import { createContext } from 'react'

import type { PlaylistPromptState } from './types'

/**
 * The library's in-panel prompt: opened by the playlist menus, shown by
 * PlaylistPrompt (see PlaylistPromptProvider).
 */
export const PlaylistPromptContext = createContext<PlaylistPromptState | null>(
  null,
)
