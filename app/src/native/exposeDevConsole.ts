import { library } from './library'
import { listAudioApps } from './listAudioApps'
import { playlistsApi } from './playlistsApi'
import { recorder } from './recorder'
import { settings } from './settings'

/** Called once at startup (index.js). */
export function exposeDevConsole(): void {
  if (__DEV__) {
    // Lets the debugger console drive the same module instance as the UI.
    const g = globalThis as { __soundScraper?: Record<string, unknown> }
    g.__soundScraper = {
      ...g.__soundScraper,
      recorder,
      library,
      settings,
      playlistsApi,
      listAudioApps,
    }
  }
}
