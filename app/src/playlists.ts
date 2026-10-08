// The playlists and the one showing in the library, shared by every window
// (one JS runtime). The core keeps them (playlists.rs); this mirrors the
// list, the showing playlist's items, and which row is playing.
import { useEffect, useState } from 'react';

import {
  type Playlist,
  type PlaylistItem,
  playlistsApi,
} from './native/SoundScraper';

export type PlaylistsState = {
  playlists: Playlist[];
  /** The playlist showing in the library; null = the whole library. */
  activeId: number | null;
  /** The showing playlist's items, in order. */
  items: PlaylistItem[];
  /** The playlist row loaded for playback (a recording can repeat). */
  playingItemId: number | null;
};

let state: PlaylistsState = {
  playlists: [],
  activeId: null,
  items: [],
  playingItemId: null,
};
let loaded = false;
const listeners = new Set<(s: PlaylistsState) => void>();

function publish(change: Partial<PlaylistsState>) {
  state = { ...state, ...change };
  listeners.forEach(l => l(state));
}

/** Re-reads the list and the showing playlist's items from the core. */
function reload(activeId = state.activeId) {
  const playlists = playlistsApi.list();
  const active =
    activeId !== null && playlists.some(p => p.id === activeId)
      ? activeId
      : null;
  const items = active === null ? [] : playlistsApi.items(active);
  publish({
    playlists,
    activeId: active,
    items,
    playingItemId: items.some(i => i.id === state.playingItemId)
      ? state.playingItemId
      : null,
  });
}

function ensureLoaded() {
  if (!loaded) {
    loaded = true;
    try {
      reload(playlistsApi.active());
    } catch {
      // No playlists available (e.g. the plain UI without the core): stay empty.
    }
  }
}

export const playlists = {
  get: (): PlaylistsState => {
    ensureLoaded();
    return state;
  },
  subscribe: (listener: (s: PlaylistsState) => void): (() => void) => {
    ensureLoaded();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Re-reads everything (after a rename or trash elsewhere). */
  refresh: () => reload(),

  /** Shows a playlist in the library (null = the whole library). */
  show: (id: number | null) => {
    playlistsApi.setActive(id);
    reload(id);
  },
  active: (): Playlist | undefined =>
    state.playlists.find(p => p.id === state.activeId),

  create: (name: string, fileNames: string[] = []): Playlist => {
    const made = playlistsApi.create(name, fileNames);
    reload();
    return made;
  },
  rename: (id: number, name: string) => {
    playlistsApi.rename(id, name);
    reload();
  },
  duplicate: (id: number): Playlist => {
    const made = playlistsApi.duplicate(id);
    playlistsApi.setActive(made.id);
    reload(made.id);
    return made;
  },
  delete: (id: number) => {
    playlistsApi.delete(id);
    reload(state.activeId === id ? null : state.activeId);
  },
  add: (id: number, fileNames: string[]) => {
    playlistsApi.add(id, fileNames);
    reload();
  },
  remove: (itemIds: number[]) => {
    if (state.activeId === null) {
      return;
    }
    playlistsApi.remove(state.activeId, itemIds);
    reload();
  },
  setOrder: (itemIds: number[]) => {
    if (state.activeId === null) {
      return;
    }
    // Show the new order at once; the core confirms.
    const byId = new Map(state.items.map(i => [i.id, i]));
    publish({ items: itemIds.map(id => byId.get(id)!).filter(Boolean) });
    try {
      playlistsApi.setOrder(state.activeId, itemIds);
    } finally {
      reload();
    }
  },
  /** Names in a playlist (for "already there" checks). */
  fileNamesIn: (id: number): Set<string> =>
    new Set(playlistsApi.items(id).map(i => i.fileName)),

  /** A new recording goes into the playlist showing, if any. */
  recorded: (fileName: string) => {
    ensureLoaded();
    if (state.activeId !== null) {
      playlistsApi.add(state.activeId, [fileName]);
      reload();
    }
  },

  setPlaying: (itemId: number | null) => publish({ playingItemId: itemId }),
};

/** The playlists, re-rendering on changes. */
export function usePlaylists(): PlaylistsState {
  const [s, setS] = useState(playlists.get);
  useEffect(() => {
    setS(playlists.get());
    return playlists.subscribe(setS);
  }, []);
  return s;
}
