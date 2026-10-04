// Turbo Module spec for skins and the skinned windows. macOS only for now:
// on platforms without it, TurboModuleRegistry.get returns null and the app
// keeps its plain UI (see index.js).
import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type WindowEvent = {
  /** 'main' | 'library' | 'settings' | 'details' */
  window: string;
  /** 'shown' | 'hidden' | 'toggleShade' (double click on a drag region) | 'toggleDoubleSize' (menu) */
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
   * A panel window's skin chrome ('main' | 'library' | 'settings'): where it
   * drags from (`dragRegions` minus `holes`) and resizes from (`grip`, empty
   * if not resizable), as flat [x, y, w, h, …] lists in points from its top
   * left; its minimum size; and its size (main panel; 0 keeps the size).
   * `scale` is the skin scale. Size changes keep docked panels attached.
   */
  setPanelLayout(
    panel: string,
    width: number,
    height: number,
    dragRegions: Array<number>,
    holes: Array<number>,
    grip: Array<number>,
    minWidth: number,
    minHeight: number,
    scale: number,
  ): void;
  /** 'minimize' | 'quit' */
  windowAction(action: string): void;
  /**
   * Starts moving ('move') or resizing ('resize') a panel window with the
   * mouse, until the button is released (Windows, where the React view gets
   * the mouse down; macOS handles drag regions natively and ignores this).
   */
  beginGesture(panel: string, kind: string): void;
  /** Shows or hides the 'library' or 'settings' window. */
  setPanelVisible(panel: string, visible: boolean): void;
  isPanelVisible(panel: string): boolean;
  /**
   * Pops up a native menu at (x, y) in a panel window ('main', 'library',
   * 'settings', 'details'; points from its top left); resolves with the
   * chosen index, or -1.
   */
  showMenu(
    panel: string,
    items: Array<string>,
    checked: number,
    x: number,
    y: number,
  ): Promise<number>;
}

export default TurboModuleRegistry.get<Spec>('SoundScraperSkins');
