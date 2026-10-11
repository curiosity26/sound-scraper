import { PixelRatio } from 'react-native'

import { fileUri } from '@/skin/fileUri'
import type { ImageRef } from '@/skin/types'

/**
 * The skin image file for `density` device pixels per skin point (screen
 * scale × skin scale): @4x, @2x or 1x, the smallest that's sharp enough.
 */
export const imageSource = (image: ImageRef, density = PixelRatio.get()) => {
  const [path, scale] =
    density > 2 && image.path4x != null
      ? [image.path4x, 4]
      : density >= 1.5 && image.path2x != null
      ? [image.path2x, 2]
      : [image.path, 1]
  return {
    uri: fileUri(path),
    width: image.width,
    height: image.height,
    scale,
  }
}
