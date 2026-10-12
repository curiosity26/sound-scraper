import React, { type FC } from 'react'
import { View } from 'react-native'

import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/features/editor/components/EditorPanel/withAlpha'

import { overlayStyles } from './styles'

/** Each track's tint, stronger for the selected track. */
export const TrackTints: FC = () => {
  const { view, tracks, selection } = useEditor()
  const { scale } = view
  return (
    <>
      {tracks.rows.map((tr, i) => (
        <View
          key={`t${String(i)}-${String(tr.startMs)}`}
          pointerEvents="none"
          style={[
            overlayStyles.band,
            {
              left: tr.startMs / scale,
              width: (tracks.trackEnd(i) - tr.startMs) / scale,
              backgroundColor: withAlpha(
                trackColor(i),
                selection.selectedTrack === i ? 0x22 : 0x10,
              ),
            },
          ]}
        />
      ))}
    </>
  )
}
