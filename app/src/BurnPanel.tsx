// The burn panel (docs/playlists-and-cd-burning-design.md §6): choose where
// to burn a playlist, then watch it go track by track, ImgBurn style, with
// the phase, total and buffer bars, speed and a log.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { errorText } from './appHelpers';
import {
  burnApi,
  type BurnStatus,
  type Device,
  fitLine,
  formatClock,
  isRunning,
  readiness,
  type SimSettings,
  speedText,
  type TrackState,
} from './burnModel';
import { pickSaveFile } from './native/SoundScraper';
import { usePanelTheme } from './panelTheme';
import { discCapacity, type PlaylistRow } from './playlistModel';
import { burnTarget, shared } from './skin/skins';
import { colors } from './theme';

type Target = NonNullable<ReturnType<typeof burnTarget.get>>;

/** The burn in progress (or last finished), kept while the panel is hidden. */
const job = shared<{ id: number; target: Target; started: number } | null>(
  null,
);

type Theme = {
  text: string;
  dim: string;
  border: string;
  accent: string;
  background: string;
  c: (name: string, fallback: string) => string;
};

function useTheme(): Theme {
  const t = usePanelTheme();
  return useMemo(() => {
    const p = t?.progress ?? {};
    return {
      text: t?.text ?? '#f3ead0',
      dim: (t?.text ?? '#f3ead0') + '99',
      border: t?.border ?? colors.border,
      accent: t?.accent ?? colors.accent,
      background: t?.background ?? '#2a2522',
      c: (name: string, fallback: string) => p[name] ?? fallback,
    };
  }, [t]);
}

/** Rows the capacity math wants, from the burn target's tracks. */
function rowsOf(target: Target): PlaylistRow[] {
  return target.tracks.map((t, i) => ({
    item: { id: i, fileName: t.path },
    position: i + 1,
    recording: {
      fileName: t.path,
      path: t.path,
      title: t.title,
      artist: t.performer,
      album: null,
      durationMs: t.durationMs,
      sizeBytes: 0,
      recordedAtMs: 0,
    },
  }));
}

/**
 * Burn CD… / Save CD Image… in the library: shows the burn panel for
 * `target`, unless a burn is still running (it keeps showing that).
 */
export function openBurnPanel(target: Target, show: () => void) {
  const current = job.get();
  if (current) {
    let running = false;
    try {
      running = isRunning(burnApi.status(current.id));
    } catch {}
    if (!running) {
      try {
        burnApi.close(current.id);
      } catch {}
      job.set(null);
    }
  }
  burnTarget.set(target);
  show();
}

/** Whether a burn is running (the main panel's status, quitting). */
export const burnJob = job;

export function BurnPanel(): React.JSX.Element {
  const [target, setTarget] = useState(burnTarget.get);
  useEffect(() => burnTarget.subscribe(setTarget), []);
  const [current, setCurrent] = useState(job.get);
  useEffect(() => job.subscribe(setCurrent), []);
  const th = useTheme();

  if (current) {
    return <Progress key={current.id} th={th} />;
  }
  if (!target) {
    return (
      <View style={styles.root}>
        <Text style={[styles.note, { color: th.text }]}>
          Show a playlist in the library and choose Burn CD… to burn it here.
        </Text>
      </View>
    );
  }
  return <Setup key={target.playlistId} th={th} target={target} />;
}

// ------------------------------------------------------------ setup

function Setup(props: { th: Theme; target: Target }): React.JSX.Element {
  const { th, target } = props;
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string>();
  const [gap, setGap] = useState(2);
  const [cdText, setCdText] = useState(true);
  const [testWrite, setTestWrite] = useState(false);
  const [eject, setEject] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [sim, setSim] = useState<SimSettings>();
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<null | (() => void)>(null);

  const refresh = useCallback(() => {
    try {
      const { devices: list } = burnApi.devices();
      setDevices(list);
      setDeviceId(id => (id && list.some(d => d.id === id) ? id : list[0]?.id));
      setSim(
        s =>
          s ??
          (list.some(d => d.id === 'sim') ? burnApi.simSettings() : undefined),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  // Drives come and go, and discs go in and out.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const device = devices.find(d => d.id === deviceId);
  const capacity = useMemo(
    () => discCapacity(rowsOf(target), gap),
    [target, gap],
  );
  const ready = readiness(device, capacity);
  const isDrive = device !== undefined && device.kind !== 'image';
  const gapless = device?.gapless ?? true;

  const changeSim = (change: Partial<SimSettings>) => {
    if (!sim) {
      return;
    }
    const next = { ...sim, ...change };
    setSim(next);
    try {
      burnApi.setSimSettings(next);
      refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const start = async () => {
    if (!device) {
      return;
    }
    setError(undefined);
    let imagePath: string | null = null;
    if (device.kind === 'image') {
      imagePath = await pickSaveFile(
        'Save CD image',
        `${target.name}.cue`,
        'cue',
      );
      if (!imagePath) {
        return;
      }
    }
    try {
      const id = burnApi.start({
        deviceId: device.id,
        title: target.name,
        tracks: target.tracks,
        gapSeconds: gap,
        cdText,
        testWrite: testWrite && device.canTest,
        speed,
        eject: isDrive && eject,
        erase: device.media.state === 'erasable',
        imagePath,
      });
      job.set({ id, target, started: Date.now() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onBurn = () => {
    if (device?.media.state === 'erasable') {
      setConfirm(() => start);
    } else {
      start();
    }
  };

  const fg = { color: th.text };
  return (
    <View style={styles.root}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.setup}>
        <Text style={[styles.heading, fg]} numberOfLines={1}>
          “{target.name}” · {capacity.tracks}{' '}
          {capacity.tracks === 1 ? 'track' : 'tracks'}
        </Text>

        <Label th={th} text="Write to" />
        <View style={[styles.devices, { borderColor: th.border }]}>
          {devices.map(d => (
            <Pressable
              key={d.id}
              testID={`burn-device-${d.id}`}
              onPress={() => setDeviceId(d.id)}
              style={[
                styles.device,
                d.id === deviceId && { backgroundColor: th.accent + '33' },
              ]}
            >
              <Text style={[styles.radio, fg]}>
                {d.id === deviceId ? '◉' : '○'}
              </Text>
              <View style={styles.flex}>
                <Text style={[styles.deviceName, fg]}>{d.name}</Text>
                <Text style={[styles.small, { color: th.dim }]}>
                  {d.media.label}
                </Text>
              </View>
            </Pressable>
          ))}
          {devices.length > 0 && !devices.some(d => d.kind === 'drive') && (
            <Text style={[styles.small, styles.noDrive, { color: th.dim }]}>
              No CD burner found. Plug one in and it shows up here.
            </Text>
          )}
        </View>

        {device?.id === 'sim' && sim && (
          <View style={[styles.simBox, { borderColor: th.border }]}>
            <Text style={[styles.small, { color: th.dim }]}>
              Simulator (test builds only)
            </Text>
            <Choice
              th={th}
              label="Disc"
              value={sim.media}
              options={[
                ['blank74', 'Blank 74'],
                ['blank80', 'Blank 80'],
                ['rewritableUsed', 'Used CD-RW'],
                ['none', 'No disc'],
                ['dvd', 'DVD'],
              ]}
              onChange={media => changeSim({ media })}
            />
            <Choice
              th={th}
              label="Trouble"
              value={sim.fault.kind}
              options={[
                ['none', 'None'],
                ['underrun', 'Underrun'],
                ['removed', 'Disc pulled'],
                ['writeError', 'Write error'],
              ]}
              onChange={kind =>
                changeSim({
                  fault:
                    kind === 'none'
                      ? { kind: 'none' }
                      : { kind, track: Math.min(2, capacity.tracks || 1) },
                })
              }
            />
            <Check
              th={th}
              label="Fast (8× quicker than a real drive)"
              value={sim.fast}
              onChange={fast => changeSim({ fast })}
            />
          </View>
        )}

        {isDrive && device.speeds.length > 0 && (
          <Choice
            th={th}
            label="Speed"
            value={String(speed)}
            options={[
              ['0', 'Maximum'],
              ...device.speeds.map(
                s => [String(s), `${s}x`] as [string, string],
              ),
            ]}
            onChange={v => setSpeed(Number(v))}
          />
        )}
        <Choice
          th={th}
          label="Gaps"
          value={String(gap)}
          options={[
            ['2', '2 seconds'],
            ...(gapless ? [['0', 'None (gapless)'] as [string, string]] : []),
          ]}
          onChange={v => setGap(Number(v))}
        />
        {(device?.cdText ?? true) && (
          <Check
            th={th}
            label="CD-Text: write titles and artists"
            value={cdText}
            onChange={setCdText}
          />
        )}
        {device?.canTest && (
          <Check
            th={th}
            label="Test write: everything but the burn (laser off)"
            value={testWrite}
            onChange={setTestWrite}
          />
        )}
        {isDrive && (
          <Check
            th={th}
            label="Eject the disc when done"
            value={eject}
            onChange={setEject}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderColor: th.border }]}>
        <View style={styles.flex}>
          <Text style={[styles.small, fg]} testID="burn-fit">
            {fitLine(device, capacity)}
          </Text>
          {(error || ready.reason) && (
            <Text
              style={[styles.small, error ? styles.error : { color: th.dim }]}
            >
              {error ?? ready.reason}
            </Text>
          )}
        </View>
        <Button
          th={th}
          label={testWrite && device?.canTest ? 'Test' : ready.action}
          accent
          disabled={!ready.ok}
          onPress={onBurn}
          testID="burn-start"
        />
      </View>
      {confirm && (
        <Modal
          th={th}
          title="Erase the CD-RW?"
          body="Everything on it is erased before burning."
          action="Erase and Burn"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const run = confirm;
            setConfirm(null);
            run();
          }}
        />
      )}
    </View>
  );
}

// ------------------------------------------------------------ progress

function Progress(props: { th: Theme }): React.JSX.Element {
  const { th } = props;
  const current = job.get()!;
  const [status, setStatus] = useState<BurnStatus | null>(null);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const log = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      try {
        const s = burnApi.status(current.id);
        if (alive) {
          setStatus(s);
        }
        return isRunning(s);
      } catch (e) {
        setError(errorText(e));
        return false;
      }
    };
    if (!poll()) {
      return;
    }
    const timer = setInterval(() => {
      if (!poll()) {
        clearInterval(timer);
      }
    }, 200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [current.id]);

  const running = isRunning(status);
  const image = status?.kind === 'image';
  const close = () => {
    try {
      burnApi.close(current.id);
    } catch {}
    job.set(null);
  };
  const again = () => {
    close();
    burnTarget.set({ ...current.target });
  };
  const cancel = () => {
    setConfirm(false);
    try {
      burnApi.cancel(current.id);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const fg = { color: th.text };
  const bar = th.c('bar', th.accent);
  const track = th.c('track', '#0004');
  const started = current.started;
  const stamp = (atMs: number) => {
    const d = new Date(started + atMs);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const speed = speedText(status?.speedX ?? null);
  const verb = status?.testWrite ? 'Test write' : image ? 'Image' : 'Burn';
  const headline = !status
    ? 'Starting…'
    : status.state === 'done'
    ? image
      ? `Saved ${current.target.name}.cue`
      : status.testWrite
      ? 'Test write finished: the disc would burn fine'
      : `Burned ${status.tracks.length} tracks to CD`
    : status.state === 'failed'
    ? `${verb} failed`
    : status.state === 'cancelled'
    ? `${verb} cancelled`
    : speed && status.state === 'writing'
    ? `${status.phase} at ${speed}`
    : status.phase;

  return (
    <View style={styles.root}>
      <View style={[styles.tracks, { borderColor: th.border }]}>
        <ScrollView>
          {(status?.tracks ?? []).map((t, i) => (
            <View
              key={i}
              testID={`burn-track-${i + 1}`}
              style={[styles.trackRow, { borderColor: th.border }]}
            >
              <Lamp th={th} state={t.state} />
              <Text style={[styles.trackNo, { color: th.dim }]}>{i + 1}</Text>
              <Text style={[styles.trackTitle, fg]} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={[styles.trackLen, { color: th.dim }]}>
                {formatClock(t.durationMs)}
              </Text>
              <View style={styles.trackStatus}>
                {t.state === 'writing' || t.state === 'preparing' ? (
                  <Bar
                    value={t.progress}
                    color={
                      t.state === 'preparing'
                        ? th.c('preparing', '#a08a6a')
                        : bar
                    }
                    track={track}
                    label={`${Math.floor(t.progress * 100)}%`}
                    text={th.text}
                  />
                ) : (
                  <Text style={[styles.small, { color: th.dim }]}>
                    {TRACK_WORDS[t.state]}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.summary}>
        <Text
          style={[styles.headline, fg]}
          numberOfLines={2}
          testID="burn-headline"
        >
          {headline}
        </Text>
        <View style={styles.meterRow}>
          <Text style={[styles.meterLabel, { color: th.dim }]}>Total</Text>
          <View style={styles.flex}>
            <Bar
              value={status?.overall ?? 0}
              color={
                status?.state === 'failed' ? th.c('failed', colors.error) : bar
              }
              track={track}
              label={`${Math.floor((status?.overall ?? 0) * 100)}%`}
              text={th.text}
            />
          </View>
          <Text style={[styles.clock, { color: th.dim }]}>
            {formatClock(status?.elapsedMs ?? 0)}
            {running && status?.remainingMs != null
              ? ` / ~${formatClock(
                  (status?.elapsedMs ?? 0) + status.remainingMs,
                )}`
              : ''}
          </Text>
        </View>
        {status?.buffer != null && (
          <View style={styles.meterRow}>
            <Text style={[styles.meterLabel, { color: th.dim }]}>Buffer</Text>
            <View style={styles.flex}>
              <Bar
                value={running ? status.buffer : 0}
                color={th.c('buffer', '#6fa0d8')}
                track={track}
                label={running ? `${Math.round(status.buffer * 100)}%` : ''}
                text={th.text}
              />
            </View>
            <View style={styles.clockSpace} />
          </View>
        )}
      </View>

      <ScrollView
        ref={log}
        onContentSizeChange={() =>
          log.current?.scrollToEnd({ animated: false })
        }
        style={[
          styles.log,
          { backgroundColor: th.c('log', '#0006'), borderColor: th.border },
        ]}
      >
        {(status?.log ?? []).map((l, i) => (
          <Text
            key={i}
            selectable
            style={[styles.logLine, { color: th.c('logText', th.text) }]}
          >
            {stamp(l.atMs)} {l.text}
          </Text>
        ))}
      </ScrollView>

      {(error || status?.message) && (
        <Text selectable style={[styles.small, styles.error]}>
          {error ?? status?.message}
        </Text>
      )}
      <View style={styles.buttons}>
        {running ? (
          <Button
            th={th}
            label="Cancel"
            onPress={() =>
              image || status?.state === 'preparing'
                ? cancel()
                : setConfirm(true)
            }
            testID="burn-cancel"
          />
        ) : (
          <>
            {status?.state === 'done' && image && status.output && (
              <Button
                th={th}
                label={REVEAL}
                onPress={() => {
                  try {
                    burnApi.reveal(status.output!);
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              />
            )}
            {status?.state === 'done' && !image && (
              <Button th={th} label="Burn Another Copy" onPress={again} />
            )}
            {(status?.state === 'failed' || status?.state === 'cancelled') && (
              <Button th={th} label="Try Again" onPress={again} />
            )}
            <Button
              th={th}
              label="Close"
              accent
              onPress={close}
              testID="burn-close"
            />
          </>
        )}
      </View>
      {confirm && (
        <Modal
          th={th}
          title="Stop burning?"
          body="A CD-R stopped part way can't be used again."
          action="Stop"
          onCancel={() => setConfirm(false)}
          onConfirm={cancel}
        />
      )}
    </View>
  );
}

const REVEAL =
  Platform.OS === 'windows' ? 'Show in Explorer' : 'Show in Finder';

const TRACK_WORDS: Record<TrackState, string> = {
  waiting: 'Waiting',
  preparing: 'Preparing',
  ready: 'Ready',
  writing: 'Writing',
  done: 'Done',
  failed: 'Failed',
};

// ------------------------------------------------------------ parts

/** A status lamp: dark while waiting, lit while working, green or red after. */
function Lamp(props: { th: Theme; state: TrackState }): React.JSX.Element {
  const { th, state } = props;
  const color =
    state === 'done'
      ? th.c('done', th.accent)
      : state === 'failed'
      ? th.c('failed', colors.error)
      : state === 'writing'
      ? th.c('writing', '#ffb03a')
      : state === 'preparing' || state === 'ready'
      ? th.c('preparing', '#a08a6a')
      : th.c('waiting', '#4a423c');
  const glow = th.c('glow', '#00000000');
  const lit = state !== 'waiting';
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (state !== 'writing') {
      setBlink(true);
      return;
    }
    const t = setInterval(() => setBlink(b => !b), 450);
    return () => clearInterval(t);
  }, [state]);
  const look = {
    backgroundColor: color,
    opacity: blink ? 1 : 0.45,
    shadowColor: lit ? glow : 'transparent',
  };
  return (
    <View accessibilityLabel={TRACK_WORDS[state]} style={[styles.lamp, look]} />
  );
}

function Bar(props: {
  value: number;
  color: string;
  track: string;
  label: string;
  text: string;
}): React.JSX.Element {
  const pct = `${Math.max(0, Math.min(1, props.value)) * 100}%` as const;
  return (
    <View style={[styles.bar, { backgroundColor: props.track }]}>
      <View
        style={[styles.barFill, { width: pct, backgroundColor: props.color }]}
      />
      <Text style={[styles.barText, { color: props.text }]}>{props.label}</Text>
    </View>
  );
}

function Label(props: { th: Theme; text: string }): React.JSX.Element {
  return (
    <Text style={[styles.label, { color: props.th.dim }]}>{props.text}</Text>
  );
}

function Choice<T extends string>(props: {
  th: Theme;
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}): React.JSX.Element {
  const { th } = props;
  return (
    <View style={styles.choiceRow}>
      <Text style={[styles.choiceLabel, { color: th.dim }]}>{props.label}</Text>
      <View style={styles.pills}>
        {props.options.map(([value, text]) => {
          const on = value === props.value;
          return (
            <Pressable
              key={value}
              onPress={() => props.onChange(value)}
              style={[
                styles.pill,
                { borderColor: on ? th.accent : th.border },
                on && { backgroundColor: th.accent + '33' },
              ]}
            >
              <Text style={[styles.pillText, { color: th.text }]}>{text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Check(props: {
  th: Theme;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <Pressable
      style={styles.check}
      onPress={() => props.onChange(!props.value)}
    >
      <Text style={[styles.checkBox, { color: props.th.text }]}>
        {props.value ? '☑' : '☐'}
      </Text>
      <Text style={[styles.small, { color: props.th.text }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function Button(props: {
  th: Theme;
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { th } = props;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: th.border,
          backgroundColor: props.accent ? th.accent : 'transparent',
          opacity: props.disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          props.accent ? styles.accentText : { color: th.text },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function Modal(props: {
  th: Theme;
  title: string;
  body: string;
  action: string;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const { th } = props;
  return (
    <View style={styles.backdrop}>
      <View
        style={[
          styles.modal,
          { backgroundColor: th.background, borderColor: th.border },
        ]}
      >
        <Text style={[styles.heading, { color: th.text }]}>{props.title}</Text>
        <Text style={[styles.small, { color: th.text }]}>{props.body}</Text>
        <View style={styles.buttons}>
          <Button th={th} label="Cancel" onPress={props.onCancel} />
          <Button
            th={th}
            label={props.action}
            accent
            onPress={props.onConfirm}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  flex: { flex: 1 },
  note: { fontSize: 13, lineHeight: 18 },
  setup: { gap: 8, paddingBottom: 8 },
  heading: { fontSize: 14, fontWeight: '600' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  small: { fontSize: 12 },
  error: { color: colors.error },
  devices: { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6 },
  deviceName: { fontSize: 13, fontWeight: '600' },
  radio: { fontSize: 13, width: 16 },
  noDrive: { padding: 6, fontStyle: 'italic' },
  simBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    padding: 6,
    gap: 6,
  },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceLabel: { width: 56, fontSize: 12 },
  pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: { fontSize: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox: { fontSize: 14 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  button: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  buttonText: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  tracks: { flex: 3, borderWidth: 1, borderRadius: 4, minHeight: 80 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lamp: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  trackNo: { width: 18, fontSize: 12, textAlign: 'right' },
  trackTitle: { flex: 1, fontSize: 12 },
  trackLen: { width: 44, fontSize: 12, textAlign: 'right' },
  trackStatus: { width: 120 },
  summary: { gap: 5 },
  headline: { fontSize: 13, fontWeight: '600' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterLabel: { width: 46, fontSize: 11 },
  clock: { width: 96, fontSize: 11, textAlign: 'right' },
  clockSpace: { width: 96 },
  bar: {
    height: 14,
    borderRadius: 2,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barText: { fontSize: 10, textAlign: 'center' },
  log: { flex: 2, borderWidth: 1, borderRadius: 4, padding: 6, minHeight: 60 },
  logLine: {
    fontSize: 11,
    fontFamily: Platform.OS === 'windows' ? 'Consolas' : 'Menlo',
    lineHeight: 15,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { width: 300, padding: 16, borderRadius: 8, borderWidth: 1, gap: 10 },
});
