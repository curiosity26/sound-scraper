/**
 * For the editor's playback calls that nothing waits for. Loading and
 * playing already show their failures through playback.onError, so this
 * only sees the native player throwing past that: nothing the editor can
 * do about it, so it goes to the dev console.
 */
export const warnPlaybackFailed = (message: string): void => {
  console.warn(`Editor playback failed: ${message}`)
}
