import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { Pkg } from '@/features/settings/components/AboutPanel/LicenseList/types'

import { LicenseText } from './LicenseText'

export type PackageRowProps = {
  readonly pkg: Pkg
  /** Its license text is showing. */
  readonly open: boolean
  readonly onToggle: () => void
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
      {props.open && <LicenseText pkg={pkg} textStyle={textStyle} />}
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
})
