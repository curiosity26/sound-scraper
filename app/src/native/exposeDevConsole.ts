import { isRecord } from '@/utils/isRecord'

import { library } from './library'
import { listAudioApps } from './listAudioApps'
import { playlistsApi } from './playlistsApi'
import { recorder } from './recorder'
import { settings } from './settings'

/** Called once at startup (index.js). */
export const exposeDevConsole = (): void => {
  if (__DEV__) {
    // Lets the debugger console drive the same module instance as the UI.
    const existing: unknown = Reflect.get(globalThis, '__soundScraper')
    Object.assign(globalThis, {
      __soundScraper: {
        ...(isRecord(existing) ? existing : {}),
        recorder,
        library,
        settings,
        playlistsApi,
        listAudioApps,
      },
    })
  }
}
