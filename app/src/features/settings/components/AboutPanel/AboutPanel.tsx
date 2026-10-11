import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { PanelHeader } from '@/shared/components/PanelHeader'

import { AboutIntro } from './AboutIntro'
import { LicenseList } from './LicenseList'

export type AboutPanelProps = {
  /** Shows a heading with Done (the overlay in the plain UI). */
  readonly onClose?: () => void
  readonly textStyle: object
}

/** App info and third-party licenses (LAME's LGPL notice first). */
export const AboutPanel: FC<AboutPanelProps> = props => (
  <View style={styles.panel}>
    <PanelHeader
      title="About Sound Scraper"
      panel="about"
      onClose={props.onClose}
      textStyle={props.textStyle}
    />
    <AboutIntro textStyle={props.textStyle} />
    <LicenseList textStyle={props.textStyle} />
  </View>
)

const styles = StyleSheet.create({
  panel: { flex: 1 },
})
