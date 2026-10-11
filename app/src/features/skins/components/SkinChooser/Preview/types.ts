export type PreviewSource = {
  /** For skins.preview: an id, a folder, '' for Default; null for none. */
  readonly source: string | null
  readonly width: number
  /** A picture already drawn (a .sskin being installed). */
  readonly path?: string
}
