import { useEffect, useState } from 'react'

import { safeSettings } from '@/features/recorder/safeSettings'
import { isFolderSkin } from '@/features/skins/isFolderSkin'
import { skins } from '@/features/skins/skins'
import { skinStore } from '@/features/skins/skinStore'

const chosenFolder = (): string | null => {
  const chosen = safeSettings()?.skin ?? null
  return isFolderSkin(chosen) ? chosen : null
}

/**
 * While the chosen skin is an unpacked folder (a skin being made), reloads
 * it whenever its files change.
 */
export const useFolderLiveReload = (): void => {
  const [dir, setDir] = useState(() => chosenFolder())
  useEffect(
    () =>
      skinStore.subscribe(() => {
        setDir(chosenFolder())
      }),
    [],
  )
  useEffect(() => {
    if (!dir) {
      return
    }
    let last: string | undefined
    let busy = false
    const check = async () => {
      if (busy) {
        return
      }
      busy = true
      try {
        const stamp = await skins.folderStamp(dir)
        if (last !== undefined && stamp !== last) {
          await skinStore.reload()
        }
        last = stamp
      } catch {
        // A save in progress, or the folder went away: try again.
      } finally {
        busy = false
      }
    }
    const timer = setInterval(() => {
      void check()
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [dir])
}
