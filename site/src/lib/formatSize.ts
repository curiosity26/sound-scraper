/** Bytes as a rounded size the way download pages show it ("17 MB", "2.5 MB"). */
export const formatSize = (bytes: number): string => {
  const mb = bytes / 1_000_000
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${String(Math.round(mb))} MB`
}
