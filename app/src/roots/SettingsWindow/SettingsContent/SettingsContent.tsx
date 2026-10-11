import type { FC } from 'react'
import { ScrollView, View } from 'react-native'

import { AboutPanel } from '@/features/settings/components/AboutPanel'
import { SettingsPanel } from '@/features/settings/components/SettingsPanel'
import { SkinChooser } from '@/features/skins/components/SkinChooser'
import { usePanelText } from '@/features/skins/hooks/usePanelText'
import { styles } from '@/shared/theme/styles'

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
