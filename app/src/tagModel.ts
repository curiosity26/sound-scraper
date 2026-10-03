import type { TagEdit, Tags } from './native/SoundScraper';

export const TEXT_FIELDS = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'date',
  'track',
  'genre',
  'comment',
] as const;
export type Field = (typeof TEXT_FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  date: 'Year / date',
  track: 'Track #',
  genre: 'Genre',
  comment: 'Comment',
};

/** A field's value across the selection: shared text, or mixed. */
export type Merged = { kind: 'value'; text: string } | { kind: 'mixed' };

export type CoverState =
  | { kind: 'none' }
  | { kind: 'image'; path: string }
  | { kind: 'mixed' };

export function fieldText(tags: Tags, field: Field): string {
  const v = field === 'track' ? tags.track : tags[field];
  return v == null ? '' : String(v);
}

/** Shared values for each field; differing values become 'mixed'. */
export function mergeTags(all: Tags[]): Record<Field, Merged> {
  const out = {} as Record<Field, Merged>;
  for (const field of TEXT_FIELDS) {
    const texts = new Set(all.map(t => fieldText(t, field)));
    out[field] =
      texts.size <= 1
        ? { kind: 'value', text: [...texts][0] ?? '' }
        : { kind: 'mixed' };
  }
  return out;
}

/** Covers are cached by content, so identical covers share a path. */
export function mergeCovers(all: Tags[]): CoverState {
  const paths = new Set(all.map(t => t.coverPath));
  if (paths.size !== 1) {
    return { kind: 'mixed' };
  }
  const path = [...paths][0];
  return path ? { kind: 'image', path } : { kind: 'none' };
}

export type CoverChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'set'; path: string };

/** Validates a field; returns an error message or null. */
export function validate(field: Field, text: string): string | null {
  const t = text.trim();
  if (!t) {
    return null;
  }
  if (field === 'track' && !/^\d{1,4}$/.test(t)) {
    return 'Track # must be a whole number';
  }
  if (field === 'date' && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t)) {
    return 'Use 2026, 2026-10 or 2026-10-03';
  }
  return null;
}

/** The edit for the fields the user changed (only those are written). */
export function buildEdit(
  values: Partial<Record<Field, string>>,
  cover: CoverChange,
  id3v23: boolean,
): TagEdit {
  const fields = TEXT_FIELDS.filter(f => values[f] !== undefined);
  const text = (f: Exclude<Field, 'track'>) => {
    const v = values[f]?.trim();
    return v ? v : null;
  };
  const track = values.track?.trim();
  return {
    fields: [...fields],
    title: text('title'),
    artist: text('artist'),
    album: text('album'),
    albumArtist: text('albumArtist'),
    date: text('date'),
    genre: text('genre'),
    comment: text('comment'),
    track: track ? Number(track) : null,
    cover: cover.kind,
    coverPath: cover.kind === 'set' ? cover.path : null,
    id3v23,
  };
}

/** A file path as an Image source URI (macOS and Windows). */
export function fileUri(path: string): string {
  return path.startsWith('/')
    ? `file://${encodeURI(path)}`
    : `file:///${encodeURI(path.replace(/\\/g, '/'))}`;
}
