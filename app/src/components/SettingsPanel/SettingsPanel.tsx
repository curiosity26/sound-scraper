import type { FC } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { PanelHeader } from '@/components/PanelHeader'
import { editorAvailable } from '@/native/editorAvailable'

import { Masters } from './Masters'
import { QualitySection } from './QualitySection'
import { RecordingsFolder } from './RecordingsFolder'
import { SettingsFooter } from './SettingsFooter'
import { SettingsPanelContext } from './SettingsPanelContext'
import { SilenceSection } from './SilenceSection'
import { TagsSection } from './TagsSection'
import { useAppSettings } from './useAppSettings'

export type SettingsPanelProps = {
  /** Shows a heading with Done (the overlay in the plain UI); the skinned
   * window has its own title and close button. */
  readonly onClose?: () => void
  readonly textStyle: object
}

/**
 * App settings; each change is saved right away by the Rust core. The
 * settings (useAppSettings) are shared with the sections through
 * SettingsPanelContext.
 */
export const SettingsPanel: FC<SettingsPanelProps> = props => {
  const settings = useAppSettings()
  return (
    <SettingsPanelContext value={{ ...settings, textStyle: props.textStyle }}>
      <View style={styles.panel}>
        <PanelHeader
          title="Settings"
          panel="settings"
          onClose={props.onClose}
          textStyle={props.textStyle}
        />
        <ScrollView>
          <RecordingsFolder />
          <QualitySection />
          <SilenceSection />
          {editorAvailable && <Masters />}
          <TagsSection />
          <SettingsFooter />
        </ScrollView>
      </View>
    </SettingsPanelContext>
  )
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
})
