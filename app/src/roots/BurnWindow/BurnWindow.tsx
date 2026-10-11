import { type FC, useSyncExternalStore } from 'react'
import { View } from 'react-native'

import { burnTarget } from '@/features/burn/burnTarget'
import { BurnPanel } from '@/features/burn/components/BurnPanel'
import { Skinned } from '@/features/skins/components/Skinned'
import { SkinPanelFrame } from '@/features/skins/components/SkinPanelFrame'
import { styles } from '@/shared/theme/styles'

/** The burn window: a playlist to CD or a disc image. */
export const BurnWindow: FC = () => {
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
