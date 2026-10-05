import { useCallback, useEffect, useState } from 'react';

import {
  errorText,
  rememberedPid,
  rememberSource,
  safeList,
  safeRecover,
  safeState,
} from './appHelpers';
import {
  type AudioApp,
  recorder,
  type RecorderState,
} from './native/SoundScraper';
import { selection } from './selection';

export type Message = { text: string; isError: boolean };

/** Linear 0..1: overall peak/RMS and each channel's peak and RMS. */
export type Levels = {
  peak: number;
  rms: number;
  left: number;
  right: number;
  rmsLeft: number;
  rmsRight: number;
};
export const SILENT: Levels = {
  peak: 0,
  rms: 0,
  left: 0,
  right: 0,
  rmsLeft: 0,
  rmsRight: 0,
};

/**
 * Recorder state and actions for the skinned main panel: the capture
 * source, record/pause/resume/stop, elapsed time, levels and the latest
 * message. Recovers interrupted recordings on first use.
 */
export function useRecorder() {
  const [apps, setApps] = useState<AudioApp[]>(() => safeList());
  const [selectedPid, setSelectedPid] = useState(() => rememberedPid(apps));
  const [state, setState] = useState<RecorderState>(() => safeState());
  const [starting, setStarting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState(SILENT);
  const [message, setMessage] = useState<Message>();

  useEffect(() => {
    const recovered = safeRecover();
    if (recovered > 0) {
      setMessage({
        text: `Recovered ${recovered} interrupted recording${
          recovered === 1 ? '' : 's'
        }`,
        isError: false,
      });
    }
    const subscription = recorder.onEvent(e => {
      switch (e.kind) {
        case 'state':
          setState(e.state as RecorderState);
          if (e.state === 'idle') {
            setLevels(SILENT);
          }
          break;
        case 'progress':
          setElapsedMs(e.elapsedMs);
          setLevels({
            peak: e.peak,
            rms: e.rms,
            left: e.peakLeft ?? e.peak,
            right: e.peakRight ?? e.peak,
            rmsLeft: e.rmsLeft ?? e.rms,
            rmsRight: e.rmsRight ?? e.rms,
          });
          break;
        case 'finished':
          setMessage({
            text: `Saved ${baseName(e.path ?? '')}`,
            isError: false,
          });
          break;
        case 'error':
          setMessage({ text: `Recording failed: ${e.message}`, isError: true });
          break;
      }
    });
    return () => subscription.remove();
  }, []);

  const refreshApps = useCallback(() => {
    const list = safeList();
    setApps(list);
    return list;
  }, []);

  const record = useCallback(async () => {
    setStarting(true);
    setMessage(undefined);
    setElapsedMs(0);
    // A new track: the one loaded for playback is unloaded by the core and
    // deselected here.
    selection.set([]);
    try {
      const app = apps.find(a => a.pid === selectedPid);
      await recorder.start(app);
      rememberSource(app);
    } catch (e) {
      setMessage({ text: `Couldn't start: ${errorText(e)}`, isError: true });
    } finally {
      setStarting(false);
    }
  }, [apps, selectedPid]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
    } catch (e) {
      setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true });
    }
  }, []);

  const sourceName =
    selectedPid === 0
      ? 'All system audio'
      : apps.find(a => a.pid === selectedPid)?.name ?? 'All system audio';

  return {
    apps,
    refreshApps,
    selectedPid,
    setSelectedPid,
    sourceName,
    state,
    starting,
    elapsedMs,
    levels,
    message,
    setMessage,
    record,
    pause: recorder.pause,
    resume: recorder.resume,
    stop,
  };
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
