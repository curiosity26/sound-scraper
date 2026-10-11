import { library } from '@/features/library/library'
import { playlistsApi } from '@/features/playlists/playlistsApi'
import { listAudioApps } from '@/features/recorder/listAudioApps'
import { recorder } from '@/features/recorder/recorder'
import { settings } from '@/features/settings/settings'

import { addToDevConsole } from './addToDevConsole'

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
