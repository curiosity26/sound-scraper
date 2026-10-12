import React, { type FC, startTransition, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useDetailsPane } from '@/features/tags/components/DetailsPane/useDetailsPane'
import { TextField } from '@/shared/components/TextField'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'
import { errorText } from '@/shared/utils/errorText'

/**
 * A value shown as text; click to edit in place. Enter (or leaving the
 * field) commits, Esc cancels. `onCommit` resolves false to keep editing.
 */
export type InlineFieldProps = {
  readonly label: string
  readonly value: string
  readonly mixed?: boolean
  readonly multiline?: boolean
  readonly large?: boolean
  readonly onCommit: (text: string) => Promise<boolean>
}

// onCommit reports its own failures in the pane and resolves false to keep
// the field open, so this only sees a bug: dev console.
const warnCommitFailed = (e: unknown) => {
  console.warn(`Committing a field failed: ${errorText(e)}`)
}

export const InlineField: FC<InlineFieldProps> = props => {
  const { textStyle } = useDetailsPane()
  const t = usePanelStyles()
  const [editing, setEditing] = useState<string>()
  const commit = async () => {
    if (editing === undefined) {
      return
    }
    const text = editing
    if (text === props.value) {
      setEditing(undefined)
      return
    }
    if (await props.onCommit(text)) {
      // In a transition, so the field closes together with the pane's
      // re-read after a save (pending transitions commit together) and
      // never shows the old value in between.
      startTransition(() => {
        setEditing(undefined)
      })
    }
  }
  const valueStyle = [
    styles.value,
    props.large && styles.valueLarge,
    textStyle,
    t.cell,
  ]
  return (
    <View style={styles.field}>
      <Text style={[styles.label, textStyle, t.cell]}>{props.label}</Text>
      {editing !== undefined ? (
        <TextField
          autoFocus
          selectTextOnFocus
          value={editing}
          multiline={props.multiline}
          onChangeText={setEditing}
          onSubmitEditing={() => {
            commit().catch(warnCommitFailed)
          }}
          onBlur={() => {
            commit().catch(warnCommitFailed)
          }}
          onKeyPress={e => {
            if (e.nativeEvent.key === 'Escape') {
              setEditing(undefined)
            }
          }}
          style={[styles.input, valueStyle, t.input]}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${props.label}: ${
            props.mixed ? 'Mixed' : props.value || 'empty'
          }. Click to edit.`}
          onPress={() => {
            setEditing(props.mixed ? '' : props.value)
          }}
          style={styles.valueBox}
        >
          <Text
            style={[
              valueStyle,
              (props.mixed || !props.value) && styles.placeholder,
            ]}
            numberOfLines={props.multiline ? 4 : 2}
          >
            {props.mixed ? 'Mixed' : props.value || '—'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: 6 },
  label: { fontSize: 11, opacity: 0.6, marginBottom: 1 },
  valueBox: { minHeight: 18 },
  value: { fontSize: 13 },
  valueLarge: { fontSize: 15, fontWeight: '600' },
  placeholder: { opacity: 0.45 },
  input: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 3,
  },
})
