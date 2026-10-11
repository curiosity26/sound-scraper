import { useEffect } from 'react'

import { doubleSizeStore } from '@/features/skins/doubleSizeStore'
import { openSkinFiles } from '@/features/skins/openSkinFiles'
import { skins } from '@/features/skins/skins'
import { windows } from '@/features/skins/windows'

/**
 * The main window's commands from the native side: skins opened from the
 * file manager (or dropped on a window) are offered for installing, and
 * Window › Double Size toggles double size.
 */
export const useMainMenuCommands = (): void => {
  useEffect(() => {
    // Skins opened before JS started (double-clicking a .sskin launches the
    // app), then as they come.
    const takeSkins = () => {
      openSkinFiles(skins.takeOpened()).catch(() => {})
    }
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
    return () => {
      subscription.remove()
    }
  }, [])
}
