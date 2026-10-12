import React, { type FC, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { MONO } from './constants'
import { Icon, type IconName } from './Icon'
import { useEditor } from './useEditor'

export type ToolButtonProps = {
  readonly label: string
  readonly glyph?: string
  readonly icon?: IconName
  readonly detail?: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly active?: boolean
  readonly accent?: boolean
  /** For glyph-only tools (empty label). */
  readonly a11yLabel?: string
}

/**
 * A tool: a glyph or icon with a label, quiet until hovered or pressed;
 * `active` shows it latched (Snap), `accent` fills it (Save).
 */
export const ToolButton: FC<ToolButtonProps> = props => {
  const { th } = useEditor()
  const [hover, setHover] = useState(false)
  const fg = props.accent ? th.accentText : props.active ? th.accent : th.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.a11yLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled, selected: props.active }}
      disabled={props.disabled}
      onPress={props.onPress}
      onHoverIn={() => {
        setHover(true)
      }}
      onHoverOut={() => {
        setHover(false)
      }}
      style={({ pressed }) => [
        styles.tool,
        {
          backgroundColor: props.accent
            ? th.accent
            : props.active
            ? th.raised
            : hover || pressed
            ? th.raised
            : 'transparent',
          borderColor: props.active ? th.accent : 'transparent',
          opacity: props.disabled ? 0.35 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {props.icon && <Icon name={props.icon} color={fg} size={11} />}
      {props.glyph && (
        <Text style={[styles.toolGlyph, { color: fg }]}>{props.glyph}</Text>
      )}
      {props.label !== '' && (
        <Text style={[styles.toolLabel, { color: fg }]}>{props.label}</Text>
      )}
      {props.detail && (
        <Text style={[styles.toolDetail, { color: fg }]}>{props.detail}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
  },
  toolGlyph: { fontSize: 13 },
  toolLabel: { fontSize: 12 },
  toolDetail: { fontSize: 10, opacity: 0.7, fontFamily: MONO },
})
