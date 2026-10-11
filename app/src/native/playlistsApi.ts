import { isRecord } from '@/utils/isRecord'

import NativeSoundScraper from './NativeSoundScraper'
import type { Playlist, PlaylistItem } from './types'

/**
 * A playlists request (ss_playlists); throws the core's message on failure.
 * Returns the answer's `ok` value, unchecked.
 */
const playlistsRequest = (request: object): unknown => {
  const answer: unknown = JSON.parse(
    NativeSoundScraper.playlists(JSON.stringify(request)),
  )
  if (!isRecord(answer)) {
    throw new TypeError('Unexpected playlists answer from the core')
  }
  if (answer.error !== undefined) {
    throw new Error(
      typeof answer.error === 'string'
        ? answer.error
        : 'Playlists request failed',
    )
  }
  return answer.ok
}

/** A playlists request whose answer must match `isT`. */
const playlistsCall = <T>(
  request: object,
  isT: (value: unknown) => value is T,
): T => {
  const ok = playlistsRequest(request)
  if (!isT(ok)) {
    throw new TypeError('Unexpected playlists answer from the core')
  }
  return ok
}

const isPlaylist = (value: unknown): value is Playlist =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  typeof value.name === 'string' &&
  typeof value.count === 'number'

const isPlaylistItem = (value: unknown): value is PlaylistItem =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  typeof value.fileName === 'string'

const isPlaylists = (value: unknown): value is Playlist[] =>
  Array.isArray(value) && value.every(isPlaylist)

const isPlaylistItems = (value: unknown): value is PlaylistItem[] =>
  Array.isArray(value) && value.every(isPlaylistItem)

const isActiveId = (value: unknown): value is number | null =>
  value === null || typeof value === 'number'

const isExportAnswer = (value: unknown): value is { missing: number } =>
  isRecord(value) && typeof value.missing === 'number'

/** Playlists, kept by the core in their own database (playlists.rs). */
export const playlistsApi = {
  list: () => playlistsCall({ op: 'list' }, isPlaylists),
  items: (id: number) => playlistsCall({ op: 'items', id }, isPlaylistItems),
  create: (name: string, fileNames: readonly string[] = []) =>
    playlistsCall({ op: 'create', name, fileNames }, isPlaylist),
  rename: (id: number, name: string) =>
    playlistsCall({ op: 'rename', id, name }, isPlaylist),
  duplicate: (id: number) => playlistsCall({ op: 'duplicate', id }, isPlaylist),
  delete: (id: number): void => {
    playlistsRequest({ op: 'delete', id })
  },
  add: (id: number, fileNames: readonly string[]) =>
    playlistsCall({ op: 'add', id, fileNames }, isPlaylistItems),
  remove: (id: number, itemIds: readonly number[]): void => {
    playlistsRequest({ op: 'remove', id, itemIds })
  },
  setOrder: (id: number, itemIds: readonly number[]): void => {
    playlistsRequest({ op: 'setOrder', id, itemIds })
  },
  active: () => playlistsCall({ op: 'active' }, isActiveId),
  setActive: (id: number | null): void => {
    playlistsRequest({ op: 'setActive', id })
  },
  /** Writes an .m3u8; resolves with how many missing recordings were left out. */
  exportM3u8: (id: number, path: string) =>
    playlistsCall({ op: 'exportM3u8', id, path }, isExportAnswer).missing,
}
