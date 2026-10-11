/** An unpacked skin folder (an absolute path) rather than an installed id. */
export function isFolderSkin(chosen: string | null | undefined): boolean {
  return chosen != null && /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(chosen)
}
