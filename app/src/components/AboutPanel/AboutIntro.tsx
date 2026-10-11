import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { getCoreVersion } from '@/native/getCoreVersion'

export type AboutIntroProps = {
  readonly textStyle: object
}

/** The core's version and a line about the licenses below. */
export const AboutIntro: FC<AboutIntroProps> = props => (
  <>
    <Text style={[styles.meta, props.textStyle]}>Core v{safeVersion()}</Text>
    <Text style={[styles.meta, props.textStyle]}>
      Sound Scraper is built with open-source software. Select a component to
      read its license.
    </Text>
  </>
)

const safeVersion = (): string => {
  try {
    return getCoreVersion()
  } catch {
    return '?'
  }
}

const styles = StyleSheet.create({
  meta: { fontSize: 12, opacity: 0.7, marginBottom: 6 },
})
