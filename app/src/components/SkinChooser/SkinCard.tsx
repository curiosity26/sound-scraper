import React, { type FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { colors } from '@/theme/colors'

import { CARD_W } from './constants'
import { Preview } from './Preview'
import { styles } from './styles'

export type SkinCardProps = {
  readonly name: string
  readonly detail: string
  /** For skins.preview: an id, a folder, '' for Default; null for none. */
  readonly preview: string | null
  readonly chosen: boolean
  readonly error?: string | null
  readonly onPress?: () => void
  readonly testID?: string
  readonly textStyle: object
  readonly children?: React.ReactNode
}

/** A skin in the grid: its picture, name and author. */
export const SkinCard: FC<SkinCardProps> = props => {
  const t = usePanelStyles()
  const accent = t.link.color ?? colors.accent
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={!props.onPress}
      style={[
        styles.card,
        t.border,
        props.chosen && [styles.chosen, { borderColor: accent }],
      ]}
    >
      <Preview source={props.preview} width={CARD_W - 12} />
      <Text
        numberOfLines={1}
        style={[
          styles.name,
          props.textStyle,
          props.error != null && styles.muted,
        ]}
      >
        {props.chosen ? '◉ ' : ''}
        {props.name}
      </Text>
      {props.detail !== '' && (
        <Text numberOfLines={1} style={[styles.detail, props.textStyle]}>
          {props.detail}
        </Text>
      )}
      {props.error && (
        <Text numberOfLines={3} style={styles.error}>
          {props.error}
        </Text>
      )}
      {props.children && (
        <View style={styles.cardActions}>{props.children}</View>
      )}
    </Pressable>
  )
}
