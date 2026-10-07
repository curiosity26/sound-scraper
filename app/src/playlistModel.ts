// Playlist rows, reordering and the audio-CD capacity check
// (docs/playlists-and-cd-burning-design.md §4, §5). Pure, so it's unit-tested.
import {
  displayName,
  filterRecordings,
  type Sort,
  sortBy,
} from './libraryModel';
import type { PlaylistItem, Recording } from './native/SoundScraper';

/** One row of a playlist: its item, and the recording unless it's missing. */
export type PlaylistRow = {
  item: PlaylistItem;
  /** 1-based place in the playlist. */
  position: number;
  recording?: Recording;
};

export function playlistRows(
  items: PlaylistItem[],
  recordings: Recording[],
): PlaylistRow[] {
  const byName = new Map(recordings.map(r => [r.fileName, r]));
  return items.map((item, i) => ({
    item,
    position: i + 1,
    recording: byName.get(item.fileName),
  }));
}

/** Search, like the library's; missing rows match on their file name. */
export function filterPlaylistRows(
  rows: PlaylistRow[],
  query: string,
): PlaylistRow[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return rows;
  }
  return rows.filter(row =>
    row.recording
      ? filterRecordings([row.recording], q).length > 0
      : row.item.fileName.toLowerCase().includes(q),
  );
}

/** By position (the playlist's order), or a column; missing rows go last. */
export function sortPlaylistRows(
  rows: PlaylistRow[],
  sort: Sort,
): PlaylistRow[] {
  if (sort.key === 'position') {
    return sort.ascending ? rows : [...rows].reverse();
  }
  const present = rows.filter(r => r.recording);
  const missing = rows.filter(r => !r.recording);
  return [...sortBy(present, r => r.recording!, sort), ...missing];
}

/** The name shown for a row. */
export function rowName(row: PlaylistRow): string {
  return row.recording
    ? displayName(row.recording)
    : row.item.fileName.replace(/\.mp3$/i, '');
}

/**
 * The order after moving `moving` (item ids, kept in their current order) so
 * they land before the item now at `toIndex` (`order.length` = the end).
 */
export function moveItems(
  order: number[],
  moving: number[],
  toIndex: number,
): number[] {
  const set = new Set(moving);
  const moved = order.filter(id => set.has(id));
  if (moved.length === 0) {
    return order;
  }
  const before = order.slice(0, toIndex).filter(id => !set.has(id));
  const after = order.slice(toIndex).filter(id => !set.has(id));
  return [...before, ...moved, ...after];
}

/** Moves the items up (-1) or down (+1) one place, as a block. */
export function moveBy(
  order: number[],
  moving: number[],
  delta: -1 | 1,
): number[] {
  const set = new Set(moving);
  const indices = order
    .map((id, i) => (set.has(id) ? i : -1))
    .filter(i => i >= 0);
  if (indices.length === 0) {
    return order;
  }
  if (delta < 0) {
    const first = indices[0];
    return first === 0 ? order : moveItems(order, moving, first - 1);
  }
  const last = indices[indices.length - 1];
  return last === order.length - 1 ? order : moveItems(order, moving, last + 2);
}

// ------------------------------------------------------------ CD capacity

/** Red Book: 75 sectors (2352 bytes, 588 stereo samples) per second. */
export const SECTORS_PER_SECOND = 75;
/** 74:00 */
export const SECTORS_74 = 74 * 60 * SECTORS_PER_SECOND;
/** 79:57, what real 80-minute blanks report (a little under 80:00). */
export const SECTORS_80 = (79 * 60 + 57) * SECTORS_PER_SECOND;
export const MAX_TRACKS = 99;
/** Tracks shorter than 4 s are padded to it. */
export const MIN_TRACK_SECTORS = 4 * SECTORS_PER_SECOND;
/** Track 1's pregap, always there. */
export const FIRST_PREGAP_SECTORS = 2 * SECTORS_PER_SECOND;

export function trackSectors(durationMs: number): number {
  return Math.max(
    MIN_TRACK_SECTORS,
    Math.ceil((durationMs * SECTORS_PER_SECOND) / 1000),
  );
}

export type DiscFit = 'empty' | 'fits74' | 'fits80' | 'tooLong' | 'tooMany';

export type Capacity = {
  tracks: number;
  /** Everything on the disc: pregap, tracks and gaps. */
  totalSectors: number;
  /** Just the gaps (including track 1's pregap). */
  gapSectors: number;
  fit: DiscFit;
  /** Free on the smallest disc it fits, or over 80 minutes when negative. */
  spareSectors: number;
  /**
   * Index (in the rows given) of the first track that runs past an 80-minute
   * disc, or -1.
   */
  firstOver: number;
  /** Rows left out because their recording is missing. */
  missing: number;
};

/**
 * What a playlist needs on an audio CD with `gapSeconds` between tracks.
 * Missing recordings are skipped, as the burner skips them.
 */
export function discCapacity(rows: PlaylistRow[], gapSeconds = 2): Capacity {
  const gap = Math.round(gapSeconds * SECTORS_PER_SECOND);
  let total = 0;
  let gaps = 0;
  let tracks = 0;
  let firstOver = -1;
  let missing = 0;
  rows.forEach((row, i) => {
    if (!row.recording) {
      missing += 1;
      return;
    }
    const lead = tracks === 0 ? FIRST_PREGAP_SECTORS : gap;
    gaps += lead;
    total += lead + trackSectors(row.recording.durationMs);
    tracks += 1;
    if (firstOver < 0 && total > SECTORS_80) {
      firstOver = i;
    }
  });
  const fit: DiscFit =
    tracks === 0
      ? 'empty'
      : tracks > MAX_TRACKS
      ? 'tooMany'
      : total <= SECTORS_74
      ? 'fits74'
      : total <= SECTORS_80
      ? 'fits80'
      : 'tooLong';
  return {
    tracks,
    totalSectors: total,
    gapSectors: gaps,
    fit,
    spareSectors: (fit === 'fits74' ? SECTORS_74 : SECTORS_80) - total,
    firstOver,
    missing,
  };
}

/** m:ss for a sector count. */
export function formatSectors(sectors: number): string {
  const seconds = Math.round(Math.abs(sectors) / SECTORS_PER_SECOND);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The sentence under the capacity bar. */
export function capacityText(c: Capacity): string {
  switch (c.fit) {
    case 'empty':
      return c.missing > 0
        ? 'Every track here is missing from the library.'
        : 'Add recordings to burn a CD.';
    case 'fits74':
      return `Fits a 74-minute CD with ${formatSectors(
        c.spareSectors,
      )} to spare`;
    case 'fits80':
      return `Needs an 80-minute CD (${formatSectors(
        c.spareSectors,
      )} to spare)`;
    case 'tooLong':
      return `${formatSectors(
        -c.spareSectors,
      )} too long for a CD: remove a track or two`;
    case 'tooMany':
      return `${c.tracks} tracks: a CD holds at most ${MAX_TRACKS}`;
  }
}

/** "12 tracks · 52:14 (+0:24 gaps)" */
export function capacitySummary(c: Capacity): string {
  const tracks = c.tracks === 1 ? '1 track' : `${c.tracks} tracks`;
  const music = formatSectors(c.totalSectors - c.gapSectors);
  const missing = c.missing > 0 ? ` · ${c.missing} missing` : '';
  return c.tracks === 0
    ? `0 tracks${missing}`
    : `${tracks} · ${music} (+${formatSectors(c.gapSectors)} gaps)${missing}`;
}
