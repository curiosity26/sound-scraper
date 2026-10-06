import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type Quality, settings, type Settings } from './native/SoundScraper';
import { usePanelStyles } from './panelTheme';
import { colors } from './theme';

const QUALITIES: { value: Quality; label: string; detail: string }[] = [
  { value: 'cbr128', label: '128 kbps', detail: 'Constant bitrate · smallest' },
  { value: 'cbr192', label: '192 kbps', detail: 'Constant bitrate · default' },
  { value: 'cbr256', label: '256 kbps', detail: 'Constant bitrate' },
  { value: 'cbr320', label: '320 kbps', detail: 'Constant bitrate · largest' },
  { value: 'vbr0', label: 'VBR V0', detail: 'Variable · about 245 kbps' },
  { value: 'vbr2', label: 'VBR V2', detail: 'Variable · about 190 kbps' },
];

type Props = {
  /** Shows a heading with Done (the overlay in the plain UI); the skinned
   * window has its own title and close button. */
  onClose?: () => void;
  /** Called after a change that affects the library (folder). */
  onFolderChanged: () => void;
  textStyle: object;
};

/** App settings; each change is saved right away by the Rust core. */
export function SettingsPanel(props: Props): React.JSX.Element {
  const { textStyle } = props;
  const t = usePanelStyles();
  const [current, setCurrent] = useState(() => settings.get());
  const [error, setError] = useState<string>();

  const save = async (patch: Partial<Settings>) => {
    // Fresh from disk: another window may have changed other settings.
    const next = { ...settings.get(), ...patch };
    setError(undefined);
    try {
      await settings.set(next);
      setCurrent(settings.get());
      if ('recordingsDir' in patch) {
        props.onFolderChanged();
      }
    } catch (e) {
      setError(errorText(e));
    }
  };

  const chooseFolder = async () => {
    const dir = await settings.pickFolder();
    if (dir) {
      await save({ recordingsDir: dir });
    }
  };

  return (
    <View style={styles.panel}>
      {props.onClose && (
        <View style={styles.header}>
          <Text style={[styles.heading, textStyle]}>Settings</Text>
          <Pressable onPress={props.onClose} testID="close-settings">
            <Text style={[styles.link, t.link]}>Done</Text>
          </Pressable>
        </View>
      )}
      <ScrollView>
        <Text style={[styles.section, textStyle]}>Recordings folder</Text>
        <Text selectable style={[styles.path, textStyle]}>
          {current.effectiveRecordingsDir}
        </Text>
        <View style={styles.row}>
          <Pressable onPress={chooseFolder} testID="choose-folder">
            <Text style={[styles.link, t.link]}>Choose…</Text>
          </Pressable>
          {current.recordingsDir !== null && (
            <Pressable onPress={() => save({ recordingsDir: null })}>
              <Text style={[styles.link, t.link]}>Use default</Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.section, textStyle]}>MP3 quality</Text>
        {QUALITIES.map(q => (
          <Choice
            key={q.value}
            selected={current.quality === q.value}
            label={q.label}
            detail={q.detail}
            onPress={() => save({ quality: q.value })}
            textStyle={textStyle}
          />
        ))}

        <Text style={[styles.section, textStyle]}>Silence</Text>
        <Pressable
          onPress={() => save({ trimSilence: current.trimSilence === false })}
          style={styles.choice}
          testID="trim-silence"
        >
          <Text style={[styles.choiceLabel, textStyle]}>
            {current.trimSilence !== false ? '☑ ' : '☐ '}
            Trim silence
          </Text>
          <Text style={[styles.choiceDetail, textStyle]}>
            Cuts the quiet before the first and after the last sound of a
            recording · default
          </Text>
        </Pressable>

        <Text style={[styles.section, textStyle]}>Tags</Text>
        <Choice
          selected={current.id3Version === '2.4'}
          label="ID3v2.4"
          detail={
            Platform.OS === 'windows'
              ? 'Modern players (Windows Explorer and Media Player can’t show its cover art)'
              : 'Modern players · default'
          }
          onPress={() => save({ id3Version: '2.4' })}
          textStyle={textStyle}
        />
        <Choice
          selected={current.id3Version === '2.3'}
          label="ID3v2.3"
          detail={
            Platform.OS === 'windows'
              ? 'Widest compatibility, shows cover art in Windows · default'
              : 'For older players, car stereos and Windows'
          }
          onPress={() => save({ id3Version: '2.3' })}
          textStyle={textStyle}
        />

        <Text style={[styles.note, textStyle]}>
          The last capture source you recorded is remembered and selected again
          when Sound Scraper starts.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function Choice(props: {
  selected: boolean;
  label: string;
  detail: string;
  onPress: () => void;
  textStyle: object;
}) {
  return (
    <Pressable onPress={props.onPress} style={styles.choice}>
      <Text style={[styles.choiceLabel, props.textStyle]}>
        {props.selected ? '● ' : '○ '}
        {props.label}
      </Text>
      <Text style={[styles.choiceDetail, props.textStyle]}>{props.detail}</Text>
    </Pressable>
  );
}

function errorText(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

export const panelStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    padding: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
});

const styles = StyleSheet.create({
  panel: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: { fontSize: 18, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 13 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  path: { fontSize: 12, opacity: 0.8, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 16 },
  choice: { paddingVertical: 4 },
  choiceLabel: { fontSize: 13 },
  choiceDetail: { fontSize: 11, opacity: 0.6, marginLeft: 18 },
  note: { fontSize: 11, opacity: 0.6, marginTop: 16 },
  error: { color: colors.error, fontSize: 12, marginTop: 8 },
});
