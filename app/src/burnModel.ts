// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import NativeSoundScraper from './native/NativeSoundScraper';
import {
  type Capacity,
  formatSectors,
  MAX_TRACKS,
  SECTORS_74,
} from './playlistModel';

/** Mirrors sound_scraper_disc::Media. */
export type Media = {
  /** 'none' | 'blank' | 'erasable' | 'unusable' | 'image' */
  state: string;
  kind: string | null;
  /** Sectors available for audio. */
  capacity: number | null;
  label: string;
};

/** Mirrors sound_scraper_disc::Device. */
export type Device = {
  id: string;
  name: string;
  /** 'image' | 'simulated' | 'drive' */
  kind: string;
  media: Media;
  speeds: number[];
  canTest: boolean;
  gapless: boolean;
  cdText: boolean;
};

export type TrackState =
  | 'waiting'
  | 'preparing'
  | 'ready'
  | 'writing'
  | 'done'
  | 'failed';

/** Mirrors core::burn::Status. */
export type BurnStatus = {
  state: 'preparing' | 'writing' | 'done' | 'failed' | 'cancelled';
  phase: string;
  destination: string;
  kind: string;
  tracks: Array<{
    title: string;
    durationMs: number;
    state: TrackState;
    progress: number;
  }>;
  overall: number;
  elapsedMs: number;
  remainingMs: number | null;
  speedX: number | null;
  buffer: number | null;
  log: Array<{ atMs: number; text: string }>;
  message: string | null;
  output: string | null;
  testWrite: boolean;
};

export type SimSettings = {
  media: 'blank74' | 'blank80' | 'rewritableUsed' | 'none' | 'dvd';
  fault:
    | { kind: 'none' }
    | { kind: 'underrun' | 'removed' | 'writeError'; track: number };
  fast: boolean;
};

export type BurnTrackInput = {
  path: string;
  title: string;
  performer: string | null;
  durationMs: number;
};

export type BurnOptions = {
  deviceId: string;
  title: string;
  tracks: BurnTrackInput[];
  gapSeconds: number;
  cdText: boolean;
  testWrite: boolean;
  speed: number;
  eject: boolean;
  erase: boolean;
  imagePath: string | null;
};

function call<T>(request: object): T {
  const answer = JSON.parse(
    NativeSoundScraper.burn(JSON.stringify(request)),
  ) as {
    ok?: T;
    error?: string;
  };
  if (answer.error !== undefined) {
    throw new Error(answer.error);
  }
  return answer.ok as T;
}

export const burnApi = {
  devices: () =>
    call<{ devices: Device[]; simulator: boolean }>({ op: 'devices' }),
  /** Starts a burn; returns the job id to poll. */
  start: (options: BurnOptions) => call<number>({ op: 'start', ...options }),
  status: (id: number) => call<BurnStatus>({ op: 'status', id }),
  cancel: (id: number) => call<null>({ op: 'cancel', id }),
  close: (id: number) => call<null>({ op: 'close', id }),
  simSettings: () => call<SimSettings>({ op: 'simSettings' }),
  setSimSettings: (settings: SimSettings) =>
    call<null>({ op: 'setSimSettings', settings }),
  reveal: (path: string) => call<null>({ op: 'reveal', path }),
};

/** Whether a burn to `device` can start, and what the button says. */
export type Readiness = {
  ok: boolean;
  /** "Burn", "Erase and Burn", "Save Image…" */
  action: string;
  /** Why not, or a note. */
  reason?: string;
};

export function readiness(
  device: Device | undefined,
  capacity: Capacity,
): Readiness {
  if (!device) {
    return { ok: false, action: 'Burn', reason: 'Choose where to burn.' };
  }
  const image = device.kind === 'image';
  const action = image
    ? 'Save Image…'
    : device.media.state === 'erasable'
    ? 'Erase and Burn'
    : 'Burn';
  if (capacity.tracks === 0) {
    return { ok: false, action, reason: 'There are no tracks to burn.' };
  }
  if (capacity.tracks > MAX_TRACKS) {
    return {
      ok: false,
      action,
      reason: `A CD holds at most ${MAX_TRACKS} tracks.`,
    };
  }
  const media = device.media;
  if (media.state === 'none') {
    return { ok: false, action, reason: 'Insert a blank CD-R or CD-RW.' };
  }
  if (media.state === 'unusable') {
    return { ok: false, action, reason: media.label };
  }
  const room = media.capacity;
  if (room !== null && capacity.totalSectors > room) {
    const over = formatSectors(capacity.totalSectors - room);
    const minutes = room <= SECTORS_74 ? 74 : 80;
    return {
      ok: false,
      action,
      reason: image
        ? `${over} too long for an 80-minute CD.`
        : minutes === 74 && capacity.fit === 'fits80'
        ? `${over} too long for this 74-minute disc. Use an 80-minute CD-R.`
        : `${over} too long for this disc.`,
    };
  }
  return { ok: true, action };
}

/** "52:38 with gaps · fits (27:19 free)" */
export function fitLine(device: Device | undefined, c: Capacity): string {
  const used = `${formatSectors(c.totalSectors)} with gaps`;
  const room = device?.media.capacity;
  if (room === null || room === undefined) {
    return used;
  }
  return c.totalSectors <= room
    ? `${used} · fits (${formatSectors(room - c.totalSectors)} free)`
    : `${used} · doesn't fit`;
}

/** 1:05, or 1:02:05. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "Writing at 24x (3,528 KB/s)" */
export function speedText(x: number | null): string | null {
  if (x === null) {
    return null;
  }
  const kbs = Math.round((x * 75 * 2352) / 1000);
  return `${x.toFixed(x % 1 === 0 ? 0 : 1)}x (${kbs.toLocaleString(
    'en-US',
  )} KB/s)`;
}

export function isRunning(s: BurnStatus | null): boolean {
  return s?.state === 'preparing' || s?.state === 'writing';
}
