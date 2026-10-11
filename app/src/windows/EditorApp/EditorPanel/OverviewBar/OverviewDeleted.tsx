import React, { type FC } from 'react'
import { View } from 'react-native'

import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { overviewStyles } from './styles'

export type OverviewDeletedProps = {
  /** Milliseconds per point of the overview. */
  readonly per: number
}

/** The deleted stretches, darkened. */
export const OverviewDeleted: FC<OverviewDeletedProps> = props => {
  const { per } = props
  const { th, drag } = useEditor()
  return (
    <>
      {drag.shown.deleted.map(r => (
        <View
          key={r.id}
          pointerEvents="none"
          style={[
            overviewStyles.band,
            {
              left: r.startMs / per,
              width: Math.max(1, (r.endMs - r.startMs) / per),
              backgroundColor: th.wave('deleted', '#00000099'),
            },
          ]}
        />
      ))}
    </>
  )
}
