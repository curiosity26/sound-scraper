import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useTextStyle } from '@/App/useTextStyle'
import { colors } from '@/theme/colors'

import { useCoreVersion } from './useCoreVersion'

/** The Rust core's version, or why the bridge couldn't be reached. */
export const CoreVersion: FC = () => {
  const { version, error } = useCoreVersion()
  const { textStyle } = useTextStyle()
  return version ? (
    <Text style={[styles.caption, textStyle]} testID="core-version">
      Rust core v{version}
    </Text>
  ) : (
    <Text style={[styles.caption, styles.error]}>
      Core bridge unavailable: {error}
    </Text>
  )
}

const styles = StyleSheet.create({
  caption: { fontSize: 14, marginTop: 4, marginBottom: 20, opacity: 0.7 },
  error: { color: colors.error },
})
