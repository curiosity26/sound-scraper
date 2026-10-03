import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
} from 'react-native';

import { library, type Tags } from './native/SoundScraper';
import {
  buildEdit,
  type CoverChange,
  type CoverState,
  type Field,
  FIELD_LABELS,
  fileUri,
  type Merged,
  mergeCovers,
  mergeTags,
  TEXT_FIELDS,
  validate,
} from './tagModel';
import { colors } from './theme';

type Props = {
  /** Recordings to edit; several means bulk edit of shared fields. */
  fileNames: string[];
  onSaved: () => void;
  onClose: () => void;
  textStyle: object;
  isDark: boolean;
};

/** Side panel for ID3 tags, including cover art and bulk edits. */
export function TagEditor(props: Props): React.JSX.Element {
  const { fileNames, textStyle, isDark } = props;
  const [loaded, setLoaded] = useState<Tags[]>();
  const [loadError, setLoadError] = useState<string>();
  const [edits, setEdits] = useState<Partial<Record<Field, string>>>({});
  const [cover, setCover] = useState<CoverChange>({ kind: 'keep' });
  const [id3v23, setId3v23] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean }>();

  const key = fileNames.join('\u0000');
  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const names = key.split('\u0000').filter(Boolean);
      setLoaded(await Promise.all(names.map(n => library.readTags(n))));
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [key]);

  useEffect(() => {
    setLoaded(undefined);
    setEdits({});
    setCover({ kind: 'keep' });
    setMessage(undefined);
    load();
  }, [load]);

  const merged = useMemo(
    () => (loaded ? mergeTags(loaded) : undefined),
    [loaded],
  );
  const currentCover: CoverState = useMemo(() => {
    if (cover.kind === 'set') {
      return { kind: 'image', path: cover.path };
    }
    if (cover.kind === 'remove' || !loaded) {
      return { kind: 'none' };
    }
    return mergeCovers(loaded);
  }, [cover, loaded]);

  const errors = TEXT_FIELDS.map(f =>
    edits[f] === undefined ? null : validate(f, edits[f]!),
  ).filter(Boolean);
  const dirty = Object.keys(edits).length > 0 || cover.kind !== 'keep';

  const save = async () => {
    setSaving(true);
    setMessage(undefined);
    try {
      await library.writeTags(fileNames, buildEdit(edits, cover, id3v23));
      setEdits({});
      setCover({ kind: 'keep' });
      setMessage({
        text:
          fileNames.length === 1
            ? 'Saved.'
            : `Saved to ${fileNames.length} recordings.`,
        isError: false,
      });
      props.onSaved();
      await load();
    } catch (e) {
      setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true });
    } finally {
      setSaving(false);
    }
  };

  const chooseImage = async () => {
    try {
      const path = await library.pickImage();
      if (path) {
        setCover({ kind: 'set', path });
      }
    } catch (e) {
      setMessage({ text: errorText(e), isError: true });
    }
  };

  const input = [styles.input, textStyle, isDark && styles.inputDark];

  return (
    <View style={[styles.panel, isDark && styles.panelDark]}>
      <View style={styles.header}>
        <Text style={[styles.heading, textStyle]} numberOfLines={1}>
          {fileNames.length === 1
            ? 'Tags'
            : `Tags · ${fileNames.length} recordings`}
        </Text>
        <Pressable onPress={props.onClose}>
          <Text style={styles.link}>Close</Text>
        </Pressable>
      </View>

      {!merged ? (
        loadError ? (
          <Text style={styles.error}>Couldn't read tags: {loadError}</Text>
        ) : (
          <ActivityIndicator />
        )
      ) : (
        <ScrollView>
          <View style={styles.coverRow}>
            <View style={[styles.cover, isDark && styles.inputDark]}>
              {currentCover.kind === 'image' ? (
                <Image
                  source={{ uri: fileUri(currentCover.path) }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={[styles.coverText, textStyle]}>
                  {currentCover.kind === 'mixed'
                    ? 'Multiple covers'
                    : 'No cover'}
                </Text>
              )}
            </View>
            <View style={styles.coverButtons}>
              <Pressable onPress={chooseImage} testID="choose-cover">
                <Text style={styles.link}>Choose image…</Text>
              </Pressable>
              {(currentCover.kind !== 'none' || cover.kind === 'set') && (
                <Pressable onPress={() => setCover({ kind: 'remove' })}>
                  <Text style={[styles.link, styles.destructive]}>
                    Remove cover
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {TEXT_FIELDS.map(field => (
            <FieldInput
              key={field}
              field={field}
              merged={merged[field]}
              edited={edits[field]}
              onChange={text => setEdits(e => ({ ...e, [field]: text }))}
              inputStyle={input}
              textStyle={textStyle}
            />
          ))}

          <Pressable style={styles.checkRow} onPress={() => setId3v23(v => !v)}>
            <Text style={[styles.label, textStyle]}>
              {id3v23 ? '☑' : '☐'} Save as ID3v2.3 (for older players)
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              testID="save-tags"
              onPress={save}
              disabled={!dirty || saving || errors.length > 0}
              style={[
                styles.button,
                (!dirty || saving || errors.length > 0) && styles.disabled,
              ]}
            >
              <Text style={styles.buttonText}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
            {dirty && !saving && (
              <Pressable
                onPress={() => {
                  setEdits({});
                  setCover({ kind: 'keep' });
                }}
              >
                <Text style={styles.link}>Revert</Text>
              </Pressable>
            )}
          </View>
          {errors.length > 0 && (
            <Text style={styles.error}>{errors.join('\n')}</Text>
          )}
          {message && (
            <Text
              style={[
                styles.message,
                textStyle,
                message.isError && styles.error,
              ]}
            >
              {message.text}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function FieldInput(props: {
  field: Field;
  merged: Merged;
  edited: string | undefined;
  onChange: (text: string) => void;
  inputStyle: StyleProp<TextStyle>;
  textStyle: object;
}) {
  const { field, merged, edited } = props;
  const mixed = merged.kind === 'mixed';
  const value = edited ?? (mixed ? '' : merged.text);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, props.textStyle]}>
        {FIELD_LABELS[field]}
        {edited !== undefined ? ' •' : ''}
      </Text>
      <TextInput
        testID={`tag-${field}`}
        style={[props.inputStyle, field === 'comment' && styles.multiline]}
        value={value}
        placeholder={mixed && edited === undefined ? 'Multiple values' : ''}
        multiline={field === 'comment'}
        keyboardType={field === 'track' ? 'number-pad' : 'default'}
        onChangeText={props.onChange}
      />
    </View>
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

const styles = StyleSheet.create({
  panel: {
    width: 320,
    marginLeft: 16,
    paddingLeft: 16,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  panelDark: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heading: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  link: { color: colors.accent, fontSize: 13 },
  destructive: { color: colors.error },
  coverRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  cover: {
    width: 96,
    height: 96,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: { width: 96, height: 96 },
  coverText: { fontSize: 11, opacity: 0.6, textAlign: 'center' },
  coverButtons: { justifyContent: 'center', gap: 8 },
  field: { marginBottom: 8 },
  label: { fontSize: 12, opacity: 0.8, marginBottom: 3 },
  input: {
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 4,
  },
  inputDark: { backgroundColor: '#2a2a2a' },
  multiline: { minHeight: 48 },
  checkRow: { marginVertical: 8 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, fontSize: 12, marginTop: 6 },
  message: { fontSize: 12, marginTop: 6 },
});
