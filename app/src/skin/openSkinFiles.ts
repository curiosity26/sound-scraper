import { errorText } from '@/utils/errorText'

import { chooseSkin } from './chooseSkin'
import { isSkinArchive } from './isSkinArchive'
import { pendingInstall } from './pendingInstall'
import { settingsTab } from './settingsTab'
import { skins } from './skins'
import { windows } from './windows'

/**
 * Handles skins opened from the file manager or dropped on a panel: an
 * archive gets the install card in the settings' Skin tab; a skin folder is
 * used straight away (and reloads as it changes).
 */
export const openSkinFiles = async (paths: string[]): Promise<void> => {
  if (paths.length === 0) {
    return
  }
  const archive = paths.find(isSkinArchive)
  const folder = paths.find(p => !isSkinArchive(p))
  settingsTab.set('skin')
  windows.setPanelVisible('settings', true)
  if (archive) {
    try {
      pendingInstall.set({ inspection: await skins.inspect(archive) })
    } catch (e) {
      pendingInstall.set({
        path: archive,
        error: errorText(e),
      })
    }
  } else if (folder) {
    await chooseSkin(folder)
  }
}
