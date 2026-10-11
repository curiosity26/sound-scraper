import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { commonStyles } from './commonStyles'
import { useBurnTheme } from './useBurnTheme'

export type ModalProps = {
  readonly title: string
  readonly body: string
  readonly action: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export const Modal: FC<ModalProps> = props => {
  const th = useBurnTheme()
  return (
    <View style={styles.backdrop}>
      <View
        style={[
          styles.modal,
          { backgroundColor: th.background, borderColor: th.border },
        ]}
      >
        <Text style={[commonStyles.heading, { color: th.text }]}>
          {props.title}
        </Text>
        <Text style={[commonStyles.small, { color: th.text }]}>
          {props.body}
        </Text>
        <View style={commonStyles.buttons}>
          <Button label="Cancel" onPress={props.onCancel} />
          <Button label={props.action} accent onPress={props.onConfirm} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { width: 300, padding: 16, borderRadius: 8, borderWidth: 1, gap: 10 },
})
