import { type FC, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { AboutPanel } from '@/components/AboutPanel'
import { SettingsPanel } from '@/components/SettingsPanel'
import { SkinChooser } from '@/components/SkinChooser'
import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { usePanelText } from '@/hooks/usePanelText'
import { useSkin } from '@/hooks/useSkin'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { settingsTab } from '@/skin/settingsTab'
import { colors } from '@/theme/colors'

import { Skinned } from './Skinned'
import { styles } from './styles'

const SettingsContent: FC = () => {
  const { fg } = usePanelText('settings')
  const skin = useSkin()
  const accent = skin.panels.settings.controls.accent ?? colors.accent
  const [tab, setTab] = useState(settingsTab.get)
  useEffect(() => settingsTab.subscribe(setTab), [])
  return (
    <View style={styles.content}>
      <View style={styles.tabs}>
        {(['settings', 'skin', 'about'] as const).map(t => (
          <Pressable
            key={t}
            onPress={() => {
              settingsTab.set(t)
            }}
            testID={`tab-${t}`}
          >
            <Text
              style={[
                styles.tab,
                fg,
                tab === t && [styles.tabActive, { borderBottomColor: accent }],
              ]}
            >
              {t === 'settings' ? 'Settings' : t === 'skin' ? 'Skin' : 'About'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'settings' && (
        <SettingsPanel onFolderChanged={refreshLibraryViews} textStyle={fg} />
      )}
      {tab === 'skin' && (
        <ScrollView>
          <SkinChooser textStyle={fg} />
        </ScrollView>
      )}
      {tab === 'about' && <AboutPanel textStyle={fg} />}
    </View>
  )
}

/** The settings window: settings, skin and about. */
export const SettingsApp: FC = () => {
  return (
    <Skinned>
      <SkinPanelFrame panel="settings" title="Settings">
        <SettingsContent />
      </SkinPanelFrame>
    </Skinned>
  )
}
