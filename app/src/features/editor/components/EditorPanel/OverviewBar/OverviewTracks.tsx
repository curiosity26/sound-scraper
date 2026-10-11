import React, { type FC } from 'react'
import { View } from 'react-native'

import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/features/editor/components/EditorPanel/withAlpha'

import { overviewStyles } from './styles'

export type OverviewTracksProps = {
  /** Milliseconds per point of the overview. */
  readonly per: number
}

/** Each track's tint across the overview. */
export const OverviewTracks: FC<OverviewTracksProps> = props => {
  const { per } = props
  const { core, tracks } = useEditor()
  const starts = tracks.tracks.map(t => t.startMs)
  return (
    <>
      {tracks.tracks.map((t, i) => (
        <View
          key={`${i}-${t.startMs}`}
          pointerEvents="none"
          style={[
            overviewStyles.band,
            {
              left: t.startMs / per,
              width: ((starts[i + 1] ?? core.durationMs) - t.startMs) / per,
              backgroundColor: withAlpha(trackColor(i), 0x30),
            },
          ]}
        />
      ))}
    </>
  )
}
