// Turbo Module spec for skins and the skinned windows. macOS only for now:
// on platforms without it, TurboModuleRegistry.get returns null and the app
// keeps its plain UI (see index.js).
import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type WindowEvent = {
  /** 'main' | 'library' | 'settings' */
  window: string;
  /** 'shown' | 'hidden' | 'toggleShade' (double click on a drag region) */
  event: string;
};

export interface Spec extends TurboModule {
  readonly onWindowEvent: CodegenTypes.EventEmitter<WindowEvent>;

  /** Resolved skin JSON (ss_skin_load): an id, an absolute folder path, or '' for Default. */
  loadSkin(idOrPath: string): Promise<string>;
  /** The skin chosen in the settings (ss_skin_load_current). */
  loadCurrentSkin(): Promise<string>;
  /** JSON array of installed skins, Default first (ss_skins_list). */
  listSkins(): Promise<string>;
  /** Installs a .sskin; resolves with its summary JSON. */
  installSkin(archivePath: string): Promise<string>;
  removeSkin(id: string): Promise<void>;
  /** Native open dialog for a .sskin; null if cancelled. */
  pickSkinArchive(): Promise<string | null>;
  /** Native folder chooser for an unpacked skin; null if cancelled. */
  pickSkinFolder(): Promise<string | null>;

  /**
   * Sizes the main window (keeping its top-left corner) and sets where it can
   * be dragged: `dragRegions` and `holes` are flat [x, y, w, h, …] lists in
   * points from the top left; holes (interactive elements) don't drag.
   */
  setMainLayout(
    width: number,
    height: number,
    dragRegions: Array<number>,
    holes: Array<number>,
  ): void;
  /** 'minimize' | 'quit' */
  windowAction(action: string): void;
  /** Shows or hides the 'library' or 'settings' window. */
  setPanelVisible(panel: string, visible: boolean): void;
  isPanelVisible(panel: string): boolean;
  /**
   * Pops up a native menu at (x, y) in the main window (points from the top
   * left); resolves with the chosen index, or -1.
   */
  showMenu(
    items: Array<string>,
    checked: number,
    x: number,
    y: number,
  ): Promise<number>;
}

export default TurboModuleRegistry.get<Spec>('SoundScraperSkins');
