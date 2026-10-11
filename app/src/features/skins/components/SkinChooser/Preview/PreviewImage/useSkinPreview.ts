import { startTransition, use, useEffect, useState } from 'react'
import { Image } from 'react-native'

import { fileUri } from '@/features/skins/fileUri'
import { isFolderSkin } from '@/features/skins/isFolderSkin'
import { skins } from '@/features/skins/skins'
import { skinStore } from '@/features/skins/skinStore'
import { promiseCache } from '@/shared/utils/promiseCache'

type Size = readonly [number, number]

// Keyed by `${version}:${source}`, the version changing as a skin folder
// does. No picture (null) when the core can't draw one.
const previews = promiseCache<string, string | null>(key =>
  skins.preview(key.slice(key.indexOf(':') + 1)).catch(() => null),
)

// An image file's pixel size; null when it can't be read.
const sizes = promiseCache<string, Size | null>(
  path =>
    new Promise(resolve => {
      Image.getSize(
        fileUri(path),
        (w, h) => {
          resolve([w, h])
        },
        () => {
          resolve(null)
        },
      )
    }),
)

export type UseSkinPreviewResult = {
  /** The picture's file, or null for none. */
  readonly path: string | null
  /** Its pixel size, or null when unknown. */
  readonly size: Size | null
}

/**
 * A skin's picture and its size (suspends while they load): drawn by the
 * core and cached, so it follows a skin folder as it changes (the path
 * changes with it). `source` is an id, a folder, '' for Default, or null
 * for none; `path` is a picture already drawn.
 */
export const useSkinPreview = (
  source: string | null,
  path?: string,
): UseSkinPreviewResult => {
  const [version, setVersion] = useState(0)
  // A folder skin changes as its author works on it. In a transition, so
  // the old picture shows until the new one is ready.
  useEffect(
    () =>
      isFolderSkin(source)
        ? skinStore.subscribe(() => {
            startTransition(() => {
              setVersion(v => v + 1)
            })
          })
        : undefined,
    [source],
  )
  const key = source === null || path ? null : `${version}:${source}`
  useEffect(
    () =>
      key === null
        ? undefined
        : () => {
            previews.clear(key)
          },
    [key],
  )
  const shown = key === null ? path ?? null : use(previews.get(key))
  useEffect(
    () =>
      shown === null
        ? undefined
        : () => {
            sizes.clear(shown)
          },
    [shown],
  )
  return { path: shown, size: shown === null ? null : use(sizes.get(shown)) }
}
