import React, { type FC } from 'react'
import { View } from 'react-native'

import { trackColor } from '@/windows/EditorApp/EditorPanel/trackColor'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'
import { withAlpha } from '@/windows/EditorApp/EditorPanel/withAlpha'

import { overlayStyles } from './styles'

/** Each track's tint, stronger for the selected track. */
export const TrackTints: FC = () => {
  const { view, tracks, selection } = useEditor()
  const { scale } = view
  return (
    <>
      {tracks.rows.map((tr, i) => (
        <View
          key={`t${i}-${tr.startMs}`}
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
