import { type FC, useSyncExternalStore } from 'react'
import { View } from 'react-native'

import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { burnTarget } from '@/skin/burnTarget'
import { Skinned } from '@/windows/Skinned'
import { styles } from '@/windows/styles'

import { BurnPanel } from './BurnPanel'

/** The burn window: a playlist to CD or a disc image. */
export const BurnApp: FC = () => {
  const name = useSyncExternalStore(burnTarget.subscribe, burnTarget.get)?.name
  return (
    <Skinned>
      <SkinPanelFrame panel="burn" title={name ? `Burn: ${name}` : 'Burn CD'}>
        <View style={styles.content}>
          <BurnPanel />
        </View>
      </SkinPanelFrame>
    </Skinned>
  )
}
