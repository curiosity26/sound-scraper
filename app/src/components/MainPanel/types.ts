/** What a skin button shows and does (see SkinButton). */
export type ButtonSpec = {
  readonly label: string
  readonly onPress: () => void
  /** Latched on (a panel open…). */
  readonly active?: boolean
  readonly disabled?: boolean
  /** A mode with its own look, e.g. "recording". */
  readonly mode?: string
}
