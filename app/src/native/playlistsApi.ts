import NativeSoundScraper from './NativeSoundScraper'
import type { Playlist, PlaylistItem } from './types'

/** A playlists request (ss_playlists); throws the core's message on failure. */
function playlistsCall<T>(request: object): T {
  const answer = JSON.parse(
    NativeSoundScraper.playlists(JSON.stringify(request)),
  ) as { ok?: T; error?: string }
  if (answer.error !== undefined) {
    throw new Error(answer.error)
  }
  return answer.ok as T
}

/** Playlists, kept by the core in their own database (playlists.rs). */
export const playlistsApi = {
  list: () => playlistsCall<Playlist[]>({ op: 'list' }),
  items: (id: number) => playlistsCall<PlaylistItem[]>({ op: 'items', id }),
  create: (name: string, fileNames: string[] = []) =>
    playlistsCall<Playlist>({ op: 'create', name, fileNames }),
  rename: (id: number, name: string) =>
    playlistsCall<Playlist>({ op: 'rename', id, name }),
  duplicate: (id: number) => playlistsCall<Playlist>({ op: 'duplicate', id }),
  delete: (id: number) => playlistsCall<null>({ op: 'delete', id }),
  add: (id: number, fileNames: string[]) =>
    playlistsCall<PlaylistItem[]>({ op: 'add', id, fileNames }),
  remove: (id: number, itemIds: number[]) =>
    playlistsCall<null>({ op: 'remove', id, itemIds }),
  setOrder: (id: number, itemIds: number[]) =>
    playlistsCall<null>({ op: 'setOrder', id, itemIds }),
  active: () => playlistsCall<number | null>({ op: 'active' }),
  setActive: (id: number | null) =>
    playlistsCall<null>({ op: 'setActive', id }),
  /** Writes an .m3u8; resolves with how many missing recordings were left out. */
  exportM3u8: (id: number, path: string) =>
    playlistsCall<{ missing: number }>({ op: 'exportM3u8', id, path }).missing,
}
