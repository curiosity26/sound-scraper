import React, { type FC } from 'react'
import { View } from 'react-native'

import { styles } from './styles'

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
