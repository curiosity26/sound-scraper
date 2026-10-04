// Small helpers shared by the plain UI (App.tsx) and the skinned windows.
import {
  type AudioApp,
  listAudioApps,
  recorder,
  type RecorderState,
  settings,
} from './native/SoundScraper';

export function safeSettings() {
  try {
    return settings.get();
  } catch {
    return undefined;
  }
}

/** The PID of the remembered app if it's running, else 0 (system audio). */
export function rememberedPid(apps: AudioApp[]): number {
  const last = safeSettings()?.lastSource;
  if (last?.kind !== 'app') {
    return 0;
  }
  const match = apps.find(
    a => (last.id && a.bundleId === last.id) || a.name === last.name,
  );
  return match?.pid ?? 0;
}

export function rememberSource(app: AudioApp | undefined) {
  const current = safeSettings();
  if (!current) {
    return;
  }
  const lastSource = app
    ? { kind: 'app' as const, id: app.bundleId, name: app.name }
    : { kind: 'system' as const };
  settings.set({ ...current, lastSource }).catch(() => {});
}

export function errorText(e: unknown): string {
  // Native rejections arrive as Error on macOS but as plain
  // {code, message} objects on Windows.
  if (e instanceof Error) {
    return e.message;
  }
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

export function safeList(): AudioApp[] {
  try {
    return listAudioApps();
  } catch {
    return [];
  }
}

export function safeState(): RecorderState {
  try {
    return recorder.state();
  } catch {
    return 'idle';
  }
}

export function safeRecover(): number {
  try {
    return recorder.recoverPartials();
  } catch {
    return 0;
  }
}
