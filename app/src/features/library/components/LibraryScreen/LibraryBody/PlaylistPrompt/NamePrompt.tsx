import type { FC } from 'react'
import { StyleSheet } from 'react-native'

import type { Prompt } from '@/features/library/components/LibraryScreen/LibraryBody/types'
import { usePlaylistPrompt } from '@/features/library/components/LibraryScreen/LibraryBody/usePlaylistPrompt'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { TextField } from '@/shared/components/TextField'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

import { PromptButton } from './PromptButton'
import { PromptDialog } from './PromptDialog'

export type NamePromptProps = {
  readonly prompt: Extract<Prompt, { kind: 'name' }>
}

/** Name a playlist (new, or a rename): OK with a name, Escape cancels. */
export const NamePrompt: FC<NamePromptProps> = props => {
  const { prompt } = props
  const { setPrompt } = usePlaylistPrompt()
  const { textStyle } = useLibraryScreen()
  const t = usePanelStyles()
  const value = prompt.value
  const close = () => {
    setPrompt(null)
  }
  const ok = () => {
    if (value.trim()) {
      close()
      prompt.onDone(value.trim())
    }
  }
  return (
    <PromptDialog
      title={prompt.title}
      field={
        <TextField
          testID="playlist-name"
          autoFocus
          selectTextOnFocus
          value={value}
          onChangeText={text => {
            setPrompt({ ...prompt, value: text })
          }}
          onSubmitEditing={ok}
          onKeyPress={e => {
            if (e.nativeEvent.key === 'Escape') {
              close()
            }
          }}
          style={[styles.input, textStyle, t.input]}
        />
      }
    >
      <PromptButton label="Cancel" onPress={close} />
      <PromptButton label="OK" onPress={ok} accent />
    </PromptDialog>
  )
}

const styles = StyleSheet.create({
  input: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
})
