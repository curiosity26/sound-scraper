import { settings } from '@/native/settings'

import { skinStore } from './skinStore'
import type { Skin } from './types'

/**
 * Uses a skin: an installed skin's id, a folder's path, or null for the
 * Default skin. Saved in the settings; every window re-skins.
 */
export const chooseSkin = async (skin: string | null): Promise<Skin> => {
  await settings.set({ ...settings.get(), skin })
  return skinStore.reload()
}
