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
  requireNativeComponent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewProps,
} from 'react-native';

import { errorText } from './appHelpers';
import {
  addSplice,
  adjacentSplice,
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
  editorCore,
  type TrackInfo,
  type WaveformStatus,
} from './native/editor';
import { usePanelStyles } from './panelTheme';
import { playback, usePlayback } from './playback';

type WaveformProps = ViewProps & {
  editorId: number;
  startMs: number;
  msPerPoint: number;
  colors: string;
};

const SSWaveformView = requireNativeComponent<WaveformProps>('SSWaveformView');

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
        setSelection(null);
        setSelectedSplice(null);
        setSelectedRegion(null);
        break;
    }
  };

  // ------------------------------------------------------------ gestures
  const msAt = (contentX: number) => contentX * scale;

  // The ruler: press to add a splice and drag it into place.
  const rulerGrant = (e: GestureResponderEvent) => {
    const at = snapMs(msAt(e.nativeEvent.locationX));
    const { edits: next, id } = addSplice(finishNaming(), at);
    setHist(h => history.push(h, next));
    setSelectedSplice(id);
    setSelectedRegion(null);
    setDrag({
      kind: 'splice',
      id,
      atMs: at,
      fromMs: at,
      x0: e.nativeEvent.pageX,
      isNew: true,
    });
  };
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
  const reencoded = tracks.filter(tr => tr.reencode).length;

  return (
    <View style={styles.root} focusable {...macKeys(onKeyDown)}>
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
          label="Add Splice"
          onPress={() => addSpliceAt(playheadMs)}
          disabled={!ready}
        />
        {selectedRegion !== null && !selection ? (
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
              {...responder(rulerGrant)}
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
              {loaded && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: playheadMs / scale,
                    width: 1,
                    backgroundColor: c('playhead', '#ff4a3a'),
                  }}
                />
              )}
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
                  {tr.reencode ? ' ·' : ''}
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
          : 'Click the ruler to add a splice, drag in the waveform to select. Space plays, M splices at the playhead, Delete removes. Unsaved edits are kept until you save.'}
      </Text>

      {modal?.kind === 'save' && (
        <SaveModal
          t={t}
          title={target.title}
          count={tracks.length}
          reencoded={reencoded}
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
