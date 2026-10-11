import { parseJson } from '@/utils/parseJson'

import { isSkin } from './isSkin'
import { isSkinInspection } from './isSkinInspection'
import { isSkinSummary } from './isSkinSummary'
import { native } from './native'
import type { Skin, SkinInspection, SkinSummary } from './types'

const isString = (value: unknown): value is string => typeof value === 'string'

const isSummaryList = (value: unknown): value is SkinSummary[] =>
  Array.isArray(value) && value.every(isSkinSummary)

export const skins = {
  /** The skin chosen in the settings (Default if it no longer loads). */
  loadCurrent: async (): Promise<Skin> =>
    parseJson(await native().loadCurrentSkin(), isSkin, 'skin'),
  /** An installed skin's id, an unpacked folder's path, or '' for Default. */
  load: async (idOrPath: string): Promise<Skin> =>
    parseJson(await native().loadSkin(idOrPath), isSkin, 'skin'),
  list: async (): Promise<SkinSummary[]> =>
    parseJson(await native().listSkins(), isSummaryList, 'skin list'),
  install: async (archivePath: string): Promise<SkinSummary> =>
    parseJson(
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
    parseJson(
      await native().inspectSkin(archivePath),
      isSkinInspection,
      'skin inspection',
    ),
  /** A PNG of a skin's main panel: an id, a folder path, or '' for Default. */
  preview: async (idOrPath: string): Promise<string> =>
    parseJson(await native().skinPreview(idOrPath), isString, 'preview'),
  /** Writes a skin folder as a .sskin. */
  package: async (dir: string, outPath: string): Promise<SkinSummary> =>
    parseJson(
      await native().packageSkin(dir, outPath),
      isSkinSummary,
      'skin summary',
    ),
  /** A new skin folder from the Default skin; resolves with its path. */
  create: async (parent: string, name: string): Promise<string> =>
    parseJson(await native().createSkin(parent, name), isString, 'path'),
  /** Changes whenever the folder's files do. */
  folderStamp: async (dir: string): Promise<string> =>
    parseJson(await native().skinFolderStamp(dir), isString, 'stamp'),
  /** Skins opened from the file manager or dropped on a panel. */
  takeOpened: (): string[] => native().takeOpenedSkinFiles(),
}
