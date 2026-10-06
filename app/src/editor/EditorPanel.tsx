// The track editor (docs/track-editor-design.md §4): a transport bar, an
// overview with zoom sliders, then the timeline (time ruler, a lane with the
// tracks as named regions, and the waveform), a track list, and Save, which
// asks in the window whether to keep the original.
//
// Positions are kept in milliseconds of the original recording. The
// waveform is drawn natively (SSWaveformView) behind a horizontal scroll
// view whose content is the whole recording at the current zoom; the
// ruler, regions, slices, selection and playhead are views in that
// content. (The model calls slices "splices".)

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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { errorText } from '../appHelpers';
import {
  addSplice,
  adjacentSplice,
  applyProposals,
  clampZoom,
  deletedAt,
  deleteRegion,
  type Edits,
  editsFromJson,
  editsToJson,
  emptyEdits,
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
} from '../editorModel';
import {
  type DetectOptions,
  editorCore,
  type Proposal,
  type TrackInfo,
  type WaveformStatus,
} from '../native/editor';
import { playback, usePlayback } from '../playback';
import { Divider, IconButton, Lcd, Slider, ToolButton } from './controls';
import {
  AutoSliceBar,
  DETECT_PRESETS,
  formatStep,
  NameField,
  OverviewBar,
  SaveModal,
  SSWaveformView,
  TrackList,
  type TrackRow,
} from './parts';
import { trackColor, useEditorTheme, withAlpha } from './theme';

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

const RULER = 22;
/** The lane of track regions under the ruler. */
const LANE = 22;
/** The grab area either side of a slice. */
const HANDLE = 10;
/** A press that moves less than this (points) is a click. */
const CLICK_SLOP = 3;
const DOUBLE_CLICK_MS = 400;
/** The vertical zoom beside the waveform. */
const VSTRIP = 26;
/** The deepest vertical zoom. */
const MAX_GAIN = 16;

// Preferences that outlive one editor.
let snapPreference = true;
let detectPreference: DetectOptions = {
  ...DETECT_PRESETS.digital,
  removeGaps: false,
};

/** Snippets played while scrubbing, and the stop after the pointer rests. */
const SCRUB_INTERVAL_MS = 60;
const SCRUB_REST_MS = 150;
/** P plays this much either side of the selected slice. */
const PREVIEW_MS = 2000;

type Drag =
  | { kind: 'slice'; id: number; atMs: number; fromMs: number; x0: number }
  | { kind: 'select'; anchorMs: number; ms: number; x0: number };

type Modal = { kind: 'save'; saving: boolean; error?: string } | null;

type Naming = number | 'first';

export function EditorPanel(props: Props): React.JSX.Element {
  const { target, colors } = props;
  const th = useEditorTheme(colors);
  const c = th.wave;
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
  const ready = status.state === 'ready';
  const hasMaster = status.state === 'ready' && status.master;

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
  // What's shown: the edits with a slice being dragged where it is now.
  const shown = useMemo(
    () =>
      drag?.kind === 'slice' ? moveSplice(edits, drag.id, drag.atMs) : edits,
    [edits, drag],
  );
  const tracks: TrackInfo[] = useMemo(
    () => (ready ? editorCore.tracks(editorId, editsToJson(shown)) : []),
    [ready, editorId, shown],
  );
  /** Each track with who names it (its slice, or the first track). */
  const rows: TrackRow[] = useMemo(
    () =>
      tracks.map(tr => {
        const slice =
          tr.startMs < 1
            ? undefined
            : shown.splices.find(s => Math.abs(s.atMs - tr.startMs) < 1);
        return {
          ...tr,
          owner: slice ? slice.id : tr.startMs < 1 ? 'first' : null,
          name: slice ? slice.name : tr.startMs < 1 ? shown.firstName : tr.name,
        };
      }),
    [tracks, shown],
  );

  const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [selection, setSelection] = useState<{
    startMs: number;
    endMs: number;
  } | null>(null);
  const clearSelections = () => {
    setSelection(null);
    setSelectedSlice(null);
    setSelectedRegion(null);
    setSelectedTrack(null);
  };

  // ------------------------------------------------------------ naming
  const [naming, setNaming] = useState<Naming | null>(null);
  /** What's typed in the name field so far. */
  const [nameDraft, setNameDraft] = useState('');
  // Updated at once, so a blur that arrives after a click has closed the
  // field doesn't apply the name twice.
  const namingRef = useRef<Naming | null>(null);
  const startNaming = (owner: Naming, name: string) => {
    namingRef.current = owner;
    setNameDraft(name);
    setNaming(owner);
  };
  /**
   * Closes the name field, keeping what was typed: on Enter, on blur, and
   * when anything else in the editor is clicked (macOS doesn't blur the
   * field for clicks on non-focusable views). Returns the edits with the
   * name applied, for a handler that changes them further.
   */
  const finishNaming = (keep = true): Edits => {
    const owner = namingRef.current;
    if (owner === null) {
      return edits;
    }
    namingRef.current = null;
    setNaming(null);
    const name = nameDraft.trim();
    if (!keep || !name) {
      return edits;
    }
    let renamed = edits;
    if (owner === 'first') {
      renamed =
        name === edits.firstName ? edits : { ...edits, firstName: name };
    } else {
      const slice = edits.splices.find(x => x.id === owner);
      renamed =
        slice && name !== slice.name ? renameSplice(edits, owner, name) : edits;
    }
    if (renamed !== edits) {
      commit(renamed);
    }
    return renamed;
  };
  const rename = (owner: Naming, name: string) =>
    commit(
      owner === 'first'
        ? { ...edits, firstName: name }
        : renameSplice(edits, owner, name),
    );
  /** Clicks anywhere (but the field) close the name field first. */
  const closeNamingOnPress = {
    onStartShouldSetResponderCapture: () => {
      finishNaming();
      return false;
    },
  };

  const [snapOn, setSnapOn] = useState(snapPreference);
  const [modal, setModal] = useState<Modal>(null);

  // ------------------------------------------------------------ auto slice
  const [autoSlice, setAutoSlice] = useState<DetectOptions | null>(null);
  const proposals: Proposal[] = useMemo(
    () => (autoSlice && ready ? editorCore.detect(editorId, autoSlice) : []),
    [autoSlice, ready, editorId],
  );
  const setAutoOptions = (o: DetectOptions) => {
    detectPreference = o;
    setAutoSlice(o);
  };
  const applyAutoSlice = () => {
    commit(applyProposals(finishNaming(), proposals));
    setAutoSlice(null);
  };

  // ------------------------------------------------------------ view
  const [viewWidth, setViewWidth] = useState(0);
  const [msPerPoint, setMsPerPoint] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [vZoom, setVZoom] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  /** Where to scroll once a new zoom is laid out ({x} so equal values still apply). */
  const [pendingScroll, setPendingScroll] = useState<{ x: number } | null>(
    null,
  );
  const fit = fitZoom(durationMs, viewWidth || 1);
  const scale = msPerPoint > 0 ? msPerPoint : fit;
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

  // After a zoom, scroll to where it should leave the view.
  useEffect(() => {
    if (pendingScroll) {
      scrollRef.current?.scrollTo({ x: pendingScroll.x, animated: false });
      setScrollX(pendingScroll.x);
      setPendingScroll(null);
    }
  }, [pendingScroll, msPerPoint]);

  const zoomTo = (next: number, anchorMs?: number) => {
    const z = clampZoom(next, durationMs, viewWidth);
    const playheadVisible =
      loaded &&
      pb.positionMs >= scrollX * scale &&
      pb.positionMs <= (scrollX + viewWidth) * scale;
    const anchor =
      anchorMs ??
      (playheadVisible ? pb.positionMs : (scrollX + viewWidth / 2) * scale);
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
  // The horizontal zoom slider: 0 = the whole recording, 1 = deepest.
  const span = Math.log(MIN_MS_PER_POINT / fit);
  const hZoom = span < 0 ? Math.log(scale / fit) / span : 0;
  const setHZoom = (t: number) => zoomTo(fit * Math.exp(span * t));
  const gain = Math.pow(MAX_GAIN, vZoom);

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

  /** P: plays a couple of seconds either side of the selected slice. */
  const previewSlice = async () => {
    const s = edits.splices.find(x => x.id === selectedSlice);
    if (!s) {
      return;
    }
    await seek(s.atMs - PREVIEW_MS);
    await playback.play();
    pauseAfter(Math.min(s.atMs, PREVIEW_MS) + PREVIEW_MS);
  };

  // The ruler: click to move the playhead; drag to scrub (short snippets
  // play from wherever the pointer is).
  const scrub = useRef({
    active: false,
    wasPlaying: false,
    x0: 0,
    from: 0,
    last: 0,
  });
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const scrubGrant = async (e: GestureResponderEvent) => {
    finishNaming();
    takeKeys();
    cancelPauseTimer();
    setSelectedSlice(null);
    const from = snapMs(e.nativeEvent.locationX * scale);
    scrub.current = {
      active: true,
      wasPlaying: loaded && pb.state === 'playing',
      x0: e.nativeEvent.pageX,
      from,
      last: 0,
    };
    setScrubMs(from);
    await ensureLoaded();
    playback.seek(from);
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
  const addSliceAtPlayhead = () => {
    const at = snapMs(playheadMs);
    // A slice at either end would make an empty track.
    if (at <= 0 || at >= durationMs) {
      return;
    }
    const { edits: next, id } = addSplice(finishNaming(), at);
    commit(next);
    clearSelections();
    setSelectedSlice(id);
    startNaming(id, next.splices.find(x => x.id === id)?.name ?? '');
  };
  const deleteSelected = () => {
    if (selection && selection.endMs - selection.startMs > 0) {
      commit(deleteRegion(edits, selection.startMs, selection.endMs));
      setSelection(null);
    } else if (selectedSlice !== null) {
      commit(removeSplice(edits, selectedSlice));
      setSelectedSlice(null);
    } else if (selectedRegion !== null) {
      commit(restoreRegion(edits, selectedRegion));
      setSelectedRegion(null);
    }
  };
  const nudge = (dir: 1 | -1, big: boolean) => {
    const step = big ? 1000 : snapOn ? steps.minor : 26;
    const s = edits.splices.find(x => x.id === selectedSlice);
    if (s) {
      commit(
        moveSplice(
          edits,
          s.id,
          Math.min(durationMs, Math.max(0, s.atMs + dir * step)),
        ),
      );
    } else {
      seek(playheadMs + dir * step);
    }
  };
  const jump = (dir: 1 | -1) => {
    const s = adjacentSplice(edits, playheadMs, dir);
    seek(s ? s.atMs : dir > 0 ? durationMs : 0);
    setSelectedSlice(s ? s.id : null);
  };
  const undo = () => setHist(history.undo);
  const redo = () => setHist(history.redo);
  const toggleSnap = () => {
    snapPreference = !snapOn;
    setSnapOn(!snapOn);
  };
  const clearAll = () => {
    finishNaming(false);
    commit(emptyEdits(target.title));
    clearSelections();
  };
  const selectTrack = (i: number) => {
    finishNaming();
    takeKeys();
    clearSelections();
    setSelectedTrack(i);
    const tr = rows[i];
    if (tr) {
      seek(tr.startMs);
    }
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
    const { key, metaKey, shiftKey } = e.nativeEvent;
    if (!/^[pP]$/.test(key)) {
      cancelPauseTimer();
    }
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
        addSliceAtPlayhead();
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
        previewSlice();
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
        setAutoSlice(null);
        clearSelections();
        break;
    }
  };

  // ------------------------------------------------------------ gestures
  const msAt = (contentX: number) => contentX * scale;

  // A slice's edge in the lane: click to select it, drag to move it.
  const sliceGrant =
    (id: number, atMs: number) => (e: GestureResponderEvent) => {
      finishNaming();
      takeKeys();
      clearSelections();
      setSelectedSlice(id);
      setDrag({
        kind: 'slice',
        id,
        atMs,
        fromMs: atMs,
        x0: e.nativeEvent.pageX,
      });
    };
  // A track's region: click to select the track, double-click to rename it.
  const lastRegionPress = useRef({ i: -1, at: 0 });
  const regionGrant = (i: number) => () => {
    const now = Date.now();
    const row = rows[i];
    if (
      lastRegionPress.current.i === i &&
      now - lastRegionPress.current.at < DOUBLE_CLICK_MS &&
      row?.owner !== null &&
      row?.owner !== undefined
    ) {
      lastRegionPress.current = { i: -1, at: 0 };
      startNaming(row.owner, row.name);
      return;
    }
    lastRegionPress.current = { i, at: now };
    selectTrack(i);
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
    if (drag.kind === 'slice') {
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
    if (drag.kind === 'slice') {
      if (drag.atMs !== drag.fromMs) {
        commit(moveSplice(edits, drag.id, drag.atMs));
      }
    } else if (Math.abs(dx) < CLICK_SLOP) {
      // A click: move the playhead; a click in a deleted stretch selects it.
      clearSelections();
      setSelectedRegion(deletedAt(edits, drag.anchorMs)?.id ?? null);
      seek(snapMs(drag.anchorMs));
    } else {
      const a = snapMs(Math.min(drag.anchorMs, drag.ms));
      const b = snapMs(Math.max(drag.anchorMs, drag.ms));
      clearSelections();
      setSelection(b > a ? { startMs: a, endMs: b } : null);
    }
    setDrag(null);
  };
  const responder = (grant: (e: GestureResponderEvent) => void) => ({
    onStartShouldSetResponder: () => ready && !modal,
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
    Math.abs(drag.ms - drag.anchorMs) / scale >= CLICK_SLOP
      ? {
          startMs: Math.min(drag.anchorMs, drag.ms),
          endMs: Math.max(drag.anchorMs, drag.ms),
        }
      : selection;
  const waveColors = useMemo(
    () => JSON.stringify({ ...colors, gain }),
    [colors, gain],
  );
  const reencoded = hasMaster ? 0 : tracks.filter(tr => tr.reencode).length;
  const trackEnds = rows.map((_, i) => rows[i + 1]?.startMs ?? durationMs);
  const namingRow =
    naming === null ? -1 : rows.findIndex(r => r.owner === naming);
  const headMs = scrubMs ?? playheadMs;
  const playing = loaded && pb.state === 'playing';

  const deleteTool = selection ? (
    <ToolButton
      th={th}
      glyph="⌫"
      label="Delete Selection"
      onPress={deleteSelected}
    />
  ) : selectedSlice !== null ? (
    <ToolButton
      th={th}
      glyph="⌫"
      label="Remove Slice"
      onPress={deleteSelected}
    />
  ) : selectedRegion !== null ? (
    <ToolButton th={th} glyph="↺" label="Restore" onPress={deleteSelected} />
  ) : (
    <ToolButton
      th={th}
      glyph="⌫"
      label="Delete"
      onPress={deleteSelected}
      disabled
    />
  );

  return (
    <View ref={rootRef} style={styles.root} focusable {...macKeys(onKeyDown)}>
      {/* Transport and tools */}
      <View style={styles.toolbar} {...closeNamingOnPress}>
        <View
          style={[
            styles.transport,
            { borderColor: th.border, backgroundColor: th.well },
          ]}
        >
          <IconButton
            th={th}
            icon="toStart"
            label="To the start"
            onPress={() => seek(0)}
            disabled={!ready}
          />
          <IconButton
            th={th}
            icon={playing ? 'pause' : 'play'}
            label={playing ? 'Pause' : 'Play'}
            onPress={playPause}
            disabled={!ready}
            active={playing}
            size={13}
          />
          <IconButton
            th={th}
            icon="stop"
            label="Stop"
            onPress={() => loaded && playback.stop()}
            disabled={!loaded}
          />
        </View>
        <Lcd
          th={th}
          main={formatTime(headMs, 100)}
          sub={
            liveSelection
              ? `SEL ${formatTime(
                  liveSelection.endMs - liveSelection.startMs,
                  100,
                )}`
              : `OF ${formatTime(durationMs, 1000)}`
          }
        />
        <Divider th={th} />
        <ToolButton
          th={th}
          glyph="✂"
          label="Slice"
          onPress={addSliceAtPlayhead}
          disabled={!ready}
          testID="editor-add-slice"
        />
        <ToolButton
          th={th}
          glyph="✶"
          label="Auto Slice"
          onPress={() => setAutoSlice(autoSlice ? null : detectPreference)}
          active={autoSlice !== null}
          disabled={!ready}
        />
        {deleteTool}
        <Divider th={th} />
        <ToolButton
          th={th}
          glyph="↶"
          label=""
          a11yLabel="Undo"
          onPress={undo}
          disabled={hist.past.length === 0}
        />
        <ToolButton
          th={th}
          glyph="↷"
          label=""
          a11yLabel="Redo"
          onPress={redo}
          disabled={hist.future.length === 0}
        />
        <Divider th={th} />
        <ToolButton
          th={th}
          icon="magnet"
          label="Snap"
          detail={formatStep(steps.minor)}
          onPress={toggleSnap}
          active={snapOn}
          testID="editor-snap"
        />
        <View style={styles.flex} />
        <ToolButton
          th={th}
          label="Clear All"
          onPress={clearAll}
          disabled={!hasEdits(edits)}
        />
        <ToolButton
          th={th}
          label="Save…"
          onPress={() => setModal({ kind: 'save', saving: false })}
          disabled={!ready || !hasEdits(edits)}
          accent
        />
      </View>

      {autoSlice && (
        <AutoSliceBar
          th={th}
          options={autoSlice}
          onChange={setAutoOptions}
          found={proposals.length}
          onApply={applyAutoSlice}
          onCancel={() => setAutoSlice(null)}
        />
      )}

      {/* Overview and zoom */}
      {editorId > 0 && viewWidth > 0 && durationMs > 0 && (
        <OverviewBar
          th={th}
          editorId={editorId}
          width={viewWidth + VSTRIP}
          durationMs={durationMs}
          colors={waveColors}
          viewStartMs={firstVisible}
          viewEndMs={Math.min(durationMs, lastVisible)}
          edits={shown}
          tracks={tracks}
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

      {/* The timeline (ruler, track lane, waveform), with the vertical zoom
          along its right edge */}
      <View style={styles.timelineRow}>
        <View
          style={[
            styles.timeline,
            {
              backgroundColor: c('background', '#141210'),
              borderColor: th.border,
            },
          ]}
          onLayout={(e: LayoutChangeEvent) => {
            setViewWidth(e.nativeEvent.layout.width);
            setViewHeight(e.nativeEvent.layout.height);
          }}
        >
          {editorId > 0 && (
            <SSWaveformView
              style={[StyleSheet.absoluteFill, { top: RULER + LANE }]}
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
              {/* Ruler: click for the playhead, drag to scrub */}
              <View
                testID="editor-ruler"
                style={[
                  styles.ruler,
                  {
                    width: contentWidth,
                    backgroundColor: c('ruler', '#221d1a'),
                  },
                ]}
                onStartShouldSetResponder={() => ready && !modal}
                onResponderGrant={scrubGrant}
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
                      opacity: tick.major ? 0.7 : 0.35,
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
                {(loaded || scrubMs !== null) && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.playheadCap,
                      {
                        left: headMs / scale - 6,
                        borderTopColor: c('playhead', '#ff4a3a'),
                      },
                    ]}
                  />
                )}
              </View>

              {/* Track lane: the tracks as named regions */}
              <View style={[styles.lane, { width: contentWidth }]}>
                {rows.map((tr, i) => {
                  const left = tr.startMs / scale;
                  const width = Math.max(
                    2,
                    (trackEnds[i] - tr.startMs) / scale,
                  );
                  const selected = selectedTrack === i;
                  const color = trackColor(i);
                  return (
                    <View
                      key={`${i}-${tr.startMs}`}
                      accessibilityLabel={`Track ${i + 1}: ${tr.name}`}
                      style={[
                        styles.region,
                        {
                          left: left + 1,
                          width: width - 2,
                          backgroundColor: withAlpha(
                            color,
                            selected ? 0xb0 : 0x70,
                          ),
                          borderColor: selected ? th.text : color,
                        },
                      ]}
                      onStartShouldSetResponder={() => ready && !modal}
                      onResponderGrant={regionGrant(i)}
                    >
                      <Text
                        numberOfLines={1}
                        pointerEvents="none"
                        style={styles.regionText}
                      >
                        <Text style={styles.regionNum}>{i + 1} </Text>
                        {tr.name}
                        {tr.reencode && !hasMaster ? '  ·' : ''}
                      </Text>
                    </View>
                  );
                })}
                {/* Slice edges: grab to move */}
                {shown.splices.map(s => {
                  const selected = s.id === selectedSlice;
                  return (
                    <View
                      key={s.id}
                      testID={`editor-slice-${s.id}`}
                      accessibilityLabel={`Slice ${s.name} at ${formatTime(
                        s.atMs,
                        100,
                      )}`}
                      style={[
                        styles.edge,
                        { left: s.atMs / scale - HANDLE / 2 },
                      ]}
                      {...responder(sliceGrant(s.id, s.atMs))}
                    >
                      <View
                        pointerEvents="none"
                        style={[
                          styles.edgeGrip,
                          {
                            backgroundColor: selected
                              ? c('spliceSelected', '#fff0a0')
                              : th.text,
                            opacity: selected ? 1 : 0.8,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>

              {/* Waveform overlays */}
              <View style={styles.waveArea} {...responder(waveGrant)}>
                {rows.map((tr, i) => (
                  <View
                    key={`t${i}-${tr.startMs}`}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: tr.startMs / scale,
                      width: (trackEnds[i] - tr.startMs) / scale,
                      backgroundColor: withAlpha(
                        trackColor(i),
                        selectedTrack === i ? 0x22 : 0x10,
                      ),
                    }}
                  />
                ))}
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
                      borderLeftWidth: 1,
                      borderRightWidth: 1,
                      borderColor: withAlpha(th.text, 0x90),
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
                {autoSlice &&
                  proposals.map(p => (
                    <React.Fragment key={`p${p.atMs}`}>
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: p.gapStartMs / scale,
                          width: Math.max(
                            1,
                            (p.gapEndMs - p.gapStartMs) / scale,
                          ),
                          backgroundColor: withAlpha(th.accent, 0x26),
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
                          borderLeftWidth: 1.5,
                          borderStyle: 'dashed',
                          borderColor: th.accent,
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
                        s.id === selectedSlice
                          ? c('spliceSelected', '#fff0a0')
                          : withAlpha(th.text, 0xb0),
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
                      left: headMs / scale,
                      width: 1,
                      backgroundColor: c('playhead', '#ff4a3a'),
                    }}
                  />
                )}
              </View>
            </View>
          </ScrollView>

          {naming !== null && namingRow >= 0 && (
            <NameField
              key={String(naming)}
              th={th}
              left={Math.min(
                Math.max(0, rows[namingRow].startMs / scale - scrollX + 2),
                Math.max(0, viewWidth - 200),
              )}
              top={RULER + 1}
              value={nameDraft}
              onChange={setNameDraft}
              onDone={finishNaming}
            />
          )}

          {status.state !== 'ready' && (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.center]}
            >
              <Text style={[styles.note, { color: c('rulerText', '#f3ead0') }]}>
                {status.state === 'loading'
                  ? `Reading the waveform… ${Math.round(
                      status.progress * 100,
                    )}%`
                  : `Couldn't read the recording: ${status.message}`}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.vstrip, { paddingTop: RULER + LANE }]}>
          <Slider
            th={th}
            vertical
            label="Vertical zoom"
            low="zoomOutV"
            high="zoomInV"
            length={viewHeight - RULER - LANE - 34}
            value={vZoom}
            onChange={setVZoom}
            disabled={!ready}
          />
        </View>
      </View>

      {/* Under the timeline: what's in view, and the horizontal zoom */}
      <View style={[styles.zoomBar, { marginRight: VSTRIP }]}>
        <Text style={[styles.range, { color: th.dim }]}>
          {formatTime(firstVisible, steps.minor)} –{' '}
          {formatTime(Math.min(durationMs, lastVisible), steps.minor)}
        </Text>
        <View style={styles.flex} />
        <ToolButton th={th} label="Fit" onPress={zoomFit} disabled={!ready} />
        <Slider
          th={th}
          label="Horizontal zoom"
          low="zoomOutH"
          high="zoomInH"
          length={140}
          value={hZoom}
          onChange={setHZoom}
          disabled={!ready}
        />
      </View>

      <View {...closeNamingOnPress}>
        <TrackList
          th={th}
          rows={rows}
          selected={selectedTrack}
          showReencode={!hasMaster}
          onSelect={i => {
            selectTrack(i);
            const tr = rows[i];
            if (tr) {
              zoomToRange(tr.startMs, trackEnds[i]);
            }
          }}
          onRename={rename}
        />
      </View>
      <Text style={[styles.hint, { color: th.dim }]} numberOfLines={2}>
        {hasMaster ? 'Lossless master: every cut is exact.  ' : ''}
        {reencoded > 0
          ? `${
              reencoded === 1 ? 'One track has' : `${reencoded} tracks have`
            } a deleted stretch inside, so saving re-encodes ${
              reencoded === 1 ? 'it' : 'them'
            }.  `
          : ''}
        Click the ruler to move the playhead, drag it to scrub · ✂ Slice (M) at
        the playhead · drag a slice’s edge to move it · double-click a track to
        rename it · Space plays, P previews a slice
      </Text>

      {modal?.kind === 'save' && (
        <SaveModal
          th={th}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 2,
    height: 30,
    marginRight: 4,
  },
  timelineRow: { flex: 1, flexDirection: 'row' },
  vstrip: { width: VSTRIP, alignItems: 'center' },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  range: { fontSize: 10, fontVariant: ['tabular-nums'] },
  timeline: {
    flex: 1,
    minHeight: 140,
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 1,
  },
  ruler: { height: RULER },
  tickLabel: {
    position: 'absolute',
    top: 2,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  playheadCap: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  lane: { height: LANE },
  region: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  regionText: { fontSize: 10, color: '#ffffff', fontWeight: '500' },
  regionNum: { fontWeight: '700', opacity: 0.8 },
  edge: {
    position: 'absolute',
    top: 0,
    width: HANDLE,
    height: LANE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeGrip: { width: 3, height: LANE - 6, borderRadius: 1.5 },
  waveArea: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12 },
  hint: { fontSize: 10, marginTop: 5 },
});
