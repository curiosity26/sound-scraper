import type { FC } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { useDetailsPane } from '@/components/DetailsPane/useDetailsPane'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { colors } from '@/theme/colors'

import { coverUri } from './coverUri'

export type CoverArtProps = {
  /** Its width and height. */
  readonly size: number
}

/** The cover, centered: click it to choose an image, or drop one on it. */
export const CoverArt: FC<CoverArtProps> = props => {
  const { size } = props
  const { cover, chooseCover, dropImage, isDark, textStyle } = useDetailsPane()
  const t = usePanelStyles()
  // macOS drag-and-drop props, not in View's types.
  const dropProps: object = {
    draggedTypes: ['fileUrl'],
    onDrop: (e: {
      nativeEvent: { dataTransfer?: { files?: Array<{ uri?: string }> } }
    }) => {
      dropImage(e.nativeEvent.dataTransfer?.files?.[0]?.uri)
    },
  }
  return (
    <View {...dropProps} style={styles.coverBox}>
      <Pressable
        testID="details-cover"
        accessibilityLabel="Cover art. Click to choose an image, or drop one here."
        onPress={chooseCover}
        style={[
          styles.cover,
          { width: size, height: size },
          isDark && styles.coverDark,
          t.border,
        ]}
      >
        {cover.kind === 'image' ? (
          <Image
            source={{ uri: coverUri(cover.path) }}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.coverText, textStyle, t.cell]}>
            {cover.kind === 'mixed'
              ? 'Mixed covers'
              : 'No cover\nClick or drop an image'}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  coverBox: { alignItems: 'center' },
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 4,
  },
  coverDark: { backgroundColor: '#00000033' },
  coverText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 18,
  },
})
