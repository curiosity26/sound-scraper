import type { FC } from 'react'
import { ActivityIndicator, StyleSheet, Text } from 'react-native'

import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'

import { useDetailsPane } from './useDetailsPane'

/** A spinner while saving, then the last error or else the last notice. */
export const DetailsStatus: FC = () => {
  const { busy, error, notice, textStyle } = useDetailsPane()
  const t = usePanelStyles()
  return (
    <>
      {busy && <ActivityIndicator style={styles.busy} />}
      {error && (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      )}
      {!error && notice && (
        <Text style={[styles.notice, textStyle, t.text]}>{notice}</Text>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  busy: { marginTop: 6 },
  error: { color: colors.error, fontSize: 12, marginTop: 6 },
  notice: { fontSize: 12, marginTop: 6, opacity: 0.8 },
})
