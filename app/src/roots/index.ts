// Roots of the skinned UI's windows (registered in index.js). They share one
// JS runtime, so the skin and library refreshes are shared between them.
import './devConsole/devGlobals'

export { BurnWindow } from './BurnWindow'
export { DetailsWindow } from './DetailsWindow'
export { EditorWindow } from './EditorWindow'
export { LibraryWindow } from './LibraryWindow'
export { MainWindow } from './MainWindow'
export { SettingsWindow } from './SettingsWindow'
export { Stage } from './Stage'
