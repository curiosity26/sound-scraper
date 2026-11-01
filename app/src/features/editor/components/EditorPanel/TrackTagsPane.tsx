import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { DetailsForm } from '@/features/tags/components/DetailsPane'

import { useEditor } from './useEditor'

/**
 * The tag form beside the editor, aimed at the tracks it was opened on:
 * the track name as the title, the other tags as each track will be saved
 * (its own, else the recording's), and its cover. Several tracks: a bulk
 * edit, differing values shown as mixed. Edits go into the draft, with undo.
 */
export const TrackTagsPane: FC = () => {
  const { th, trackTags } = useEditor()
  const { details } = trackTags
  if (!details) {
    return null
  }
  return (
    <View
      accessibilityLabel="Track tags"
      style={[styles.pane, { borderColor: th.border }]}
    >
      <DetailsForm
        state={{
          ...details,
          fileNames: trackTags.keys,
          heading: trackTags.heading,
          onClose: trackTags.close,
          linkActions: true,
          textStyle: { color: th.text },
          isDark: true,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  pane: {
    width: 240,
    marginLeft: 8,
    paddingLeft: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
})
