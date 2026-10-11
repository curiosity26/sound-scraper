import type { FC } from 'react'
import { ScrollView, View } from 'react-native'

import { AboutPanel } from '@/components/AboutPanel'
import { SettingsPanel } from '@/components/SettingsPanel'
import { usePanelText } from '@/hooks/usePanelText'
import { SkinChooser } from '@/windows/SettingsApp/SkinChooser'
import { styles } from '@/windows/styles'

import { SettingsTabs } from './SettingsTabs'
import { useSettingsTab } from './useSettingsTab'

/** The settings window's tabs: settings, skin and about. */
export const SettingsContent: FC = () => {
  const { fg } = usePanelText('settings')
  const { tab } = useSettingsTab()
  return (
    <View style={styles.content}>
      <SettingsTabs />
      {tab === 'settings' && <SettingsPanel textStyle={fg} />}
      {tab === 'skin' && (
        <ScrollView>
          <SkinChooser textStyle={fg} />
        </ScrollView>
      )}
      {tab === 'about' && <AboutPanel textStyle={fg} />}
    </View>
  )
}
