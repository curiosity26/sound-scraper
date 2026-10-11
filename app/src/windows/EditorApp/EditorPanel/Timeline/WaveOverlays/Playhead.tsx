import React, { type FC } from 'react'
import { View } from 'react-native'

import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { overlayStyles } from './styles'

/** The playhead's line, while there is one. */
export const Playhead: FC = () => {
  const { th, view, headMs } = useEditor()
  if (headMs === null) {
    return null
  }
  return (
    <View
      pointerEvents="none"
      style={[
        overlayStyles.line,
        {
          left: headMs / view.scale,
          backgroundColor: th.wave('playhead', '#ff4a3a'),
        },
      ]}
    />
  )
}
