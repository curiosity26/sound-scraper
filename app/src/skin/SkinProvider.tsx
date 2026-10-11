import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { SkinContext } from './SkinContext'
import { skinStore } from './skinStore'

type Props = {
  children: React.ReactNode
  /** Shown until the skin has loaded. */
  fallback?: React.ReactNode
  onError?: (message: string) => void
}

/**
 * Loads the skin chosen in the settings (once per JS runtime) and provides
 * it; re-renders when another window picks a different skin.
 */
export const SkinProvider = (props: Props): React.JSX.Element => {
  const { onError } = props
  const [skin, setSkin] = useState(skinStore.get())
  useEffect(() => {
    const unsubscribe = skinStore.subscribe(setSkin)
    if (!skinStore.get()) {
      skinStore.reload().catch(e => onError?.(String(e?.message ?? e)))
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
