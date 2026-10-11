import { native } from './native'
import type { Skin, SkinInspection, SkinSummary } from './types'

export const skins = {
  /** The skin chosen in the settings (Default if it no longer loads). */
  loadCurrent: async (): Promise<Skin> =>
    JSON.parse(await native().loadCurrentSkin()),
  /** An installed skin's id, an unpacked folder's path, or '' for Default. */
  load: async (idOrPath: string): Promise<Skin> =>
    JSON.parse(await native().loadSkin(idOrPath)),
  list: async (): Promise<SkinSummary[]> =>
    JSON.parse(await native().listSkins()),
  install: async (archivePath: string): Promise<SkinSummary> =>
    JSON.parse(await native().installSkin(archivePath)),
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
    JSON.parse(await native().inspectSkin(archivePath)),
  /** A PNG of a skin's main panel: an id, a folder path, or '' for Default. */
  preview: async (idOrPath: string): Promise<string> =>
    JSON.parse(await native().skinPreview(idOrPath)),
  /** Writes a skin folder as a .sskin. */
  package: async (dir: string, outPath: string): Promise<SkinSummary> =>
    JSON.parse(await native().packageSkin(dir, outPath)),
  /** A new skin folder from the Default skin; resolves with its path. */
  create: async (parent: string, name: string): Promise<string> =>
    JSON.parse(await native().createSkin(parent, name)),
  /** Changes whenever the folder's files do. */
  folderStamp: async (dir: string): Promise<string> =>
    JSON.parse(await native().skinFolderStamp(dir)),
  /** Skins opened from the file manager or dropped on a panel. */
  takeOpened: (): string[] => native().takeOpenedSkinFiles(),
}
