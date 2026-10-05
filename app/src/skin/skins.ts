import { type EventSubscription, Platform } from 'react-native';

import NativeSkins, { type WindowEvent } from '../native/NativeSkins';
import { settings } from '../native/SoundScraper';
import { setImageRevision } from './SkinImage';
import type { Rect, Skin, SkinInspection, SkinSummary } from './types';

/** False where the native side has no skin support. */
export const skinsAvailable = NativeSkins != null;

function native() {
  if (!NativeSkins) {
    throw new Error('Skins are not available on this platform yet');
  }
  return NativeSkins;
}

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
};

/** An unpacked skin folder (an absolute path) rather than an installed id. */
export function isFolderSkin(chosen: string | null | undefined): boolean {
  return chosen != null && /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(chosen);
}

/** Whether a dropped or opened path is a skin archive (else a folder). */
export function isSkinArchive(path: string): boolean {
  return /\.(sskin|zip)$/i.test(path);
}

/** A value shared by every window (they run in one JS runtime). */
function shared<T>(initial: T) {
  let value = initial;
  const subscribers = new Set<(v: T) => void>();
  return {
    get: (): T => value,
    set: (v: T) => {
      value = v;
      subscribers.forEach(l => l(v));
    },
    subscribe: (listener: (v: T) => void): (() => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };
}

/** The last note or error in Settings › Skin. */
export const skinMessages = shared<{ note?: string; error?: string }>({});

/** The settings window's tab. */
export const settingsTab = shared<'settings' | 'skin' | 'about'>('settings');

/** A skin waiting for the user to confirm installing it (the install card). */
export const pendingInstall = shared<
  { inspection: SkinInspection } | { path: string; error: string } | null
>(null);

/**
 * Uses a skin: an installed skin's id, a folder's path, or null for the
 * Default skin. Saved in the settings; every window re-skins.
 */
export async function chooseSkin(skin: string | null): Promise<Skin> {
  await settings.set({ ...settings.get(), skin });
  return skinStore.reload();
}

/**
 * Handles skins opened from the file manager or dropped on a panel: an
 * archive gets the install card in the settings' Skin tab; a skin folder is
 * used straight away (and reloads as it changes).
 */
export async function openSkinFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  const archive = paths.find(isSkinArchive);
  const folder = paths.find(p => !isSkinArchive(p));
  settingsTab.set('skin');
  windows.setPanelVisible('settings', true);
  if (archive) {
    try {
      pendingInstall.set({ inspection: await skins.inspect(archive) });
    } catch (e) {
      pendingInstall.set({
        path: archive,
        error: String((e as Error)?.message ?? e),
      });
    }
  } else if (folder) {
    await chooseSkin(folder);
  }
}

const flat = (rects: Rect[]) => rects.flatMap(r => r);

/** The side panels (the main panel is "main"). */
export type PanelName = 'library' | 'settings' | 'details';

export const windows = {
  setMainLayout: (
    size: [number, number],
    drag: Rect[],
    holes: Rect[],
    scale: number,
  ) =>
    native().setPanelLayout(
      'main',
      size[0],
      size[1],
      flat(drag),
      flat(holes),
      [],
      size[0],
      size[1],
      scale,
    ),
  /** A side panel's chrome (its size is the user's). */
  setPanelChrome: (
    panel: PanelName,
    chrome: {
      drag: Rect[];
      holes: Rect[];
      grip: Rect | null;
      minSize: [number, number];
      scale: number;
    },
  ) =>
    native().setPanelLayout(
      panel,
      0,
      0,
      flat(chrome.drag),
      flat(chrome.holes),
      chrome.grip ? [...chrome.grip] : [],
      chrome.minSize[0],
      chrome.minSize[1],
      chrome.scale,
    ),
  minimize: () => native().windowAction('minimize'),
  /** Windows: the React views start window moves and resizes. */
  jsGestures: Platform.OS === 'windows',
  beginGesture: (panel: 'main' | PanelName, kind: 'move' | 'resize') =>
    native().beginGesture(panel, kind),
  quit: () => native().windowAction('quit'),
  setPanelVisible: (panel: PanelName, visible: boolean) =>
    native().setPanelVisible(panel, visible),
  isPanelVisible: (panel: PanelName): boolean => native().isPanelVisible(panel),
  /** Native pop-up menu at (x, y) in a panel; '-' is a separator. */
  showMenu: (
    items: string[],
    checked: number,
    x: number,
    y: number,
    panel: 'main' | PanelName = 'main',
  ) => native().showMenu(panel, items, checked, x, y),
  onEvent: (listener: (e: WindowEvent) => void): EventSubscription =>
    native().onWindowEvent(listener),
};

// The current skin, shared by every window (they run in one JS runtime), so
// choosing a skin in the settings window re-skins the main panel.
let current: Skin | undefined;
const listeners = new Set<(skin: Skin) => void>();

export const skinStore = {
  get: (): Skin | undefined => current,
  set: (skin: Skin) => {
    current = skin;
    setImageRevision(skin.revision ?? '');
    listeners.forEach(l => l(skin));
  },
  subscribe: (listener: (skin: Skin) => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Reloads the skin chosen in the settings. */
  reload: async (): Promise<Skin> => {
    const skin = await skins.loadCurrent();
    skinStore.set(skin);
    return skin;
  },
};

// Double-size mode, shared by the windows and saved in the settings.
let doubleSize: boolean | undefined;
const sizeListeners = new Set<(on: boolean) => void>();

export const doubleSizeStore = {
  get: (): boolean => {
    if (doubleSize === undefined) {
      try {
        doubleSize = settings.get().doubleSize === true;
      } catch {
        doubleSize = false;
      }
    }
    return doubleSize;
  },
  set: (on: boolean) => {
    doubleSize = on;
    sizeListeners.forEach(l => l(on));
    try {
      settings.set({ ...settings.get(), doubleSize: on }).catch(() => {});
    } catch {}
  },
  subscribe: (listener: (on: boolean) => void): (() => void) => {
    sizeListeners.add(listener);
    return () => sizeListeners.delete(listener);
  },
};
