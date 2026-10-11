import React, { type FC } from 'react'
import { Text } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { modalStyles } from './styles'

/** What saving makes: how many tracks, which re-encode, and from what. */
export const SaveSummary: FC = () => {
  const { th, target, tracks, core } = useEditor()
  const count = tracks.tracks.length
  const { reencoded } = tracks
  return (
    <Text style={[modalStyles.modalBody, { color: th.text }]}>
      Saving creates {count === 1 ? '1 track' : `${count} tracks`} from “
      {target.title}”.
      {reencoded > 0
        ? ` ${
            reencoded === 1 ? 'One is' : `${reencoded} are`
          } re-encoded because a stretch inside was deleted.`
        : ''}
      {core.hasMaster
        ? ' Each is encoded once from the lossless master, cut exactly.'
        : ''}
    </Text>
  )
}
