import type { EventSubscription } from 'react-native';

import NativeSkins, { type WindowEvent } from '../native/NativeSkins';
import { settings } from '../native/SoundScraper';
import type { Rect, Skin, SkinSummary } from './types';

/** False where the native side has no skin support yet (Windows). */
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
};

const flat = (rects: Rect[]) => rects.flatMap(r => r);

export const windows = {
  setMainLayout: (size: [number, number], drag: Rect[], holes: Rect[]) =>
    native().setMainLayout(size[0], size[1], flat(drag), flat(holes)),
  minimize: () => native().windowAction('minimize'),
  quit: () => native().windowAction('quit'),
  setPanelVisible: (panel: 'library' | 'settings', visible: boolean) =>
    native().setPanelVisible(panel, visible),
  isPanelVisible: (panel: 'library' | 'settings'): boolean =>
    native().isPanelVisible(panel),
  /** Native pop-up menu at (x, y) in the main window; '-' is a separator. */
  showMenu: (items: string[], checked: number, x: number, y: number) =>
    native().showMenu(items, checked, x, y),
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
