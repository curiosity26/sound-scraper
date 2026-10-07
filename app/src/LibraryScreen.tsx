import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorText } from './appHelpers';
import { DetailsPane, type ShowMenu } from './DetailsPane';
import { LibraryTable, type PlaylistView } from './LibraryTable';
import { library, type Recording } from './native/SoundScraper';
import { playback, usePlayback } from './playback';
import {
  AddToButton,
  CapacityBar,
  PlaylistPicker,
  PlaylistPrompt,
  type ShowMenu as ShowPlaylistMenu,
  usePlaylistControls,
} from './PlaylistControls';
import { discCapacity, type PlaylistRow, playlistRows } from './playlistModel';
import { playlists, usePlaylists } from './playlists';
import { selection } from './selection';

type Props = {
  onMessage: (message: { text: string; isError: boolean }) => void;
  textStyle: object;
  isDark: boolean;
  /** Skinned panel: no heading (see LibraryTable). */
  compact?: boolean;
  /** Reports how many rows there are and what's showing (for a title). */
  onCount?: (count: number, playlistName?: string) => void;
  /**
   * Shows the selection in a separate details window (the skinned UI);
   * without it, the details pane sits beside the table.
   */
  openDetails?: () => void;
  /** Native menus for the details pane's gear (side-pane mode). */
  showMenu?: ShowMenu;
  /**
   * Native pop-up menus in the library panel; with it, the playlist picker
   * and "Add to ▾" are shown.
   */
  showLibraryMenu?: ShowPlaylistMenu;
};

// Every mounted library view, so a change elsewhere (e.g. the recordings
// folder in the settings window) can refresh them.
const refreshers = new Set<() => void>();

/** Rescans the recordings folder in every library view. */
export function refreshLibraryViews() {
  refreshers.forEach(refresh => refresh());
}

/** The recordings table with rename/trash/reveal and the tag editor. */
export function LibraryScreen(props: Props): React.JSX.Element {
  const { onMessage, textStyle, isDark, onCount } = props;
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>(selection.get());
  useEffect(() => selection.subscribe(setSelected), []);
  const loaded = usePlayback().fileName;
  const [listed, setListed] = useState(false);
  const pl = usePlaylists();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const showLibraryMenu = props.showLibraryMenu;

  const refreshLibrary = useCallback(async () => {
    try {
      setRecordings(await library.list());
      setListed(true);
      // Renames and trashing through the core update playlists too.
      playlists.refresh();
    } catch (e) {
      onMessage({
        text: `Couldn't read the library: ${errorText(e)}`,
        isError: true,
      });
    }
  }, [onMessage]);

  useEffect(() => {
    refreshLibrary();
    refreshers.add(refreshLibrary);
    const subscription = library.onChanged(refreshLibrary);
    return () => {
      refreshers.delete(refreshLibrary);
      subscription.remove();
    };
  }, [refreshLibrary]);

  const showing = showLibraryMenu && pl.activeId !== null;
  const activeName = pl.playlists.find(p => p.id === pl.activeId)?.name;
  const rows = useMemo(
    () => (showing ? playlistRows(pl.items, recordings) : []),
    [showing, pl.items, recordings],
  );
  const capacity = useMemo(() => discCapacity(rows), [rows]);

  useEffect(() => {
    onCount?.(
      showing ? rows.length : recordings.length,
      showing ? activeName : undefined,
    );
  }, [recordings.length, rows.length, showing, activeName, onCount]);

  // Switching between the library and a playlist clears the checks.
  useEffect(() => {
    setChecked(new Set());
    setSelectedItemId(null);
  }, [pl.activeId]);

  // Drop vanished recordings from the checks and the selection.
  useEffect(() => {
    const names = new Set(recordings.map(r => r.fileName));
    if (!showing) {
      setChecked(prev => {
        const next = new Set([...prev].filter(n => names.has(n)));
        return next.size === prev.size ? prev : next;
      });
    }
    const current = selection.get();
    if (recordings.length > 0 && current.some(n => !names.has(n))) {
      selection.set(current.filter(n => names.has(n)));
    }
    // The loaded recording was trashed (or moved away).
    const p = playback.get();
    if (listed && p.fileName && !names.has(p.fileName)) {
      playback.clear();
    }
  }, [recordings, listed, showing]);

  // Selecting one recording loads it for playback.
  useEffect(() => {
    if (selected.length !== 1) {
      return;
    }
    const recording = recordings.find(r => r.fileName === selected[0]);
    if (recording) {
      playback.select(recording);
    }
  }, [selected, recordings]);

  // In a playlist, playing on: when a track ends, the next one plays.
  useEffect(
    () =>
      playback.onEnded(fileName => {
        const s = playlists.get();
        if (s.activeId === null || s.playingItemId === null) {
          return;
        }
        const all = playlistRows(s.items, recordings);
        const at = all.findIndex(r => r.item.id === s.playingItemId);
        if (at < 0 || all[at].item.fileName !== fileName) {
          return;
        }
        const next = all.slice(at + 1).find(r => r.recording);
        if (!next) {
          return;
        }
        playlists.setPlaying(next.item.id);
        setSelectedItemId(next.item.id);
        selection.set([next.item.fileName]);
        playback
          .select(next.recording!)
          .then(() => playback.play())
          .catch(() => {});
      }),
    [recordings],
  );

  const show = (fileNames: string[]) => {
    selection.set(fileNames);
    props.openDetails?.();
  };

  const controls = usePlaylistControls({
    state: pl,
    showMenu: showLibraryMenu ?? (() => Promise.resolve(-1)),
    textStyle,
    onMessage,
  });

  const playlistView: PlaylistView | undefined = showing
    ? {
        rows,
        playingItemId: pl.playingItemId,
        selectedItemId,
        firstOver: capacity.firstOver,
        onSelectItem: (row: PlaylistRow) => {
          setSelectedItemId(row.item.id);
          playlists.setPlaying(row.item.id);
          show([row.item.fileName]);
        },
        onReorder: ids => {
          try {
            playlists.setOrder(ids);
          } catch (e) {
            onMessage({ text: errorText(e), isError: true });
          }
        },
        onRemove: ids => {
          try {
            playlists.remove(ids);
          } catch (e) {
            onMessage({ text: errorText(e), isError: true });
          }
        },
      }
    : undefined;

  // File names behind the checked rows (playlist rows are keyed by item).
  const checkedNames = showing
    ? rows
        .filter(r => checked.has(`#${r.item.id}`) && r.recording)
        .map(r => r.item.fileName)
    : [...checked];

  return (
    <View style={styles.libraryRow}>
      <LibraryTable
        recordings={recordings}
        selected={selected.length === 1 ? selected[0] : undefined}
        loaded={loaded}
        onSelect={name => {
          playlists.setPlaying(null);
          show([name]);
        }}
        onEditTags={show}
        checked={checked}
        onCheckedChange={setChecked}
        textStyle={textStyle}
        isDark={isDark}
        compact={props.compact}
        playlist={playlistView}
        toolbarStart={
          showLibraryMenu ? (
            <PlaylistPicker controls={controls} textStyle={textStyle} />
          ) : undefined
        }
        checkedActions={
          showLibraryMenu ? (
            <AddToButton
              controls={controls}
              fileNames={[...new Set(checkedNames)]}
            />
          ) : undefined
        }
        footer={
          showing ? (
            <CapacityBar capacity={capacity} textStyle={textStyle} />
          ) : undefined
        }
      />
      {!props.openDetails && selected.length > 0 && (
        <View style={styles.pane}>
          <DetailsPane
            fileNames={selected}
            onRenamed={(old, renamed) => {
              playback.renamed(old, renamed);
              selection.set([renamed]);
            }}
            onChanged={refreshLibraryViews}
            onClose={() => selection.set([])}
            showMenu={props.showMenu}
            textStyle={textStyle}
            isDark={isDark}
          />
        </View>
      )}
      {showLibraryMenu && (
        <PlaylistPrompt
          controls={controls}
          textStyle={textStyle}
          onMessage={onMessage}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  libraryRow: { flex: 1, flexDirection: 'row' },
  pane: { width: 300, marginLeft: 16 },
});
