import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { TextField } from '@/components/TextField'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { playlists } from '@/playlists/playlists'
import { colors } from '@/theme/colors'
import { errorText } from '@/utils/errorText'

import type { UsePlaylistControlsResult } from './usePlaylistControls'

/** The in-panel prompt (name a playlist, confirm a delete, duplicates). */
export type PlaylistPromptProps = {
  readonly controls: UsePlaylistControlsResult
  readonly textStyle: object
  readonly onMessage: (m: { text: string; isError: boolean }) => void
}

export const PlaylistPrompt: FC<PlaylistPromptProps> = props => {
  const { prompt, setPrompt } = props.controls
  const theme = usePanelTheme()
  const t = usePanelStyles()
  if (!prompt) {
    return null
  }
  const bg = theme?.background ?? '#2a2522'
  const fg = { color: theme?.text ?? '#f3ead0' }
  const close = () => {
    setPrompt(null)
  }
  const button = (label: string, onPress: () => void, accent = false) => (
    <Pressable
      key={label}
      testID={`prompt-${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: accent
            ? theme?.accent ?? colors.accent
            : 'transparent',
          borderColor: theme?.border ?? colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, accent ? styles.accentText : fg]}>
        {label}
      </Text>
    </Pressable>
  )

  let title: string
  let body: React.ReactNode = null
  let buttons: React.ReactNode[]
  switch (prompt.kind) {
    case 'name': {
      title = prompt.title
      const value = prompt.value
      const ok = () => {
        if (value.trim()) {
          close()
          prompt.onDone(value.trim())
        }
      }
      body = (
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
          style={[styles.input, props.textStyle, t.input]}
        />
      )
      buttons = [button('Cancel', close), button('OK', ok, true)]
      break
    }
    case 'confirm':
      title = prompt.title
      body = <Text style={[styles.body, fg]}>{prompt.body}</Text>
      buttons = [
        button('Cancel', close),
        button(
          prompt.action,
          () => {
            close()
            prompt.onDone()
          },
          true,
        ),
      ]
      break
    case 'duplicates': {
      const n = prompt.fileNames.length
      const all = prompt.already === n
      title = all
        ? `Already in ${prompt.playlistName}`
        : `Some are already in ${prompt.playlistName}`
      body = (
        <Text style={[styles.body, fg]}>
          {all
            ? n === 1
              ? 'This recording is already in the playlist. Add it again?'
              : `All ${n} recordings are already in the playlist. Add them again?`
            : `${prompt.already} of the ${n} recordings ${
                prompt.already === 1 ? 'is' : 'are'
              } already in the playlist.`}
        </Text>
      )
      const add = (names: readonly string[]) => {
        close()
        try {
          if (names.length) {
            playlists.add(prompt.playlistId, names)
          }
          props.onMessage({
            text: `Added to ${prompt.playlistName}.`,
            isError: false,
          })
        } catch (e) {
          props.onMessage({
            text: `Couldn't add to the playlist: ${errorText(e)}`,
            isError: true,
          })
        }
      }
      const there = () => playlists.fileNamesIn(prompt.playlistId)
      buttons = [
        button('Cancel', close),
        ...(all
          ? []
          : [
              button('Skip Them', () => {
                const have = there()
                add(prompt.fileNames.filter(f => !have.has(f)))
              }),
            ]),
        button(
          all ? 'Add Again' : 'Add All',
          () => {
            add(prompt.fileNames)
          },
          true,
        ),
      ]
      break
    }
  }
  return (
    <View style={styles.backdrop} testID="playlist-prompt">
      <View
        style={[
          styles.modal,
          { backgroundColor: bg, borderColor: theme?.border ?? colors.border },
        ]}
      >
        <Text style={[styles.title, fg]}>{title}</Text>
        {body}
        <View style={styles.buttons}>{buttons}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    width: 320,
    maxWidth: '92%',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  title: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 12, lineHeight: 17 },
  input: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  buttonText: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
})
