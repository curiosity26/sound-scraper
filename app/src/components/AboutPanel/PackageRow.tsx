import type { FC } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { colors } from '@/theme/colors'

import type { Pkg } from './types'

export type PackageRowProps = {
  readonly pkg: Pkg
  /** Its license text is showing. */
  readonly open: boolean
  readonly onToggle: () => void
  /** License texts by id (the package's `texts`). */
  readonly licenseTexts: Readonly<Record<string, string>>
  readonly textStyle: object
}

/** A package with its license; select it to show the license text. */
export const PackageRow: FC<PackageRowProps> = props => {
  const { pkg, textStyle } = props
  return (
    <View>
      <Pressable onPress={props.onToggle} style={styles.pkg}>
        <Text style={[styles.pkgName, textStyle]} numberOfLines={1}>
          {pkg.name} {pkg.version}
        </Text>
        <Text style={[styles.pkgLicense, textStyle]} numberOfLines={1}>
          {pkg.license}
        </Text>
      </Pressable>
      {pkg.note && <Text style={[styles.note, textStyle]}>{pkg.note}</Text>}
      {props.open && (
        <View style={styles.textBox}>
          {pkg.repository ? (
            <Text selectable style={[styles.repo, textStyle]}>
              {pkg.repository}
            </Text>
          ) : null}
          {pkg.texts.length === 0 ? (
            <Text style={[styles.licenseText, textStyle]}>
              This package declares the {pkg.license} license but doesn't
              include a license file.
            </Text>
          ) : (
            pkg.texts.map(t => (
              <Text key={t} selectable style={[styles.licenseText, textStyle]}>
                {props.licenseTexts[t]}
              </Text>
            ))
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  pkg: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: 8,
  },
  pkgName: { fontSize: 12, flexShrink: 1 },
  pkgLicense: { fontSize: 11, opacity: 0.6 },
  note: { fontSize: 11, opacity: 0.8, marginBottom: 6 },
  textBox: {
    padding: 8,
    marginBottom: 6,
    borderRadius: 4,
    backgroundColor: '#8881',
  },
  repo: { fontSize: 11, color: colors.accent, marginBottom: 6 },
  licenseText: {
    fontSize: 10,
    fontFamily: Platform.select({ windows: 'Consolas', default: 'Menlo' }),
    opacity: 0.85,
    marginBottom: 6,
  },
})
