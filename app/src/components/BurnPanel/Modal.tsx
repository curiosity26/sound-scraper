import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { BurnTheme } from '@/burn/types'

import { Button } from './Button'
import { commonStyles } from './commonStyles'

export type ModalProps = {
  readonly th: BurnTheme
  readonly title: string
  readonly body: string
  readonly action: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export const Modal: FC<ModalProps> = props => {
  const { th } = props
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
          <Button th={th} label="Cancel" onPress={props.onCancel} />
          <Button
            th={th}
            label={props.action}
            accent
            onPress={props.onConfirm}
          />
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
