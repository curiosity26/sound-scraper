// Layout here comes from the stage (frames), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import type { FC } from 'react'
import { View } from 'react-native'

import { stage } from '@/features/skins/stage/stage'
import type { StagePanel } from '@/features/skins/stage/types'
import { useStage } from '@/features/skins/stage/useStage'

import { StagePanelView } from './StagePanelView'

// The main panel until the stage and it have sizes: laid out, unseen.
const MEASURING: StagePanel = {
  id: 'main',
  frame: { x: 0, y: 0, w: 0, h: 0 },
  visible: true,
}

/**
 * Linux's root: the stage, a transparent window covering the monitor's work
 * area, with the main panel and the side panels at their places on it
 * (src/features/skins/stage).
 */
export const Stage: FC = () => {
  const { started, panels, order } = useStage()
  return (
    <View
      style={{ flex: 1, backgroundColor: 'transparent' }}
      onLayout={e => {
        stage.setSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height)
      }}
    >
      {(started ? panels : [MEASURING]).map(p => (
        <StagePanelView
          key={p.id}
          panel={p}
          z={order.indexOf(p.id) + 1}
          placed={started}
        />
      ))}
    </View>
  )
}
