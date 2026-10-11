import type { FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import { TextField } from '@/components/TextField'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { styles } from '@/windows/SettingsApp/SkinChooser/styles'
import { useSkinChooser } from '@/windows/SettingsApp/SkinChooser/useSkinChooser'

export type NewSkinNameProps = {
  /** The name typed so far. */
  readonly naming: string
}

/** The new skin's name, then Choose folder… to make it from the template. */
export const NewSkinName: FC<NewSkinNameProps> = props => {
  const { naming } = props
  const { setNaming, create } = useSkinChooser()
  const t = usePanelStyles()
  return (
    <View style={styles.nameRow}>
      <TextField
        value={naming}
        onChangeText={setNaming}
        onSubmitEditing={() => {
          if (naming.trim()) {
            void create(naming.trim())
          }
        }}
        placeholder="Skin name"
        style={[styles.input, t.input]}
        autoFocus
      />
      <Pressable
        disabled={!naming.trim()}
        onPress={() => {
          void create(naming.trim())
        }}
        style={[styles.button, t.button]}
      >
        <Text style={[styles.buttonText, t.buttonText]}>Choose folder…</Text>
      </Pressable>
    </View>
  )
}
