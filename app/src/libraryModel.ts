import type { Recording } from './native/SoundScraper';

export type SortKey = 'name' | 'duration' | 'date' | 'size' | 'artist';
export type Sort = { key: SortKey; ascending: boolean };

export const DEFAULT_SORT: Sort = { key: 'date', ascending: false };

/** Case-insensitive match on name, title, artist and album. */
export function filterRecordings(
  items: Recording[],
  query: string,
): Recording[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter(r =>
    [r.fileName, r.title, r.artist, r.album].some(
      v => v != null && v.toLowerCase().includes(q),
    ),
  );
}

export function sortRecordings(items: Recording[], sort: Sort): Recording[] {
  const value = (r: Recording): string | number => {
    switch (sort.key) {
      case 'name':
        return displayName(r).toLowerCase();
      case 'duration':
        return r.durationMs;
      case 'size':
        return r.sizeBytes;
      case 'artist':
        return `${r.artist ?? ''}\u0000${r.album ?? ''}`.toLowerCase();
      case 'date':
        return r.recordedAtMs;
    }
  };
  const dir = sort.ascending ? 1 : -1;
  return [...items].sort((a, b) => {
    const [va, vb] = [value(a), value(b)];
    if (va < vb) {
      return -dir;
    }
    if (va > vb) {
      return dir;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

/** Clicking the active column flips direction; a new column starts sensibly. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) {
    return { key, ascending: !current.ascending };
  }
  return { key, ascending: key === 'name' || key === 'artist' };
}

/** The file name without `.mp3`; what rename edits. */
export function displayName(r: Recording): string {
  return r.fileName.replace(/\.mp3$/i, '');
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
