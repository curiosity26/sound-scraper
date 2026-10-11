import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import { BurnPanel } from '@/burn/BurnPanel'
import { burnTarget } from '@/skin/burnTarget'
import { SkinPanelFrame } from '@/skin/SkinPanelFrame'

import { Skinned } from './Skinned'
import { styles } from './styles'

/** The burn window: a playlist to CD or a disc image. */
export function BurnApp(): React.JSX.Element {
  const [name, setName] = useState(burnTarget.get()?.name)
  useEffect(() => burnTarget.subscribe(t => setName(t?.name)), [])
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
