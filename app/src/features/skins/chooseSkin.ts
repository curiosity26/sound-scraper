import type { ResolvedSkin } from '@/bridge/generated'
import { settings } from '@/features/settings/settings'

import { skinStore } from './skinStore'

/**
 * Uses a skin: an installed skin's id, a folder's path, or null for the
 * Default skin. Saved in the settings; every window re-skins.
 */
export const chooseSkin = async (
  skin: string | null,
): Promise<ResolvedSkin> => {
  await settings.set({ ...settings.get(), skin })
  return skinStore.reload()
}
