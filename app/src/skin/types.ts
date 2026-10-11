// The skin itself comes from the Rust core with generated types
// (ResolvedSkin and friends in @/native/bridge). These are the UI's own
// names for parts of it.

/** [x, y, width, height] in points from the panel's top left. */
export type Rect = [number, number, number, number]

/** The main panel's elements the UI draws (other keys are ignored). */
export type ElementName =
  | 'record'
  | 'play'
  | 'pause'
  | 'stop'
  | 'seek'
  | 'elapsed'
  | 'status'
  | 'source'
  | 'levels'
  | 'visualizer'
  | 'toggleLibrary'
  | 'toggleSettings'
  | 'minimize'
  | 'shade'
  | 'close'

/** The side panels (the main panel is "main"). */
export type PanelName = 'library' | 'settings' | 'details' | 'editor' | 'burn'

/** A skinned window: the main panel or a side panel. */
export type WindowName = 'main' | PanelName

/**
 * What happened to a window: shown, hidden, toggleShade (double click on a
 * drag region), toggleDoubleSize (menu, Ctrl+D) or skinFilesOpened (skins
 * opened from the file manager or dropped on a panel: see
 * skins.takeOpened).
 */
export type WindowEventKind =
  | 'shown'
  | 'hidden'
  | 'toggleShade'
  | 'toggleDoubleSize'
  | 'skinFilesOpened'

/** A window event from the native side (NativeSkins' onWindowEvent). */
export type SkinWindowEvent = {
  readonly window: WindowName
  readonly event: WindowEventKind
}
