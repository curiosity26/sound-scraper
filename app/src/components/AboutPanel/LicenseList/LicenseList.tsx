import { type FC, useState } from 'react'
import { FlatList, StyleSheet, Text } from 'react-native'

import { licenseData as data } from './licenseData'
import { PackageRow } from './PackageRow'
import type { LicenseRow } from './types'

// The license list never changes while the app runs.
const rows: readonly LicenseRow[] = [
  { kind: 'header', key: 'h-lame', title: 'MP3 encoder' },
  { kind: 'pkg', key: 'lame', pkg: data.lame },
  { kind: 'header', key: 'h-rust', title: `Rust crates (${data.rust.length})` },
  ...data.rust.map(
    (p): LicenseRow => ({
      kind: 'pkg',
      key: `r-${p.name}-${p.version}`,
      pkg: p,
    }),
  ),
  {
    kind: 'header',
    key: 'h-js',
    title: `JavaScript packages (${data.js.length})`,
  },
  ...data.js.map(
    (p): LicenseRow => ({
      kind: 'pkg',
      key: `j-${p.name}-${p.version}`,
      pkg: p,
    }),
  ),
]

export type LicenseListProps = {
  readonly textStyle: object
}

/** The packages by section; one at a time shows its license text. */
export const LicenseList: FC<LicenseListProps> = props => {
  const { textStyle } = props
  const [open, setOpen] = useState<string>()
  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.key}
      initialNumToRender={30}
      renderItem={({ item }) =>
        item.kind === 'header' ? (
          <Text style={[styles.section, textStyle]}>{item.title}</Text>
        ) : (
          <PackageRow
            pkg={item.pkg}
            open={open === item.key}
            onToggle={() => {
              setOpen(o => (o === item.key ? undefined : item.key))
            }}
            textStyle={textStyle}
          />
        )
      }
    />
  )
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 4 },
})
