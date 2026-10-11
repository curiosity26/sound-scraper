import { type FC, useEffect } from 'react'

import { MainPanel } from '@/components/MainPanel'
import { doubleSizeStore } from '@/skin/doubleSizeStore'
import { openSkinFiles } from '@/skin/openSkinFiles'
import { skins } from '@/skin/skins'
import { windows } from '@/skin/windows'
import { Skinned } from '@/windows/Skinned'

import { useFolderLiveReload } from './useFolderLiveReload'

/** The main window: the skinned panel. */
export const MainApp: FC = () => {
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
  useFolderLiveReload()
  return (
    <Skinned>
      <MainPanel />
    </Skinned>
  )
}
