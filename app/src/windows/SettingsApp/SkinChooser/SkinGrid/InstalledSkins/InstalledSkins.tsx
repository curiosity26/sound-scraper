import React, { type FC } from 'react'
import { Pressable, Text } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import type { SkinSummary } from '@/skin/types'
import { SkinCard } from '@/windows/SettingsApp/SkinChooser/SkinCard'
import { styles } from '@/windows/SettingsApp/SkinChooser/styles'

import { useSkinList } from './useSkinList'

export type InstalledSkinsProps = {
  /** Changes when the installed skins do. */
  readonly revision: number
  readonly isChosen: (skin: SkinSummary) => boolean
  /** An installed skin's id, or null for Default. */
  readonly onChoose: (skin: string | null) => void
  readonly onRemove: (skin: SkinSummary) => void
  readonly textStyle: object
}

/** A card for each installed skin (suspends while they load). */
export const InstalledSkins: FC<InstalledSkinsProps> = props => {
  const { textStyle } = props
  const t = usePanelStyles()
  const { list } = useSkinList(props.revision)
  return list.map(s => (
    <SkinCard
      key={s.id}
      testID={`skin-${s.id}`}
      name={s.name + (s.version ? ` ${s.version}` : '')}
      detail={s.author ?? (s.builtin ? 'Built in' : '')}
      preview={s.error ? null : s.builtin ? '' : s.id}
      chosen={props.isChosen(s)}
      error={s.error}
      onPress={
        s.error == null
          ? () => {
              props.onChoose(s.builtin ? null : s.id)
            }
          : undefined
      }
      textStyle={textStyle}
    >
      {!s.builtin && (
        <Pressable
          onPress={() => {
            props.onRemove(s)
          }}
        >
          <Text style={[styles.link, t.link]}>Remove</Text>
        </Pressable>
      )}
    </SkinCard>
  ))
}
