import type { PlaylistsRequest } from '@/bridge/generated'
import NativeSoundScraper from '@/bridge/NativeSoundScraper'
import { requestReply } from '@/bridge/requestReply'
import {
  type Guard,
  isArrayOf,
  isNullable,
  isNumber,
  isOneOf,
} from '@/shared/utils/guards'

import { isExportAnswer } from './guards/isExportAnswer'
import { isPlaylist } from './guards/isPlaylist'
import { isPlaylistItem } from './guards/isPlaylistItem'

/**
 * A playlists request (ss_playlists) whose answer must match `isOk`; throws
 * the core's message on failure.
 */
const call = <T>(request: PlaylistsRequest, isOk: Guard<T>): T =>
  requestReply(
    json => NativeSoundScraper.playlists(json),
    request,
    isOk,
    'playlists answer',
  )

/** The answer of the requests that only change something. */
const isDone = isOneOf(null)

/** Playlists, kept by the core in their own database (playlists.rs). */
export const playlistsApi = {
  list: () => call({ op: 'list' }, isArrayOf(isPlaylist)),
  items: (id: number) => call({ op: 'items', id }, isArrayOf(isPlaylistItem)),
  create: (name: string, fileNames: readonly string[] = []) =>
    call({ op: 'create', name, fileNames: [...fileNames] }, isPlaylist),
  rename: (id: number, name: string) =>
    call({ op: 'rename', id, name }, isPlaylist),
  duplicate: (id: number) => call({ op: 'duplicate', id }, isPlaylist),
  delete: (id: number): void => {
    call({ op: 'delete', id }, isDone)
  },
  add: (id: number, fileNames: readonly string[]) =>
    call(
      { op: 'add', id, fileNames: [...fileNames] },
      isArrayOf(isPlaylistItem),
    ),
  remove: (id: number, itemIds: readonly number[]): void => {
    call({ op: 'remove', id, itemIds: [...itemIds] }, isDone)
  },
  setOrder: (id: number, itemIds: readonly number[]): void => {
    call({ op: 'setOrder', id, itemIds: [...itemIds] }, isDone)
  },
  active: () => call({ op: 'active' }, isNullable(isNumber)),
  setActive: (id: number | null): void => {
    call({ op: 'setActive', id }, isDone)
  },
  /** Writes an .m3u8; resolves with how many missing recordings were left out. */
  exportM3u8: (id: number, path: string) =>
    call({ op: 'exportM3u8', id, path }, isExportAnswer).missing,
}
