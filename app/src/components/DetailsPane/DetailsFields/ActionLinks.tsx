import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useDetailsPane } from '@/components/DetailsPane/useDetailsPane'
import { TextLink } from '@/components/TextLink'

/** The actions menu's items as links, and Close (without native menus). */
export const ActionLinks: FC = () => {
  const { actions, onClose } = useDetailsPane()
  return (
    <View style={styles.links}>
      {actions.map(a => (
        <TextLink
          key={a.label}
          label={a.label}
          onPress={() => {
            a.run(0, 0)
          }}
        />
      ))}
      <TextLink label="Close" onPress={onClose} />
    </View>
  )
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
})
