import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

export type NoPreviewProps = {
  readonly width: number
  readonly height: number
}

/** The space a skin's picture takes, while there's none. */
export const NoPreview: FC<NoPreviewProps> = props => (
  <View
    style={[styles.noPreview, { width: props.width, height: props.height }]}
  />
)

const styles = StyleSheet.create({
  noPreview: { backgroundColor: '#00000033', borderRadius: 3 },
})
