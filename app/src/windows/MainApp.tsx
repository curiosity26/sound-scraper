import React, { useEffect, useState } from 'react'

import { safeSettings } from '@/recorder/safeSettings'
import { doubleSizeStore } from '@/skin/doubleSizeStore'
import { isFolderSkin } from '@/skin/isFolderSkin'
import { MainPanel } from '@/skin/MainPanel'
import { openSkinFiles } from '@/skin/openSkinFiles'
import { skins } from '@/skin/skins'
import { skinStore } from '@/skin/skinStore'
import { windows } from '@/skin/windows'

import { Skinned } from './Skinned'

/** The main window: the skinned panel. */
export function MainApp(): React.JSX.Element {
  useEffect(() => {
    // Skins opened before JS started (double-clicking a .sskin launches the
    // app), then as they come.
    const takeSkins = () => openSkinFiles(skins.takeOpened()).catch(() => {})
    takeSkins()
    const subscription = windows.onEvent(e => {
      if (e.window !== 'main') {
        return
      }
      if (e.event === 'toggleDoubleSize') {
        // Window › Double Size (⌘D), Ctrl+D on Windows.
        doubleSizeStore.set(!doubleSizeStore.get())
      } else if (e.event === 'skinFilesOpened') {
        takeSkins()
      }
    })
    return () => subscription.remove()
  }, [])
  useFolderLiveReload()
  return (
    <Skinned>
      <MainPanel />
    </Skinned>
  )
}

/**
 * While the chosen skin is an unpacked folder (a skin being made), reloads
 * it whenever its files change.
 */
function useFolderLiveReload() {
  const [dir, setDir] = useState(() => chosenFolder())
  useEffect(() => skinStore.subscribe(() => setDir(chosenFolder())), [])
  useEffect(() => {
    if (!dir) {
      return
    }
    let last: string | undefined
    let busy = false
    const timer = setInterval(async () => {
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
    }, 1000)
    return () => clearInterval(timer)
  }, [dir])
}

function chosenFolder(): string | null {
  const chosen = safeSettings()?.skin ?? null
  return isFolderSkin(chosen) ? chosen : null
}
