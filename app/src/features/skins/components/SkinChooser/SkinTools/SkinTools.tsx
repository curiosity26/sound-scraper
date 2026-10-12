import type { FC } from 'react'
import { Text, View } from 'react-native'

import { styles } from '@/features/skins/components/SkinChooser/styles'
import { useSkinChooser } from '@/features/skins/components/SkinChooser/useSkinChooser'
import { TextLink } from '@/shared/components/TextLink'

import { NewSkinName } from './NewSkinName'

/** Install a .sskin, use a skin folder, or make one from the template. */
export const SkinTools: FC = () => {
  const { pickAndInspect, chooseFolder, naming, setNaming, textStyle } =
    useSkinChooser()
  return (
    <>
      <View style={styles.actions}>
        <TextLink
          label="Install skin…"
          onPress={() => {
            void pickAndInspect()
          }}
        />
        <TextLink
          label="Use skin folder…"
          onPress={() => {
            void chooseFolder()
          }}
        />
        <TextLink
          label="New skin from template…"
          onPress={() => {
            setNaming(naming === undefined ? 'My Skin' : undefined)
          }}
        />
      </View>
      {naming !== undefined && <NewSkinName naming={naming} />}
      <Text style={[styles.hint, textStyle]}>
        Tip: double-click a .sskin file, or drop it on any Sound Scraper window,
        to install it.
      </Text>
    </>
  )
}
