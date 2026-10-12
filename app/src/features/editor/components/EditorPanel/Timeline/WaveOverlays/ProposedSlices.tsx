import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/shared/utils/withAlpha'

import { overlayStyles } from './styles'

/** Auto Slice's proposed slices (dashed) and the gaps they're in. */
export const ProposedSlices: FC = () => {
  const { th, view, autoSlice } = useEditor()
  const { scale } = view
  return (
    <>
      {autoSlice.proposals.map(p => (
        <React.Fragment key={`p${String(p.atMs)}`}>
          <View
            pointerEvents="none"
            style={[
              overlayStyles.band,
              {
                left: p.gapStartMs / scale,
                width: Math.max(1, (p.gapEndMs - p.gapStartMs) / scale),
                backgroundColor: withAlpha(th.accent, 0x26),
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              overlayStyles.band,
              styles.proposal,
              { left: p.atMs / scale, borderColor: th.accent },
            ]}
          />
        </React.Fragment>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  proposal: { width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed' },
})
