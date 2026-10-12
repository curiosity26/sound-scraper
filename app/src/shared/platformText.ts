import { Platform } from 'react-native'

const isWindows = Platform.OS === 'windows'

/** Labels and fonts that differ by OS (Linux: platformText.linux.ts). */
export const platformText = {
  revealLabel: isWindows ? 'Show in Explorer' : 'Show in Finder',
  trashLabel: isWindows ? 'Move to Recycle Bin' : 'Move to Trash',
  trashName: isWindows ? 'the Recycle Bin' : 'the Trash',
  /** Prefix for a shortcut's key: "Ctrl+D", "⌘D". */
  shortcutModifier: isWindows ? 'Ctrl+' : '⌘',
  monoFont: isWindows ? 'Consolas' : 'Menlo',
  /** The bundled Material Icons font (assets/fonts), registered by the app:
   * Info.plist's ATSApplicationFontsPath on macOS, the package's
   * windows.sharedFonts extension on Windows (RN Windows reads system fonts
   * only, so a path doesn't work there). */
  iconFont: 'Material Icons',
}
