import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorText } from './appHelpers';
import { DetailsPane, type ShowMenu } from './DetailsPane';
import { LibraryTable } from './LibraryTable';
import { library, type Recording } from './native/SoundScraper';
import { playback, usePlayback } from './playback';
import { selection } from './selection';

type Props = {
  onMessage: (message: { text: string; isError: boolean }) => void;
  textStyle: object;
  isDark: boolean;
  /** Skinned panel: no heading (see LibraryTable). */
  compact?: boolean;
  /** Reports how many recordings there are (for a title). */
  onCount?: (count: number) => void;
  /**
   * Shows the selection in a separate details window (the skinned UI);
   * without it, the details pane sits beside the table.
   */
  openDetails?: () => void;
  /** Native menus for the details pane's gear (side-pane mode). */
  showMenu?: ShowMenu;
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

  const refreshLibrary = useCallback(async () => {
    try {
      setRecordings(await library.list());
      setListed(true);
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

  useEffect(() => {
    onCount?.(recordings.length);
  }, [recordings.length, onCount]);

  // Drop vanished recordings from the checks and the selection.
  useEffect(() => {
    const names = new Set(recordings.map(r => r.fileName));
    setChecked(prev => {
      const next = new Set([...prev].filter(n => names.has(n)));
      return next.size === prev.size ? prev : next;
    });
    const current = selection.get();
    if (recordings.length > 0 && current.some(n => !names.has(n))) {
      selection.set(current.filter(n => names.has(n)));
    }
    // The loaded recording was trashed (or moved away).
    const p = playback.get();
    if (listed && p.fileName && !names.has(p.fileName)) {
      playback.clear();
    }
  }, [recordings, listed]);

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

  const show = (fileNames: string[]) => {
    selection.set(fileNames);
    props.openDetails?.();
  };

  return (
    <View style={styles.libraryRow}>
      <LibraryTable
        recordings={recordings}
        selected={selected.length === 1 ? selected[0] : undefined}
        loaded={loaded}
        onSelect={name => show([name])}
        onEditTags={show}
        checked={checked}
        onCheckedChange={setChecked}
        textStyle={textStyle}
        isDark={isDark}
        compact={props.compact}
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
    </View>
  );
}

const styles = StyleSheet.create({
  libraryRow: { flex: 1, flexDirection: 'row' },
  pane: { width: 300, marginLeft: 16 },
});
