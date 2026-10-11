import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'
import { errorText } from '@/shared/utils/errorText'

export type ErrorFallbackProps = {
  readonly what: string
  readonly error: unknown
  readonly onRetry: () => void
}

export const ErrorFallback: FC<ErrorFallbackProps> = props => {
  const t = usePanelStyles()
  return (
    <View style={styles.box}>
      <Text style={[styles.text, t.text]}>
        Couldn't {props.what}: {errorText(props.error)}
      </Text>
      <Pressable style={[styles.button, t.button]} onPress={props.onRetry}>
        <Text style={t.buttonText}>Retry</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { padding: 12, gap: 8, alignItems: 'flex-start' },
  text: { color: colors.error },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
})
