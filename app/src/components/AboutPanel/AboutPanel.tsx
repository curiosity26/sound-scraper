import { type FC, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { getCoreVersion } from '@/native/getCoreVersion'
import { colors } from '@/theme/colors'

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

export type AboutPanelProps = {
  /** Shows a heading with Done (the overlay in the plain UI). */
  readonly onClose?: () => void
  readonly textStyle: object
}

/** App info and third-party licenses (LAME's LGPL notice first). */
export const AboutPanel: FC<AboutPanelProps> = props => {
  const { textStyle } = props
  const panel = usePanelStyles()
  const [open, setOpen] = useState<string>()

  return (
    <View style={styles.panel}>
      {props.onClose && (
        <View style={styles.header}>
          <Text style={[styles.heading, textStyle]}>About Sound Scraper</Text>
          <Pressable onPress={props.onClose} testID="close-about">
            <Text style={[styles.link, panel.link]}>Done</Text>
          </Pressable>
        </View>
      )}
      <Text style={[styles.meta, textStyle]}>Core v{safeVersion()}</Text>
      <Text style={[styles.meta, textStyle]}>
        Sound Scraper is built with open-source software. Select a component to
        read its license.
      </Text>
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
    </View>
  )
}

const safeVersion = (): string => {
  try {
    return getCoreVersion()
  } catch {
    return '?'
  }
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: { fontSize: 18, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 13 },
  meta: { fontSize: 12, opacity: 0.7, marginBottom: 6 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 4 },
})
