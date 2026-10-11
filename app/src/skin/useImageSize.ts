import { useEffect, useState } from 'react'
import { Image } from 'react-native'

import { fileUri } from './fileUri'

export type UseImageSizeResult = {
  /** The image's pixel size once known; null until then (or without a path). */
  readonly size: readonly [number, number] | null
}

/** Loads the pixel size of the image file at `path`. */
export const useImageSize = (path: string | null): UseImageSizeResult => {
  const [size, setSize] = useState<readonly [number, number] | null>(null)
  useEffect(() => {
    if (!path) {
      return
    }
    let live = true
    Image.getSize(
      fileUri(path),
      (w, h) => {
        if (live) {
          setSize([w, h])
        }
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [path])
  return { size }
}
