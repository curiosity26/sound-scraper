import type { FC } from 'react'

import type { Prompt } from '@/features/library/components/LibraryScreen/LibraryBody/types'
import { usePlaylistPrompt } from '@/features/library/components/LibraryScreen/LibraryBody/usePlaylistPrompt'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { playlists } from '@/features/playlists/playlists'
import { errorText } from '@/shared/utils/errorText'

import { PromptButton } from './PromptButton'
import { PromptDialog } from './PromptDialog'

export type DuplicatesPromptProps = {
  readonly prompt: Extract<Prompt, { kind: 'duplicates' }>
}

/** Some (or all) of the recordings being added are already in the
 * playlist: add them again, skip them, or cancel. */
export const DuplicatesPrompt: FC<DuplicatesPromptProps> = props => {
  const { prompt } = props
  const { setPrompt } = usePlaylistPrompt()
  const { onMessage } = useLibraryScreen()
  const n = prompt.fileNames.length
  const all = prompt.already === n
  const close = () => {
    setPrompt(null)
  }
  const add = (names: readonly string[]) => {
    close()
    try {
      if (names.length) {
        playlists.add(prompt.playlistId, names)
      }
      onMessage({
        text: `Added to ${prompt.playlistName}.`,
        isError: false,
      })
    } catch (e) {
      onMessage({
        text: `Couldn't add to the playlist: ${errorText(e)}`,
        isError: true,
      })
    }
  }
  return (
    <PromptDialog
      title={
        all
          ? `Already in ${prompt.playlistName}`
          : `Some are already in ${prompt.playlistName}`
      }
      message={
        all
          ? n === 1
            ? 'This recording is already in the playlist. Add it again?'
            : `All ${n} recordings are already in the playlist. Add them again?`
          : `${prompt.already} of the ${n} recordings ${
              prompt.already === 1 ? 'is' : 'are'
            } already in the playlist.`
      }
    >
      <PromptButton label="Cancel" onPress={close} />
      {!all && (
        <PromptButton
          label="Skip Them"
          onPress={() => {
            const have = playlists.fileNamesIn(prompt.playlistId)
            add(prompt.fileNames.filter(f => !have.has(f)))
          }}
        />
      )}
      <PromptButton
        label={all ? 'Add Again' : 'Add All'}
        onPress={() => {
          add(prompt.fileNames)
        }}
        accent
      />
    </PromptDialog>
  )
}
