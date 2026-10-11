import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { overlayStyles } from './styles'

/** The deleted stretches, darkened; the selected one outlined. */
export const DeletedStretches: FC = () => {
  const { th, view, selection, drag } = useEditor()
  const { scale } = view
  const c = th.wave
  return (
    <>
      {drag.shown.deleted.map(r => {
        const edge =
          r.id === selection.selectedRegion
            ? c('spliceSelected', '#fff0a0')
            : 'transparent'
        return (
          <View
            key={r.id}
            pointerEvents="none"
            style={[
              overlayStyles.band,
              styles.deleted,
              {
                left: r.startMs / scale,
                width: Math.max(1, (r.endMs - r.startMs) / scale),
                backgroundColor: c('deleted', '#00000099'),
                borderColor: edge,
              },
            ]}
          />
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  deleted: { borderWidth: 1 },
})
