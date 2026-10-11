import type { FC } from 'react'

import { usePlaylistPrompt } from '@/components/LibraryScreen/LibraryBody/usePlaylistPrompt'
import { assertNever } from '@/utils/assertNever'

import { ConfirmPrompt } from './ConfirmPrompt'
import { DuplicatesPrompt } from './DuplicatesPrompt'
import { NamePrompt } from './NamePrompt'

/** The in-panel prompt (name a playlist, confirm a delete, duplicates). */
export const PlaylistPrompt: FC = () => {
  const { prompt } = usePlaylistPrompt()
  if (!prompt) {
    return null
  }
  switch (prompt.kind) {
    case 'name':
      return <NamePrompt prompt={prompt} />
    case 'confirm':
      return <ConfirmPrompt prompt={prompt} />
    case 'duplicates':
      return <DuplicatesPrompt prompt={prompt} />
    default:
      return assertNever(prompt)
  }
}
