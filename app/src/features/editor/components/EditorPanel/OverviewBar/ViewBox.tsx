import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/shared/utils/withAlpha'

import { overviewStyles } from './styles'

export type ViewBoxProps = {
  /** Milliseconds per point of the overview. */
  readonly per: number
}

/** The box around what the editor shows. */
export const ViewBox: FC<ViewBoxProps> = props => {
  const { per } = props
  const { th, core, view } = useEditor()
  const viewStartMs = view.firstVisible
  const viewEndMs = Math.min(core.durationMs, view.lastVisible)
  return (
    <View
      pointerEvents="none"
      style={[
        overviewStyles.band,
        styles.box,
        {
          left: viewStartMs / per,
          width: Math.max(4, (viewEndMs - viewStartMs) / per),
          borderColor: th.text,
          backgroundColor: withAlpha(th.text, 0x14),
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderRadius: 3 },
})
