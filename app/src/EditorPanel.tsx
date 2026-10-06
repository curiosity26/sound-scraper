// The track editor (docs/track-editor-design.md §4): the recording's
// waveform under a time ruler, splice marks dragged in the ruler, regions
// selected in the waveform and deleted, a track list, and Save, which asks
// in the window whether to keep the original.
//
// Positions are kept in milliseconds of the original recording. The
// waveform is drawn natively (SSWaveformView) behind a horizontal scroll
// view whose content is the whole recording at the current zoom; the
// ruler, splices, regions and playhead are views in that content.

/* eslint-disable react-native/no-inline-styles */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { errorText } from './appHelpers';
import {
  addSplice,
  adjacentSplice,
  applyProposals,
  stepIn,
  clampZoom,
  deletedAt,
  deleteRegion,
  type Edits,
  editsFromJson,
  editsToJson,
  fitZoom,
  formatTime,
  hasEdits,
  history,
  type History,
  MIN_MS_PER_POINT,
  moveSplice,
  removeSplice,
  renameSplice,
  restoreRegion,
  rulerSteps,
  snap,
  zoomScroll,
} from './editorModel';
import {
  type DetectOptions,
  editorCore,
  type Proposal,
  type TrackInfo,
  type WaveformStatus,
} from './native/editor';
import { usePanelStyles } from './panelTheme';
import { playback, usePlayback } from './playback';
import WaveformNative from './skin/WaveformNative';

// SSWaveformView.mm on macOS, WaveformView.h on Windows.
const SSWaveformView = WaveformNative;

export type EditorTarget = {
  fileName: string;
  path: string;
  title: string;
  durationMs: number;
};

type Props = {
  target: EditorTarget;
  /** The skin's waveform colors. */
  colors: Record<string, string>;
  /** Saved: the new tracks' file names (the editor should close). */
  onSaved: (files: string[], keptOriginal: boolean) => void;
};

const RULER = 24;
/** Splice flag width. */
const FLAG = 10;
/** A press that moves less than this (points) is a click. */
const CLICK_SLOP = 3;

// Snapping is a preference that outlives one editor.
let snapPreference = true;

const PRESETS: Record<
  'digital' | 'vinyl',
  Omit<DetectOptions, 'removeGaps'>
> = {
  // Streams and files: the gaps are digital silence.
  digital: { thresholdDb: -60, minGapMs: 1500, minTrackMs: 30_000 },
  // Vinyl, tape, radio: noise between songs.
  vinyl: { thresholdDb: -40, minGapMs: 1500, minTrackMs: 30_000 },
};
// Find Tracks' last settings, for the next time it opens.
let detectPreference: DetectOptions = { ...PRESETS.digital, removeGaps: false };

const THRESHOLDS = [
  -80, -75, -70, -65, -60, -55, -50, -45, -40, -35, -30, -25, -20,
];
const GAPS = [300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000];
const MIN_TRACKS = [0, 10_000, 30_000, 60_000, 120_000, 300_000];

/** Snippets played while scrubbing, and the stop after the pointer rests. */
const SCRUB_INTERVAL_MS = 60;
const SCRUB_REST_MS = 150;
/** P plays this much either side of the selected splice. */
const PREVIEW_MS = 2000;

type Drag =
  | {
      kind: 'splice';
      id: number;
      atMs: number;
      fromMs: number;
      x0: number;
      isNew: boolean;
    }
  | { kind: 'select'; anchorMs: number; ms: number; x0: number };

type Modal = { kind: 'save'; saving: boolean; error?: string } | null;

const OVERVIEW = 30;
const SCRUB_HANDLE = 11;

export function EditorPanel(props: Props): React.JSX.Element {
  const { target, colors } = props;
  const t = usePanelStyles();
  const pb = usePlayback();
  const loaded = pb.path === target.path;

  // ------------------------------------------------------------ the core
  const [editorId, setEditorId] = useState(0);
  const [status, setStatus] = useState<WaveformStatus>({
    state: 'loading',
    progress: 0,
  });
  useEffect(() => {
    const id = editorCore.open(target.path);
    setEditorId(id);
    setStatus(
      id
        ? { state: 'loading', progress: 0 }
        : { state: 'failed', message: "Couldn't open the recording." },
    );
    return () => editorCore.close(id);
  }, [target.path]);
  useEffect(() => {
    if (!editorId) {
      return;
    }
    const poll = () => {
      const s = editorCore.status(editorId);
      setStatus(s);
      return s.state === 'loading';
    };
    if (!poll()) {
      return;
    }
    const timer = setInterval(() => {
      if (!poll()) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [editorId]);
  const durationMs =
    status.state === 'ready' ? status.durationMs : target.durationMs;

  // ------------------------------------------------------------ edits
  const [hist, setHist] = useState<History>(() =>
    history.start(
      editsFromJson(editorCore.loadDraft(target.fileName), target.title),
    ),
  );
  const edits = hist.present;
  const commit = useCallback(
    (next: Edits) => setHist(h => history.push(h, next)),
    [],
  );
  // Keep a draft so closing the editor (or a crash) loses nothing.
  useEffect(() => {
    const timer = setTimeout(
      () => editorCore.saveDraft(target.fileName, editsToJson(edits)),
      300,
    );
    return () => clearTimeout(timer);
  }, [edits, target.fileName]);

  const [drag, setDrag] = useState<Drag | null>(null);
  // What's shown: the edits with a splice being dragged where it is now.
  const shown = useMemo(
    () =>
      drag?.kind === 'splice' ? moveSplice(edits, drag.id, drag.atMs) : edits,
    [edits, drag],
  );
  const tracks: TrackInfo[] = useMemo(
    () =>
      status.state === 'ready'
        ? editorCore.tracks(editorId, editsToJson(shown))
        : [],
    [status.state, editorId, shown],
  );

  const [selectedSplice, setSelectedSplice] = useState<number | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [selection, setSelection] = useState<{
    startMs: number;
    endMs: number;
  } | null>(null);
  /** The splice (or 'first' track) whose name is being typed. */
  const [naming, setNaming] = useState<number | 'first' | null>(null);
  /** What's typed in the name field so far. */
  const [nameDraft, setNameDraft] = useState('');
  // Which splice is being named, updated at once so a blur that arrives
  // after a click has closed the field doesn't apply the name twice.
  const namingRef = useRef<number | null>(null);
  const startNaming = (id: number, name: string) => {
    namingRef.current = id;
    setNameDraft(name);
    setNaming(id);
  };
  /**
   * Closes the name field, keeping what was typed: called on Enter, on
   * blur, and when anything else in the editor is clicked (macOS doesn't
   * blur the field for clicks on non-focusable views). Returns the edits
   * with the name applied, for a handler that changes them further.
   */
  const finishNaming = (keep = true): Edits => {
    const id = namingRef.current;
    if (id === null) {
      return edits;
    }
    namingRef.current = null;
    setNaming(null);
    const splice = edits.splices.find(x => x.id === id);
    const name = nameDraft.trim();
    if (!keep || !splice || !name || name === splice.name) {
      return edits;
    }
    const renamed = renameSplice(edits, splice.id, name);
    commit(renamed);
    return renamed;
  };
  /** Clicks anywhere (but the field) close the name field first. */
  const closeNamingOnPress = {
    onStartShouldSetResponderCapture: () => {
      finishNaming();
      return false;
    },
  };
  const [snapOn, setSnapOn] = useState(snapPreference);
  const [modal, setModal] = useState<Modal>(null);
  /** Find Tracks' settings while its popover is open. */
  const [finding, setFinding] = useState<DetectOptions | null>(null);
  const proposals: Proposal[] = useMemo(
    () =>
      finding && status.state === 'ready'
        ? editorCore.detect(editorId, finding)
        : [],
    [finding, status.state, editorId],
  );
  const setFindOptions = (o: DetectOptions) => {
    detectPreference = o;
    setFinding(o);
  };
  const applyFound = () => {
    commit(applyProposals(finishNaming(), proposals));
    setFinding(null);
  };

  // ------------------------------------------------------------ view
  const [viewWidth, setViewWidth] = useState(0);
  const [msPerPoint, setMsPerPoint] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  /** Where to scroll once a new zoom is laid out ({x} so equal values still apply). */
  const [pendingScroll, setPendingScroll] = useState<{ x: number } | null>(
    null,
  );
  const scale =
    msPerPoint > 0 ? msPerPoint : fitZoom(durationMs, viewWidth || 1);
  const contentWidth = Math.max(viewWidth, durationMs / scale);
  const steps = rulerSteps(scale);
  const snapMs = useCallback(
    (ms: number) =>
      Math.min(durationMs, Math.max(0, snapOn ? snap(ms, steps.minor) : ms)),
    [snapOn, steps.minor, durationMs],
  );

  // Fit the whole recording once its length and the view's width are known.
  useEffect(() => {
    if (viewWidth > 0 && durationMs > 0 && msPerPoint === 0) {
      setMsPerPoint(fitZoom(durationMs, viewWidth));
    }
  }, [viewWidth, durationMs, msPerPoint]);

  // After a zoom, scroll to where it should leave the view (set by zoomTo).
  useEffect(() => {
    if (pendingScroll) {
      scrollRef.current?.scrollTo({ x: pendingScroll.x, animated: false });
      setScrollX(pendingScroll.x);
      setPendingScroll(null);
    }
  }, [pendingScroll, msPerPoint]);

  const zoomTo = (next: number, anchorMs?: number) => {
    const z = clampZoom(next, durationMs, viewWidth);
    const anchor =
      anchorMs ?? (loaded ? pb.positionMs : (scrollX + viewWidth / 2) * scale);
    const x = Math.min(viewWidth, Math.max(0, anchor / scale - scrollX));
    setPendingScroll({
      x: Math.min(
        zoomScroll(anchor, x, z),
        Math.max(0, durationMs / z - viewWidth),
      ),
    });
    setMsPerPoint(z);
  };
  const zoomFit = () => {
    setPendingScroll({ x: 0 });
    setMsPerPoint(fitZoom(durationMs, viewWidth));
  };
  const zoomToRange = (a: number, b: number) => {
    const z = clampZoom(
      ((b - a) * 1.1) / Math.max(1, viewWidth),
      durationMs,
      viewWidth,
    );
    setPendingScroll({ x: Math.max(0, a / z - viewWidth * 0.05) });
    setMsPerPoint(z);
  };

  // While playing, page the view to keep the playhead in sight.
  const playheadMs = loaded ? pb.positionMs : 0;
  useEffect(() => {
    if (!loaded || pb.state !== 'playing' || viewWidth === 0 || drag) {
      return;
    }
    const x = playheadMs / scale;
    if (x < scrollX || x > scrollX + viewWidth - 4) {
      const to = Math.max(
        0,
        Math.min(x - viewWidth * 0.1, contentWidth - viewWidth),
      );
      scrollRef.current?.scrollTo({ x: to, animated: false });
      setScrollX(to);
    }
  }, [
    playheadMs,
    loaded,
    pb.state,
    scale,
    scrollX,
    viewWidth,
    contentWidth,
    drag,
  ]);

  // Deleted stretches are skipped while playing.
  useEffect(() => {
    if (loaded && pb.state === 'playing') {
      const r = deletedAt(edits, pb.positionMs);
      if (r) {
        playback.seek(Math.min(r.endMs, durationMs));
      }
    }
  }, [loaded, pb.state, pb.positionMs, edits, durationMs]);

  // Clicks don't move keyboard focus to a focusable view on macOS, so the
  // editor takes it when its timeline is clicked (for Delete, Space, M…).
  const rootRef = useRef<View>(null);
  const takeKeys = () => rootRef.current?.focus();

  // ------------------------------------------------------------ transport
  const ensureLoaded = async () => {
    if (!loaded) {
      await playback.select({
        fileName: target.fileName,
        path: target.path,
        title: target.title,
        artist: null,
        album: null,
        durationMs,
        sizeBytes: 0,
        recordedAtMs: 0,
      });
    }
  };
  const playPause = async () => {
    await ensureLoaded();
    if (playback.get().state === 'playing') {
      playback.pause();
    } else {
      if (selection && !loaded) {
        playback.seek(selection.startMs);
      }
      await playback.play();
    }
  };
  const seek = async (ms: number) => {
    await ensureLoaded();
    playback.seek(Math.max(0, Math.min(ms, durationMs)));
  };

  // Stops a preview or a scrub snippet after a while.
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseAfter = (ms: number) => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
    }
    stopTimer.current = setTimeout(() => {
      stopTimer.current = null;
      playback.pause();
    }, ms);
  };
  const cancelPauseTimer = () => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
  };
  useEffect(() => cancelPauseTimer, []);

  /** P: plays a couple of seconds either side of the selected splice. */
  const previewSplice = async () => {
    const s = edits.splices.find(x => x.id === selectedSplice);
    if (!s) {
      return;
    }
    await seek(s.atMs - PREVIEW_MS);
    await playback.play();
    pauseAfter(Math.min(s.atMs, PREVIEW_MS) + PREVIEW_MS);
  };

  // Scrubbing: dragging the playhead plays short snippets from where it is.
  const scrub = useRef({
    active: false,
    wasPlaying: false,
    x0: 0,
    from: 0,
    last: 0,
  });
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  // Clicking the ruler (or the playhead's handle) moves the playhead there
  // and dragging scrubs.
  const scrubGrant = async (e: GestureResponderEvent, atMs?: number) => {
    finishNaming();
    takeKeys();
    cancelPauseTimer();
    setSelectedSplice(null);
    const from = atMs ?? (loaded ? pb.positionMs : 0);
    scrub.current = {
      active: true,
      wasPlaying: loaded && pb.state === 'playing',
      x0: e.nativeEvent.pageX,
      from,
      last: 0,
    };
    setScrubMs(from);
    await ensureLoaded();
    if (atMs !== undefined) {
      playback.seek(from);
    }
  };
  const scrubMove = async (e: GestureResponderEvent) => {
    const sc = scrub.current;
    if (!sc.active) {
      return;
    }
    const ms = snapMs(sc.from + (e.nativeEvent.pageX - sc.x0) * scale);
    setScrubMs(ms);
    const now = Date.now();
    if (now - sc.last < SCRUB_INTERVAL_MS) {
      return;
    }
    sc.last = now;
    playback.seek(ms);
    if (playback.get().state !== 'playing') {
      await playback.play();
    }
    if (!sc.wasPlaying) {
      pauseAfter(SCRUB_REST_MS);
    }
  };
  const scrubRelease = () => {
    const sc = scrub.current;
    if (!sc.active) {
      return;
    }
    sc.active = false;
    if (scrubMs !== null) {
      playback.seek(scrubMs);
    }
    setScrubMs(null);
    if (!sc.wasPlaying) {
      cancelPauseTimer();
      playback.pause();
    }
  };

  // ------------------------------------------------------------ actions
  const addSpliceAt = (ms: number, nameIt = true) => {
    const { edits: next, id } = addSplice(edits, snapMs(ms));
    commit(next);
    setSelectedSplice(id);
    setSelectedRegion(null);
    if (nameIt) {
      startNaming(id, next.splices.find(x => x.id === id)?.name ?? '');
    }
    return id;
  };
  const deleteSelected = () => {
    if (selection && selection.endMs - selection.startMs > 0) {
      commit(deleteRegion(edits, selection.startMs, selection.endMs));
      setSelection(null);
    } else if (selectedSplice !== null) {
      commit(removeSplice(edits, selectedSplice));
      setSelectedSplice(null);
    } else if (selectedRegion !== null) {
      commit(restoreRegion(edits, selectedRegion));
      setSelectedRegion(null);
    }
  };
  const restoreSelected = () => {
    if (selectedRegion !== null) {
      commit(restoreRegion(edits, selectedRegion));
      setSelectedRegion(null);
    }
  };
  const nudge = (dir: 1 | -1, big: boolean) => {
    const step = big ? 1000 : snapOn ? steps.minor : 26;
    if (selectedSplice !== null) {
      const s = edits.splices.find(x => x.id === selectedSplice);
      if (s) {
        commit(
          moveSplice(
            edits,
            s.id,
            Math.min(durationMs, Math.max(0, s.atMs + dir * step)),
          ),
        );
      }
    } else {
      seek(playheadMs + dir * step);
    }
  };
  const jump = (dir: 1 | -1) => {
    const s = adjacentSplice(edits, playheadMs, dir);
    seek(s ? s.atMs : dir > 0 ? durationMs : 0);
    if (s) {
      setSelectedSplice(s.id);
    }
  };
  const undo = () => setHist(history.undo);
  const redo = () => setHist(history.redo);
  const toggleSnap = () => {
    snapPreference = !snapOn;
    setSnapOn(!snapOn);
  };

  const save = async (keepOriginal: boolean) => {
    setModal({ kind: 'save', saving: true });
    try {
      const result = await editorCore.save(
        target.fileName,
        editsToJson(edits),
        keepOriginal,
      );
      setModal(null);
      props.onSaved(result.files, keepOriginal);
    } catch (e) {
      setModal({ kind: 'save', saving: false, error: errorText(e) });
    }
  };

  const onKeyDown = (e: {
    nativeEvent: { key: string; metaKey?: boolean; shiftKey?: boolean };
  }) => {
    if (modal || naming !== null) {
      return;
    }
    if (!/^[pP]$/.test(e.nativeEvent.key)) {
      cancelPauseTimer();
    }
    const { key, metaKey, shiftKey } = e.nativeEvent;
    if (metaKey) {
      if (key === 'z') {
        shiftKey ? redo() : undo();
      } else if (key === 's') {
        hasEdits(edits) && setModal({ kind: 'save', saving: false });
      } else if (key === '0') {
        zoomFit();
      }
      return;
    }
    switch (key) {
      case ' ':
        playPause();
        break;
      case 'm':
      case 'M':
        addSpliceAt(playheadMs);
        break;
      case 'Backspace':
      case 'Delete':
        deleteSelected();
        break;
      case 'ArrowLeft':
        nudge(-1, !!shiftKey);
        break;
      case 'ArrowRight':
        nudge(1, !!shiftKey);
        break;
      case 'Tab':
        jump(shiftKey ? -1 : 1);
        break;
      case 'p':
      case 'P':
        previewSplice();
        break;
      case '=':
      case '+':
        zoomTo(scale / 2);
        break;
      case '-':
        zoomTo(scale * 2);
        break;
      case 's':
      case 'S':
        toggleSnap();
        break;
      case 'Escape':
        setFinding(null);
        setSelection(null);
        setSelectedSplice(null);
        setSelectedRegion(null);
        break;
    }
  };

  // ------------------------------------------------------------ gestures
  const msAt = (contentX: number) => contentX * scale;

  // The ruler: press to add a splice and drag it into place.
  const rulerGrant = (e: GestureResponderEvent) =>
    scrubGrant(e, snapMs(msAt(e.nativeEvent.locationX)));
  // A flag: press to select it and drag to move it; double-click to rename.
  const lastFlagPress = useRef({ id: 0, at: 0 });
  const flagGrant =
    (id: number, atMs: number) => (e: GestureResponderEvent) => {
      const now = Date.now();
      if (
        lastFlagPress.current.id === id &&
        now - lastFlagPress.current.at < 400
      ) {
        lastFlagPress.current = { id: 0, at: 0 };
        startNaming(id, edits.splices.find(x => x.id === id)?.name ?? '');
        return;
      }
      lastFlagPress.current = { id, at: now };
      finishNaming();
      takeKeys();
      setSelectedSplice(id);
      setSelectedRegion(null);
      setSelection(null);
      setDrag({
        kind: 'splice',
        id,
        atMs,
        fromMs: atMs,
        x0: e.nativeEvent.pageX,
        isNew: false,
      });
    };
  const waveGrant = (e: GestureResponderEvent) => {
    finishNaming();
    takeKeys();
    const ms = Math.max(0, Math.min(durationMs, msAt(e.nativeEvent.locationX)));
    setDrag({ kind: 'select', anchorMs: ms, ms, x0: e.nativeEvent.pageX });
  };
  const move = (e: GestureResponderEvent) => {
    if (!drag) {
      return;
    }
    const dx = e.nativeEvent.pageX - drag.x0;
    if (drag.kind === 'splice') {
      setDrag({ ...drag, atMs: snapMs(drag.fromMs + dx * scale) });
    } else {
      setDrag({
        ...drag,
        ms: Math.max(0, Math.min(durationMs, drag.anchorMs + dx * scale)),
      });
    }
  };
  const release = (e: GestureResponderEvent) => {
    if (!drag) {
      return;
    }
    const dx = e.nativeEvent.pageX - drag.x0;
    if (drag.kind === 'splice') {
      if (drag.atMs !== drag.fromMs) {
        // A new splice was already recorded; replace that step.
        const moved = moveSplice(edits, drag.id, drag.atMs);
        setHist(h =>
          drag.isNew ? { ...h, present: moved } : history.push(h, moved),
        );
      }
      if (drag.isNew) {
        startNaming(
          drag.id,
          edits.splices.find(x => x.id === drag.id)?.name ?? '',
        );
      }
    } else if (Math.abs(dx) < CLICK_SLOP) {
      // A click: move the playhead; a click in a deleted stretch selects it.
      const ms = snapMs(drag.anchorMs);
      setSelection(null);
      setSelectedSplice(null);
      setSelectedRegion(deletedAt(edits, drag.anchorMs)?.id ?? null);
      seek(ms);
    } else {
      const a = snapMs(Math.min(drag.anchorMs, drag.ms));
      const b = snapMs(Math.max(drag.anchorMs, drag.ms));
      setSelection(b > a ? { startMs: a, endMs: b } : null);
      setSelectedSplice(null);
      setSelectedRegion(null);
    }
    setDrag(null);
  };
  const responder = (grant: (e: GestureResponderEvent) => void) => ({
    onStartShouldSetResponder: () => status.state === 'ready' && !modal,
    onResponderGrant: grant,
    onResponderMove: move,
    onResponderRelease: release,
    onResponderTerminate: release,
    onResponderTerminationRequest: () => false,
  });

  // ------------------------------------------------------------ drawing
  const firstVisible = scrollX * scale;
  const lastVisible = (scrollX + viewWidth) * scale;
  const ticks: Array<{ ms: number; major: boolean }> = [];
  if (viewWidth > 0 && scale > 0) {
    const from = Math.max(0, Math.floor(firstVisible / steps.minor) - 1);
    const to = Math.min(
      Math.ceil(durationMs / steps.minor),
      Math.ceil(lastVisible / steps.minor) + 1,
    );
    for (let i = from; i <= to && ticks.length < 2000; i++) {
      const ms = i * steps.minor;
      ticks.push({
        ms,
        major: Math.abs(ms / steps.major - Math.round(ms / steps.major)) < 1e-6,
      });
    }
  }
  // MP3 frame boundaries (where lossless cuts land), once they're 6 pt apart.
  const frameTicks: number[] = [];
  if (
    status.state === 'ready' &&
    !status.master &&
    status.frameMs &&
    status.frameMs / scale >= 6 &&
    viewWidth > 0
  ) {
    const f = status.frameMs;
    const off = status.frameOffsetMs ?? 0;
    for (
      let ms = off + Math.max(0, Math.floor((firstVisible - off) / f)) * f;
      ms <= lastVisible && frameTicks.length < 1000;
      ms += f
    ) {
      frameTicks.push(ms);
    }
  }
  const liveSelection =
    drag?.kind === 'select' &&
    Math.abs(drag.ms - drag.anchorMs) * (1 / scale) >= CLICK_SLOP
      ? {
          startMs: Math.min(drag.anchorMs, drag.ms),
          endMs: Math.max(drag.anchorMs, drag.ms),
        }
      : selection;
  const c = (k: string, fallback: string) => colors[k] ?? fallback;
  const waveColors = useMemo(() => JSON.stringify(colors), [colors]);
  const namingSplice =
    typeof naming === 'number'
      ? shown.splices.find(s => s.id === naming)
      : undefined;
  const ready = status.state === 'ready';
  const hasMaster = status.state === 'ready' && status.master;
  // With a master every track is encoded from it, so none is "re-encoded".
  const reencoded = hasMaster ? 0 : tracks.filter(tr => tr.reencode).length;

  return (
    <View ref={rootRef} style={styles.root} focusable {...macKeys(onKeyDown)}>
      {/* Toolbar */}
      <View style={styles.toolbar} {...closeNamingOnPress}>
        <Btn
          t={t}
          label={loaded && pb.state === 'playing' ? 'Pause' : 'Play'}
          onPress={playPause}
          disabled={!ready}
        />
        <Btn
          t={t}
          label="Stop"
          onPress={() => loaded && playback.stop()}
          disabled={!loaded}
        />
        <Text style={[styles.time, t.text]}>
          {formatTime(playheadMs, 100)} / {formatTime(durationMs, 1000)}
        </Text>
        <View style={styles.gap} />
        <Btn
          t={t}
          label="Find Tracks…"
          onPress={() => setFinding(finding ? null : detectPreference)}
          disabled={!ready}
        />
        <Btn
          t={t}
          label="Add Splice"
          onPress={() => addSpliceAt(playheadMs)}
          disabled={!ready}
        />
        {selectedSplice !== null && !selection ? (
          <Btn t={t} label="Delete Splice" onPress={deleteSelected} />
        ) : selectedRegion !== null && !selection ? (
          <Btn t={t} label="Restore Region" onPress={restoreSelected} />
        ) : (
          <Btn
            t={t}
            label="Delete Region"
            onPress={deleteSelected}
            disabled={!selection}
          />
        )}
        <View style={styles.gap} />
        <Btn
          t={t}
          label="Undo"
          onPress={undo}
          disabled={hist.past.length === 0}
        />
        <Btn
          t={t}
          label="Redo"
          onPress={redo}
          disabled={hist.future.length === 0}
        />
        <View style={styles.gap} />
        <Pressable
          onPress={toggleSnap}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: snapOn }}
          testID="editor-snap"
        >
          <Text style={[styles.toggle, t.text, { opacity: snapOn ? 1 : 0.5 }]}>
            {snapOn ? '☑' : '☐'} Snap {formatStep(steps.minor)}
          </Text>
        </Pressable>
        <View style={styles.gap} />
        <Btn
          t={t}
          label="−"
          onPress={() => zoomTo(scale * 2)}
          disabled={!ready}
        />
        <Btn
          t={t}
          label="+"
          onPress={() => zoomTo(scale / 2)}
          disabled={!ready || scale <= MIN_MS_PER_POINT}
        />
        <Btn t={t} label="Fit" onPress={zoomFit} disabled={!ready} />
        {selection && (
          <Btn
            t={t}
            label="Zoom to Selection"
            onPress={() => zoomToRange(selection.startMs, selection.endMs)}
          />
        )}
        <View style={styles.flex} />
        <Btn
          t={t}
          label="Save…"
          onPress={() => setModal({ kind: 'save', saving: false })}
          disabled={!ready || !hasEdits(edits)}
          accent
        />
      </View>

      {/* Overview: the whole recording, with the visible stretch */}
      {editorId > 0 && viewWidth > 0 && durationMs > 0 && (
        <Overview
          editorId={editorId}
          width={viewWidth}
          durationMs={durationMs}
          colors={waveColors}
          c={c}
          viewStartMs={firstVisible}
          viewEndMs={Math.min(durationMs, lastVisible)}
          edits={shown}
          onScrollTo={ms => {
            const x = Math.max(
              0,
              Math.min(ms / scale - viewWidth / 2, contentWidth - viewWidth),
            );
            scrollRef.current?.scrollTo({ x, animated: false });
            setScrollX(x);
          }}
        />
      )}

      {/* Ruler and waveform */}
      <View
        style={[
          styles.timeline,
          { backgroundColor: c('background', '#141210') },
        ]}
        onLayout={(e: LayoutChangeEvent) =>
          setViewWidth(e.nativeEvent.layout.width)
        }
      >
        {editorId > 0 && (
          <SSWaveformView
            style={[StyleSheet.absoluteFill, { top: RULER }]}
            editorId={editorId}
            startMs={firstVisible}
            msPerPoint={scale}
            colors={waveColors}
          />
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEventThrottle={16}
          onScroll={e => setScrollX(e.nativeEvent.contentOffset.x)}
          showsHorizontalScrollIndicator
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ width: contentWidth }}
        >
          <View style={{ width: contentWidth, flex: 1 }}>
            {/* Ruler */}
            <View
              testID="editor-ruler"
              style={[
                styles.ruler,
                { width: contentWidth, backgroundColor: c('ruler', '#221d1a') },
              ]}
              onStartShouldSetResponder={() => ready && !modal}
              onResponderGrant={rulerGrant}
              onResponderMove={scrubMove}
              onResponderRelease={scrubRelease}
              onResponderTerminate={scrubRelease}
              onResponderTerminationRequest={() => false}
            >
              {ticks.map(tick => (
                <View
                  key={tick.ms}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: tick.ms / scale,
                    bottom: 0,
                    width: StyleSheet.hairlineWidth,
                    height: tick.major ? RULER / 2 : RULER / 5,
                    backgroundColor: c('rulerText', '#f3ead0'),
                    opacity: tick.major ? 0.8 : 0.4,
                  }}
                />
              ))}
              {ticks
                .filter(tick => tick.major)
                .map(tick => (
                  <Text
                    key={`l${tick.ms}`}
                    pointerEvents="none"
                    style={[
                      styles.tickLabel,
                      {
                        left: tick.ms / scale + 3,
                        color: c('rulerText', '#f3ead0'),
                      },
                    ]}
                  >
                    {formatTime(tick.ms, steps.major)}
                  </Text>
                ))}
            </View>

            {/* Waveform overlays */}
            <View style={styles.waveArea} {...responder(waveGrant)}>
              {shown.deleted.map(r => (
                <View
                  key={r.id}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: r.startMs / scale,
                    width: Math.max(1, (r.endMs - r.startMs) / scale),
                    backgroundColor: c('deleted', '#00000099'),
                    borderColor:
                      r.id === selectedRegion
                        ? c('spliceSelected', '#fff0a0')
                        : 'transparent',
                    borderWidth: 1,
                  }}
                />
              ))}
              {liveSelection && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: liveSelection.startMs / scale,
                    width: Math.max(
                      1,
                      (liveSelection.endMs - liveSelection.startMs) / scale,
                    ),
                    backgroundColor: c('selection', '#ffffff30'),
                  }}
                />
              )}
              {frameTicks.map(ms => (
                <View
                  key={`f${ms}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    height: 6,
                    left: ms / scale,
                    width: StyleSheet.hairlineWidth,
                    backgroundColor: c('rulerText', '#f3ead0'),
                    opacity: 0.35,
                  }}
                />
              ))}
              {finding &&
                proposals.map(p => (
                  <React.Fragment key={`p${p.atMs}`}>
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: p.gapStartMs / scale,
                        width: Math.max(1, (p.gapEndMs - p.gapStartMs) / scale),
                        backgroundColor: c('selection', '#ffffff30'),
                        opacity: 0.6,
                      }}
                    />
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: p.atMs / scale,
                        width: 0,
                        borderLeftWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: c('splice', '#9fd630'),
                      }}
                    />
                  </React.Fragment>
                ))}
              {shown.splices.map(s => (
                <View
                  key={s.id}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: s.atMs / scale,
                    width: 1,
                    backgroundColor:
                      s.id === selectedSplice
                        ? c('spliceSelected', '#fff0a0')
                        : c('splice', '#9fd630'),
                  }}
                />
              ))}
              {(loaded || scrubMs !== null) && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: (scrubMs ?? playheadMs) / scale,
                    width: 1,
                    backgroundColor: c('playhead', '#ff4a3a'),
                  }}
                />
              )}
              {/* The playhead's handle: drag it to scrub */}
              <View
                testID="editor-scrub"
                accessibilityLabel="Playhead: drag to scrub"
                style={[
                  styles.scrubHandle,
                  {
                    left: (scrubMs ?? playheadMs) / scale - SCRUB_HANDLE / 2,
                    backgroundColor: c('playhead', '#ff4a3a'),
                  },
                ]}
                onStartShouldSetResponder={() => ready && !modal}
                onResponderGrant={scrubGrant}
                onResponderMove={scrubMove}
                onResponderRelease={scrubRelease}
                onResponderTerminate={scrubRelease}
                onResponderTerminationRequest={() => false}
              />
            </View>

            {/* Splice flags, on top of the ruler */}
            {shown.splices.map(s => {
              const selected = s.id === selectedSplice;
              const color = selected
                ? c('spliceSelected', '#fff0a0')
                : c('splice', '#9fd630');
              return (
                <View
                  key={s.id}
                  testID={`editor-splice-${s.id}`}
                  accessibilityLabel={`Splice ${s.name} at ${formatTime(
                    s.atMs,
                    100,
                  )}`}
                  style={[styles.flag, { left: s.atMs / scale - FLAG / 2 }]}
                  {...responder(flagGrant(s.id, s.atMs))}
                >
                  <View
                    pointerEvents="none"
                    style={[styles.flagHead, { backgroundColor: color }]}
                  />
                  <Text
                    pointerEvents="none"
                    numberOfLines={1}
                    style={[
                      styles.flagLabel,
                      { color, backgroundColor: c('ruler', '#221d1a') },
                    ]}
                  >
                    {s.name}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Naming a splice: a field over its flag */}
        {namingSplice && (
          <NameField
            key={namingSplice.id}
            t={t}
            left={Math.min(
              Math.max(0, namingSplice.atMs / scale - scrollX),
              Math.max(0, viewWidth - 200),
            )}
            value={nameDraft}
            onChange={setNameDraft}
            onDone={finishNaming}
          />
        )}

        {finding && (
          <View
            style={[styles.finder, t.panel, t.border]}
            {...closeNamingOnPress}
          >
            <View style={styles.finderRow}>
              <Text style={[styles.finderLabel, t.text]}>Preset</Text>
              <Btn
                t={t}
                label="Digital"
                onPress={() =>
                  setFindOptions({ ...finding, ...PRESETS.digital })
                }
              />
              <Btn
                t={t}
                label="Vinyl / Radio"
                onPress={() => setFindOptions({ ...finding, ...PRESETS.vinyl })}
              />
            </View>
            <Stepper
              t={t}
              label="Silence below"
              value={`${finding.thresholdDb} dB`}
              onStep={dir =>
                setFindOptions({
                  ...finding,
                  thresholdDb: stepIn(THRESHOLDS, finding.thresholdDb, dir),
                })
              }
            />
            <Stepper
              t={t}
              label="Gaps at least"
              value={formatStep(finding.minGapMs)}
              onStep={dir =>
                setFindOptions({
                  ...finding,
                  minGapMs: stepIn(GAPS, finding.minGapMs, dir),
                })
              }
            />
            <Stepper
              t={t}
              label="Tracks at least"
              value={
                finding.minTrackMs ? formatStep(finding.minTrackMs) : 'any'
              }
              onStep={dir =>
                setFindOptions({
                  ...finding,
                  minTrackMs: stepIn(MIN_TRACKS, finding.minTrackMs, dir),
                })
              }
            />
            <Pressable
              onPress={() =>
                setFindOptions({ ...finding, removeGaps: !finding.removeGaps })
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: finding.removeGaps }}
            >
              <Text style={[styles.toggle, t.text]}>
                {finding.removeGaps ? '☑' : '☐'} Remove the gaps
              </Text>
            </Pressable>
            <Text style={[styles.finderNote, t.text]}>
              {proposals.length === 0
                ? 'No gaps found with these settings.'
                : `${proposals.length + 1} tracks: ${proposals.length} new ${
                    proposals.length === 1 ? 'splice' : 'splices'
                  } (dashed).`}
            </Text>
            <View style={styles.modalButtons}>
              <Btn t={t} label="Cancel" onPress={() => setFinding(null)} />
              <Btn
                t={t}
                label="Apply"
                onPress={applyFound}
                disabled={proposals.length === 0}
                accent
              />
            </View>
          </View>
        )}

        {status.state !== 'ready' && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.center]}
          >
            <Text style={[styles.note, { color: c('rulerText', '#f3ead0') }]}>
              {status.state === 'loading'
                ? `Reading the waveform… ${Math.round(status.progress * 100)}%`
                : `Couldn't read the recording: ${status.message}`}
            </Text>
          </View>
        )}
      </View>

      {/* Tracks */}
      <View style={[styles.tracks, t.table]} {...closeNamingOnPress}>
        <View style={[styles.trackRow, t.header]}>
          <Text style={[styles.colNum, t.headerText]}>#</Text>
          <Text style={[styles.colName, t.headerText]}>
            Title and file name
          </Text>
          <Text style={[styles.colTime, t.headerText]}>Start</Text>
          <Text style={[styles.colTime, t.headerText]}>Length</Text>
        </View>
        <ScrollView>
          {tracks.map((tr, i) => {
            const splice =
              tr.startMs < 1
                ? undefined
                : shown.splices.find(s => Math.abs(s.atMs - tr.startMs) < 1);
            const nameOwner: number | 'first' | null = splice
              ? splice.id
              : tr.startMs < 1
              ? 'first'
              : null;
            return (
              <View
                key={`${i}-${tr.startMs}`}
                style={[styles.trackRow, i % 2 === 1 && t.rowAlternate]}
              >
                <Pressable
                  onPress={() =>
                    zoomToRange(tr.startMs, tr.startMs + tr.durationMs)
                  }
                >
                  <Text style={[styles.colNum, t.tableText]}>{i + 1}</Text>
                </Pressable>
                {nameOwner === null ? (
                  <Text style={[styles.colName, t.tableText]}>{tr.name}</Text>
                ) : (
                  <TrackName
                    t={t}
                    value={
                      nameOwner === 'first'
                        ? edits.firstName
                        : splice?.name ?? tr.name
                    }
                    onCommit={name => {
                      if (nameOwner === 'first') {
                        commit({ ...edits, firstName: name });
                      } else {
                        commit(renameSplice(edits, nameOwner, name));
                      }
                    }}
                  />
                )}
                <Text style={[styles.colTime, t.tableText]}>
                  {formatTime(tr.startMs, 100)}
                </Text>
                <Text style={[styles.colTime, t.tableText]}>
                  {formatTime(tr.durationMs, 100)}
                  {tr.reencode && !hasMaster ? ' ·' : ''}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
      <Text style={[styles.hint, t.text]} numberOfLines={2}>
        {reencoded > 0
          ? `· ${
              reencoded === 1 ? 'This track has' : `${reencoded} tracks have`
            } a deleted stretch inside, so saving re-encodes ${
              reencoded === 1 ? 'it' : 'them'
            }. Everything else is cut without re-encoding.`
          : (hasMaster ? 'Lossless master: every cut is exact. ' : '') +
            'Click the ruler to move the playhead (drag it to scrub), drag in the waveform to select. Add Splice (or M) splices at the playhead; click a splice to select it, Delete removes it. Space plays, P previews a splice. Unsaved edits are kept until you save.'}
      </Text>

      {modal?.kind === 'save' && (
        <SaveModal
          t={t}
          title={target.title}
          count={tracks.length}
          reencoded={reencoded}
          fromMaster={!!hasMaster}
          saving={modal.saving}
          error={modal.error}
          onCancel={() => setModal(null)}
          onChoose={save}
        />
      )}
    </View>
  );
}

// macOS-only View props (not in React Native's types): the keys the
// editor handles, without a focus ring.
function macKeys(
  onKeyDown: (e: {
    nativeEvent: { key: string; metaKey?: boolean; shiftKey?: boolean };
  }) => void,
): object {
  return { enableFocusRing: false, keyDownEvents: KEYS, onKeyDown };
}

const KEYS = [
  { key: ' ' },
  { key: 'm' },
  { key: 'M' },
  { key: 'Backspace' },
  { key: 'Delete' },
  { key: 'ArrowLeft' },
  { key: 'ArrowRight' },
  { key: 'ArrowLeft', shiftKey: true },
  { key: 'ArrowRight', shiftKey: true },
  { key: 'Tab' },
  { key: 'Tab', shiftKey: true },
  { key: 'p' },
  { key: 'P' },
  { key: '=' },
  { key: '+' },
  { key: '-' },
  { key: 's' },
  { key: 'S' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
  { key: 's', metaKey: true },
  { key: '0', metaKey: true },
];

function formatStep(ms: number): string {
  if (ms >= 60_000) {
    return `${ms / 60_000} min`;
  }
  if (ms >= 1000) {
    return `${ms / 1000} s`;
  }
  return `${ms} ms`;
}

type Styles = ReturnType<typeof usePanelStyles>;

function Stepper(props: {
  t: Styles;
  label: string;
  value: string;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <View style={styles.finderRow}>
      <Text style={[styles.finderLabel, props.t.text]}>{props.label}</Text>
      <Btn t={props.t} label="−" onPress={() => props.onStep(-1)} />
      <Text style={[styles.finderValue, props.t.text]}>{props.value}</Text>
      <Btn t={props.t} label="+" onPress={() => props.onStep(1)} />
    </View>
  );
}

/**
 * The whole recording at a glance: its waveform, splices and deleted
 * stretches, with a box around what the editor shows. Click or drag to
 * move the view.
 */
function Overview(props: {
  editorId: number;
  width: number;
  durationMs: number;
  colors: string;
  c: (k: string, fallback: string) => string;
  viewStartMs: number;
  viewEndMs: number;
  edits: Edits;
  onScrollTo: (centerMs: number) => void;
}) {
  const { width, durationMs, c } = props;
  const per = durationMs / Math.max(1, width);
  const go = (e: GestureResponderEvent) =>
    props.onScrollTo(
      Math.max(0, Math.min(durationMs, e.nativeEvent.locationX * per)),
    );
  return (
    <View
      testID="editor-overview"
      style={[
        styles.overview,
        { width, backgroundColor: c('background', '#141210') },
      ]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={go}
      onResponderMove={go}
      onResponderTerminationRequest={() => false}
    >
      {/* pointerEvents isn't supported on the native (legacy) view itself:
          setting it there crashes on macOS. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <SSWaveformView
          style={StyleSheet.absoluteFill}
          editorId={props.editorId}
          startMs={0}
          msPerPoint={per}
          colors={props.colors}
        />
      </View>
      {props.edits.deleted.map(r => (
        <View
          key={r.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: r.startMs / per,
            width: Math.max(1, (r.endMs - r.startMs) / per),
            backgroundColor: c('deleted', '#00000099'),
          }}
        />
      ))}
      {props.edits.splices.map(s => (
        <View
          key={s.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: s.atMs / per,
            width: 1,
            backgroundColor: c('splice', '#9fd630'),
          }}
        />
      ))}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: props.viewStartMs / per,
          width: Math.max(3, (props.viewEndMs - props.viewStartMs) / per),
          borderWidth: 1,
          borderColor: c('spliceSelected', '#fff0a0'),
        }}
      />
    </View>
  );
}

function Btn(props: {
  t: Styles;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.t.button,
        props.t.border,
        props.accent && { borderWidth: 1 },
        { opacity: props.disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, props.t.buttonText]}>{props.label}</Text>
    </Pressable>
  );
}

/** A track's name, edited in place (Enter or leaving saves, Esc cancels). */
function TrackName(props: {
  t: Styles;
  value: string;
  onCommit: (name: string) => void;
}) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const commit = () => {
    const name = text.trim();
    if (name && name !== props.value) {
      props.onCommit(name);
    } else {
      setText(props.value);
    }
  };
  return (
    <TextInput
      style={[styles.colName, styles.nameInput, props.t.tableText]}
      value={text}
      onChangeText={setText}
      onSubmitEditing={commit}
      onBlur={commit}
      onKeyPress={e => {
        if (e.nativeEvent.key === 'Escape') {
          setText(props.value);
        }
      }}
    />
  );
}

/** The name field over a new (or double-clicked) splice. */
function NameField(props: {
  t: Styles;
  left: number;
  value: string;
  onChange: (text: string) => void;
  /** Close it, keeping the text (or not, for Esc). */
  onDone: (keep?: boolean) => void;
}) {
  return (
    <View style={[styles.nameField, { left: props.left }]}>
      <TextInput
        testID="editor-splice-name"
        autoFocus
        selectTextOnFocus
        value={props.value}
        onChangeText={props.onChange}
        onSubmitEditing={() => props.onDone()}
        onBlur={() => props.onDone()}
        onKeyPress={e => {
          if (e.nativeEvent.key === 'Escape') {
            props.onDone(false);
          }
        }}
        style={[styles.nameInput, props.t.input, styles.nameFieldInput]}
      />
    </View>
  );
}

/** Save: the in-window question whether to keep the original. */
function SaveModal(props: {
  t: Styles;
  title: string;
  count: number;
  reencoded: number;
  fromMaster: boolean;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onChoose: (keepOriginal: boolean) => void;
}) {
  const { t } = props;
  return (
    <View style={styles.modalBackdrop} testID="editor-save-modal">
      <View style={[styles.modal, t.panel, t.border]}>
        <Text style={[styles.modalTitle, t.text]}>
          Keep the original recording?
        </Text>
        <Text style={[styles.modalBody, t.text]}>
          Saving creates{' '}
          {props.count === 1 ? '1 track' : `${props.count} tracks`} from "
          {props.title}".
          {props.reencoded > 0
            ? ` ${
                props.reencoded === 1 ? 'One is' : `${props.reencoded} are`
              } re-encoded because a stretch inside was deleted.`
            : ''}
          {props.fromMaster
            ? ' Each is encoded once from the lossless master, cut exactly.'
            : ''}
        </Text>
        {props.error && (
          <Text style={[styles.modalBody, styles.error]}>
            Couldn't save: {props.error}
          </Text>
        )}
        {props.saving ? (
          <Text style={[styles.modalBody, t.text]}>Saving…</Text>
        ) : (
          <View style={styles.modalButtons}>
            <Btn t={t} label="Cancel" onPress={props.onCancel} />
            <Btn
              t={t}
              label="No, delete it"
              onPress={() => props.onChoose(false)}
            />
            <Btn
              t={t}
              label="Yes, keep it"
              onPress={() => props.onChoose(true)}
              accent
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    paddingBottom: 6,
  },
  gap: { width: 8 },
  flex: { flex: 1 },
  time: { fontSize: 12, fontVariant: ['tabular-nums'], marginLeft: 6 },
  toggle: { fontSize: 12 },
  button: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  buttonText: { fontSize: 12 },
  timeline: { flex: 1, minHeight: 120, overflow: 'hidden', borderRadius: 2 },
  ruler: { height: RULER },
  tickLabel: {
    position: 'absolute',
    top: 1,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  waveArea: { flex: 1 },
  flag: {
    position: 'absolute',
    top: 0,
    width: FLAG,
    height: RULER,
    alignItems: 'center',
  },
  flagHead: {
    width: FLAG,
    height: 8,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  flagLabel: {
    position: 'absolute',
    left: FLAG,
    top: 9,
    fontSize: 9,
    maxWidth: 160,
    paddingHorizontal: 2,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  overview: {
    height: OVERVIEW,
    marginBottom: 4,
    overflow: 'hidden',
    borderRadius: 2,
  },
  scrubHandle: {
    position: 'absolute',
    top: 0,
    width: SCRUB_HANDLE,
    height: 10,
    borderBottomLeftRadius: SCRUB_HANDLE / 2,
    borderBottomRightRadius: SCRUB_HANDLE / 2,
  },
  finder: {
    position: 'absolute',
    right: 8,
    top: RULER + 6,
    width: 270,
    padding: 10,
    gap: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  finderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  finderLabel: { width: 96, fontSize: 12 },
  finderValue: { minWidth: 56, fontSize: 12, textAlign: 'center' },
  finderNote: { fontSize: 11, opacity: 0.8 },
  note: { fontSize: 12 },
  tracks: { height: 110, marginTop: 6, borderRadius: 2 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  colNum: { width: 28, fontSize: 11 },
  colName: { flex: 1, fontSize: 11 },
  colTime: {
    width: 72,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  nameInput: { paddingVertical: 0, paddingHorizontal: 2, fontSize: 11 },
  nameField: { position: 'absolute', top: RULER, width: 200 },
  nameFieldInput: { borderWidth: 1, fontSize: 12, paddingVertical: 2 },
  hint: { fontSize: 11, opacity: 0.7, marginTop: 4 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { width: 360, padding: 16, borderRadius: 6, borderWidth: 1, gap: 8 },
  modalTitle: { fontSize: 14, fontWeight: '600' },
  modalBody: { fontSize: 12, lineHeight: 17 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 6,
  },
  error: { color: '#ff6b5a' },
});
