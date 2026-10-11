import React, { type FC, useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { errorText } from '@/utils/errorText'

import { SkinContext } from './SkinContext'
import { skinStore } from './skinStore'

export type SkinProviderProps = {
  readonly children: React.ReactNode
  /** Shown until the skin has loaded. */
  readonly fallback?: React.ReactNode
  readonly onError?: (message: string) => void
}

/**
 * Loads the skin chosen in the settings (once per JS runtime) and provides
 * it; re-renders when another window picks a different skin.
 */
export const SkinProvider: FC<SkinProviderProps> = props => {
  const { onError } = props
  const [skin, setSkin] = useState(skinStore.get())
  useEffect(() => {
    const unsubscribe = skinStore.subscribe(setSkin)
    if (!skinStore.get()) {
      skinStore.reload().catch((e: unknown) => {
        onError?.(errorText(e))
      })
    }
    return unsubscribe
  }, [onError])
  return (
    <SkinContext.Provider value={skin}>
      {skin ? (
        // Windows doesn't reload an image whose source changes, so a new
        // skin (or an edited skin folder) remounts the window's content.
        <React.Fragment
          key={
            Platform.OS === 'windows'
              ? `${skin.dir}|${skin.revision}`
              : undefined
          }
        >
          {props.children}
        </React.Fragment>
      ) : (
        props.fallback ?? null
      )}
    </SkinContext.Provider>
  )
}
