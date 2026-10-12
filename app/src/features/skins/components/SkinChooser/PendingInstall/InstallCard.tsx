import React, { type FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { SkinInspection } from '@/bridge/generated'
import { Preview } from '@/features/skins/components/SkinChooser/Preview'
import { styles } from '@/features/skins/components/SkinChooser/styles'
import { useSkinChooser } from '@/features/skins/components/SkinChooser/useSkinChooser'
import { pendingInstall } from '@/features/skins/pendingInstall'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

export type InstallCardProps = {
  readonly inspection: SkinInspection
}

/** A .sskin about to be installed: what it is, and Install / Cancel. */
export const InstallCard: FC<InstallCardProps> = props => {
  const { inspection: s } = props
  const { install, textStyle } = useSkinChooser()
  const t = usePanelStyles()
  const replaces = s.installed
    ? `Replaces the installed ${s.installed.name}${
        s.installed.version ? ` ${s.installed.version}` : ''
      }.`
    : null
  return (
    <View style={[styles.card, styles.installCard, t.border]}>
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
          onPress={() => {
            void install(s)
          }}
          style={[styles.button, t.button]}
        >
          <Text style={[styles.buttonText, t.buttonText]}>
            {s.installed ? 'Replace' : 'Install'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            pendingInstall.set(null)
          }}
          style={styles.plainButton}
        >
          <Text style={[styles.link, t.link]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}
