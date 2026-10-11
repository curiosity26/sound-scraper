import type { FC } from 'react'
import { View } from 'react-native'

import { DoubleSizeToggle } from './DoubleSizeToggle'
import { PendingInstall } from './PendingInstall'
import { SkinChooserContext } from './SkinChooserContext'
import { SkinGrid } from './SkinGrid'
import { SkinStatus } from './SkinStatus'
import { SkinTools } from './SkinTools'
import { useSkinActions } from './useSkinActions'

export type SkinChooserProps = {
  readonly textStyle: object
}

/**
 * Settings › Skin: the installed skins as a grid of pictures, the install
 * card for a .sskin being opened, and tools for skin authors (a folder
 * that reloads as it changes, packaging, a starter template). The skin
 * actions (useSkinActions) are shared with the parts through
 * SkinChooserContext.
 */
export const SkinChooser: FC<SkinChooserProps> = props => {
  const actions = useSkinActions()
  return (
    <SkinChooserContext value={{ ...actions, textStyle: props.textStyle }}>
      <View>
        <PendingInstall />
        <SkinGrid />
        <SkinTools />
        <DoubleSizeToggle />
        <SkinStatus />
      </View>
    </SkinChooserContext>
  )
}
