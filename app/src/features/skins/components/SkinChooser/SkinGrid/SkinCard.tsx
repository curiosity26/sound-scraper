import React, { type FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import { CARD_W } from '@/features/skins/components/SkinChooser/constants'
import { Preview } from '@/features/skins/components/SkinChooser/Preview'
import { styles } from '@/features/skins/components/SkinChooser/styles'
import { useSkinChooser } from '@/features/skins/components/SkinChooser/useSkinChooser'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'

export type SkinCardProps = {
  readonly name: string
  readonly detail: string
  /** For skins.preview: an id, a folder, '' for Default; null for none. */
  readonly preview: string | null
  readonly chosen: boolean
  readonly error?: string | null
  readonly onPress?: () => void
  /** The card's testID. Not a `testID` prop here, so a test finds the
   * pressable itself rather than this wrapper. */
  readonly testName?: string
  readonly children?: React.ReactNode
}

/** A skin in the grid: its picture, name and author. */
export const SkinCard: FC<SkinCardProps> = props => {
  const { textStyle } = useSkinChooser()
  const t = usePanelStyles()
  const accent = t.link.color ?? colors.accent
  return (
    <Pressable
      testID={props.testName}
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
        style={[styles.name, textStyle, props.error != null && styles.muted]}
      >
        {props.chosen ? '◉ ' : ''}
        {props.name}
      </Text>
      {props.detail !== '' && (
        <Text numberOfLines={1} style={[styles.detail, textStyle]}>
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
