// Roots of the skinned UI's windows (registered in index.js). They share one
// JS runtime, so the skin and library refreshes are shared between them.
import { selection } from '@/library/selection'
import { windows } from '@/skin/windows'
import { isRecord } from '@/utils/isRecord'

export { BurnApp } from './BurnApp'
export { DetailsApp } from './DetailsApp'
export { EditorApp } from './EditorApp'
export { LibraryApp } from './LibraryApp'
export { MainApp } from './MainApp'
export { SettingsApp } from './SettingsApp'

if (__DEV__) {
  // Lets the debugger drive the panels (see also native/SoundScraper.ts).
  const existing: unknown = Reflect.get(globalThis, '__soundScraper')
  Object.assign(globalThis, {
    __soundScraper: {
      ...(isRecord(existing) ? existing : {}),
      selection,
      windows,
    },
  })
}
