import type { ResolvedSkin, SkinInspection, SkinSummary } from '@/native/bridge'
import { parseNative } from '@/native/parseNative'
import { isArrayOf, isString } from '@/utils/guards'

import { isResolvedSkin } from './guards/isResolvedSkin'
import { isSkinInspection } from './guards/isSkinInspection'
import { isSkinSummary } from './guards/isSkinSummary'
import { native } from './native'

const isSummaryList = isArrayOf(isSkinSummary)

// Skin calls reject on failure (no Reply envelope); each answer is parsed
// and checked here, so nothing past this module sees raw JSON.
export const skins = {
  /** The skin chosen in the settings (Default if it no longer loads). */
  loadCurrent: async (): Promise<ResolvedSkin> =>
    parseNative(await native().loadCurrentSkin(), isResolvedSkin, 'skin'),
  /** An installed skin's id, an unpacked folder's path, or '' for Default. */
  load: async (idOrPath: string): Promise<ResolvedSkin> =>
    parseNative(await native().loadSkin(idOrPath), isResolvedSkin, 'skin'),
  list: async (): Promise<SkinSummary[]> =>
    parseNative(await native().listSkins(), isSummaryList, 'skin list'),
  install: async (archivePath: string): Promise<SkinSummary> =>
    parseNative(
      await native().installSkin(archivePath),
      isSkinSummary,
      'skin summary',
    ),
  remove: (id: string): Promise<void> => native().removeSkin(id),
  pickArchive: (): Promise<string | null> => native().pickSkinArchive(),
  pickFolder: (): Promise<string | null> => native().pickSkinFolder(),
  /** A folder chooser for other purposes (where to make a new skin). */
  pickAnyFolder: (title: string, prompt: string): Promise<string | null> =>
    native().pickFolder(title, prompt),
  pickSaveLocation: (defaultName: string): Promise<string | null> =>
    native().pickSkinSaveLocation(defaultName),
  /** Checks a .sskin without installing it. */
  inspect: async (archivePath: string): Promise<SkinInspection> =>
    parseNative(
      await native().inspectSkin(archivePath),
      isSkinInspection,
      'skin inspection',
    ),
  /** A PNG of a skin's main panel: an id, a folder path, or '' for Default. */
  preview: async (idOrPath: string): Promise<string> =>
    parseNative(await native().skinPreview(idOrPath), isString, 'preview'),
  /** Writes a skin folder as a .sskin. */
  package: async (dir: string, outPath: string): Promise<SkinSummary> =>
    parseNative(
      await native().packageSkin(dir, outPath),
      isSkinSummary,
      'skin summary',
    ),
  /** A new skin folder from the Default skin; resolves with its path. */
  create: async (parent: string, name: string): Promise<string> =>
    parseNative(await native().createSkin(parent, name), isString, 'path'),
  /** Changes whenever the folder's files do. */
  folderStamp: async (dir: string): Promise<string> =>
    parseNative(await native().skinFolderStamp(dir), isString, 'stamp'),
  /** Skins opened from the file manager or dropped on a panel. */
  takeOpened: (): string[] => native().takeOpenedSkinFiles(),
}
