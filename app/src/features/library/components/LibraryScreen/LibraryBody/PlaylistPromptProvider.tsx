import React, { type FC, type ReactNode, useMemo, useState } from 'react'

import { PlaylistPromptContext } from './PlaylistPromptContext'
import type { Prompt } from './types'

export type PlaylistPromptProviderProps = {
  readonly children: ReactNode
}

/**
 * Holds the library's in-panel prompt. Its own component, so typing a
 * playlist name re-renders the prompt, not the table around it.
 */
export const PlaylistPromptProvider: FC<
  PlaylistPromptProviderProps
> = props => {
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const value = useMemo(() => ({ prompt, setPrompt }), [prompt])
  return (
    <PlaylistPromptContext value={value}>
      {props.children}
    </PlaylistPromptContext>
  )
}
