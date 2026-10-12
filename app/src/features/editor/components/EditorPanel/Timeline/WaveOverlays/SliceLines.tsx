import React, { type FC } from 'react'
import { View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/shared/utils/withAlpha'

import { overlayStyles } from './styles'

/** The slices, the selected one highlighted. */
export const SliceLines: FC = () => {
  const { th, view, selection, drag } = useEditor()
  const { scale } = view
  return (
    <>
      {drag.shown.splices.map(s => (
        <View
          key={s.id}
          pointerEvents="none"
          style={[
            overlayStyles.line,
            {
              left: s.atMs / scale,
              backgroundColor:
                s.id === selection.selectedSlice
                  ? th.wave('spliceSelected', '#fff0a0')
                  : withAlpha(th.text, 0xb0),
            },
          ]}
        />
      ))}
    </>
  )
}
