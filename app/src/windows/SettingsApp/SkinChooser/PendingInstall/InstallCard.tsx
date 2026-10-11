import React, { type FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import type { SkinInspection } from '@/skin/types'

import { Preview } from './Preview'
import { styles } from './styles'

export type InstallCardProps = {
  readonly inspection: SkinInspection
  readonly onInstall: () => void
  readonly onCancel: () => void
  readonly textStyle: object
}

/** A .sskin about to be installed: what it is, and Install / Cancel. */
export const InstallCard: FC<InstallCardProps> = props => {
  const { inspection: s, textStyle } = props
  const t = usePanelStyles()
  const replaces = s.installed
    ? `Replaces the installed ${s.installed.name}${
        s.installed.version ? ` ${s.installed.version}` : ''
      }.`
    : null
  return (
    <View
      testID="install-card"
      style={[styles.card, styles.installCard, t.border]}
    >
      <Text style={[styles.title, textStyle]}>Install this skin?</Text>
      {s.preview && <Preview source={null} path={s.preview} width={360} />}
      <Text style={[styles.name, textStyle]}>
        {s.name}
        {s.version ? ` ${s.version}` : ''}
        {s.author ? ` · ${s.author}` : ''}
      </Text>
      {s.description && (
        <Text style={[styles.detail, textStyle]}>{s.description}</Text>
      )}
      {replaces && <Text style={[styles.detail, textStyle]}>{replaces}</Text>}
      {s.warnings.map((w, i) => (
        <Text key={i} style={[styles.warning, textStyle]}>
          ⚠︎ {w}
        </Text>
      ))}
      <View style={styles.cardButtons}>
        <Pressable
          testID="install-confirm"
          onPress={props.onInstall}
          style={[styles.button, t.button]}
        >
          <Text style={[styles.buttonText, t.buttonText]}>
            {s.installed ? 'Replace' : 'Install'}
          </Text>
        </Pressable>
        <Pressable onPress={props.onCancel} style={styles.plainButton}>
          <Text style={[styles.link, t.link]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}
