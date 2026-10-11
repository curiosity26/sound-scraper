import type { FC } from 'react'

import type { Prompt } from '@/features/library/components/LibraryScreen/LibraryBody/types'
import { usePlaylistPrompt } from '@/features/library/components/LibraryScreen/LibraryBody/usePlaylistPrompt'

import { PromptButton } from './PromptButton'
import { PromptDialog } from './PromptDialog'

export type ConfirmPromptProps = {
  readonly prompt: Extract<Prompt, { kind: 'confirm' }>
}

/** Confirm an action (deleting a playlist): Cancel or the action. */
export const ConfirmPrompt: FC<ConfirmPromptProps> = props => {
  const { prompt } = props
  const { setPrompt } = usePlaylistPrompt()
  const close = () => {
    setPrompt(null)
  }
  return (
    <PromptDialog title={prompt.title} message={prompt.body}>
      <PromptButton label="Cancel" onPress={close} />
      <PromptButton
        label={prompt.action}
        onPress={() => {
          close()
          prompt.onDone()
        }}
        accent
      />
    </PromptDialog>
  )
}
