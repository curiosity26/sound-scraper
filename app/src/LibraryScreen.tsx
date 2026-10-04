import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorText, safeSettings } from './appHelpers';
import { LibraryTable } from './LibraryTable';
import { library, type Recording } from './native/SoundScraper';
import { TagEditor } from './TagEditor';

type Props = {
  onMessage: (message: { text: string; isError: boolean }) => void;
  textStyle: object;
  isDark: boolean;
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
  const { onMessage, textStyle, isDark } = props;
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tagTargets, setTagTargets] = useState<string[]>();

  const refreshLibrary = useCallback(async () => {
    try {
      setRecordings(await library.list());
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
    const names = new Set(recordings.map(r => r.fileName));
    setChecked(prev => {
      const next = new Set([...prev].filter(n => names.has(n)));
      return next.size === prev.size ? prev : next;
    });
    setTagTargets(prev => {
      const next = prev?.filter(n => names.has(n));
      return next && next.length === prev?.length ? prev : next;
    });
  }, [recordings]);

  const onRename = useCallback(
    async (r: Recording, newName: string) => {
      try {
        const renamed = await library.rename(r.fileName, newName);
        onMessage({ text: `Renamed to ${renamed}`, isError: false });
      } catch (e) {
        onMessage({ text: `Couldn't rename: ${errorText(e)}`, isError: true });
      }
      refreshLibrary();
    },
    [refreshLibrary, onMessage],
  );

  const onTrash = useCallback(
    async (r: Recording) => {
      try {
        await library.trash(r.fileName);
      } catch (e) {
        onMessage({
          text: `Couldn't move to Trash: ${errorText(e)}`,
          isError: true,
        });
      }
      refreshLibrary();
    },
    [refreshLibrary, onMessage],
  );

  return (
    <View style={styles.libraryRow}>
      <LibraryTable
        recordings={recordings}
        onRename={onRename}
        onTrash={onTrash}
        onReveal={r => library.reveal(r.fileName)}
        onEditTags={setTagTargets}
        checked={checked}
        onCheckedChange={setChecked}
        textStyle={textStyle}
        isDark={isDark}
      />
      {tagTargets && tagTargets.length > 0 && (
        <TagEditor
          fileNames={tagTargets}
          onSaved={refreshLibrary}
          defaultId3v23={safeSettings()?.id3Version === '2.3'}
          onClose={() => setTagTargets(undefined)}
          textStyle={textStyle}
          isDark={isDark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  libraryRow: { flex: 1, flexDirection: 'row' },
});
