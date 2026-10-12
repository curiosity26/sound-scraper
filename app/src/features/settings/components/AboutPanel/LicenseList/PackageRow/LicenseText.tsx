import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { licenseData } from '@/features/settings/components/AboutPanel/LicenseList/licenseData'
import type { Pkg } from '@/features/settings/components/AboutPanel/LicenseList/types'
import { platformText } from '@/shared/platformText'
import { colors } from '@/shared/theme/colors'

export type LicenseTextProps = {
  readonly pkg: Pkg
  readonly textStyle: object
}

/** A package's repository and license texts, in a box under its row. */
export const LicenseText: FC<LicenseTextProps> = props => {
  const { pkg, textStyle } = props
  return (
    <View style={styles.textBox}>
      {pkg.repository ? (
        <Text selectable style={[styles.repo, textStyle]}>
          {pkg.repository}
        </Text>
      ) : null}
      {pkg.texts.length === 0 ? (
        <Text style={[styles.licenseText, textStyle]}>
          This package declares the {pkg.license} license but doesn't include a
          license file.
        </Text>
      ) : (
        pkg.texts.map(t => (
          <Text key={t} selectable style={[styles.licenseText, textStyle]}>
            {licenseData.texts[t]}
          </Text>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  textBox: {
    padding: 8,
    marginBottom: 6,
    borderRadius: 4,
    backgroundColor: '#8881',
  },
  repo: { fontSize: 11, color: colors.accent, marginBottom: 6 },
  licenseText: {
    fontSize: 10,
    fontFamily: platformText.monoFont,
    opacity: 0.85,
    marginBottom: 6,
  },
})
