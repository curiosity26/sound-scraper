import React, { type FC } from 'react'
import { Image } from 'react-native'

import { fileUri } from '@/skin/fileUri'

import { NoPreview } from './NoPreview'
import type { PreviewSource } from './types'
import { useSkinPreview } from './useSkinPreview'

export type PreviewImageProps = PreviewSource

/** A skin's picture at its aspect ratio (suspends while it loads). */
export const PreviewImage: FC<PreviewImageProps> = props => {
  const { path, size } = useSkinPreview(props.source, props.path)
  const height = size ? (props.width * size[1]) / size[0] : props.width / 3
  return path ? (
    <Image
      source={{ uri: fileUri(path) }}
      style={{ width: props.width, height }}
      resizeMode="contain"
    />
  ) : (
    <NoPreview width={props.width} height={height} />
  )
}
