import type { FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import { settingsTab } from '@/features/settings/settingsTab'
import { usePanelText } from '@/features/skins/hooks/usePanelText'
import { useSkin } from '@/features/skins/hooks/useSkin'
import { colors } from '@/shared/theme/colors'
import { styles } from '@/shared/theme/styles'

import { useSettingsTab } from './useSettingsTab'

/** The settings window's tab bar: settings, skin and about. */
export const SettingsTabs: FC = () => {
  const { fg } = usePanelText('settings')
  const skin = useSkin()
  const accent = skin.panels.settings.controls.accent ?? colors.accent
  const { tab } = useSettingsTab()
  return (
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
  )
}
