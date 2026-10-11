import { addToDevConsole } from './addToDevConsole'
import { library } from './library'
import { listAudioApps } from './listAudioApps'
import { playlistsApi } from './playlistsApi'
import { recorder } from './recorder'
import { settings } from './settings'

/** Called once at startup (index.js). */
export const exposeDevConsole = (): void => {
  addToDevConsole({
    recorder,
    library,
    settings,
    playlistsApi,
    listAudioApps,
  })
}
