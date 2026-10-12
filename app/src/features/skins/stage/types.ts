import type { WindowName } from '@/features/skins/types'

/** A panel's frame in points from the stage's top left. */
export type Frame = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** A new frame for a panel (the Rust core's layout Placement). */
export type Placement = Frame & { readonly id: string }

/** A panel in the saved layout (ss_layout_load). */
export type SavedPanel = Placement & { readonly visible?: boolean }

/** The saved layout: the panels, and the skin scale it was saved at. */
export type SavedLayout = {
  readonly panels?: readonly SavedPanel[]
  readonly scale?: number
}

/** ss_layout_analyze's placements: off-screen panels pulled back, docked ones straightened. */
export type Analysis = {
  readonly constrain: readonly Placement[]
  readonly tidy: readonly Placement[]
}

/** A panel on the stage. */
export type StagePanel = {
  readonly id: WindowName
  readonly frame: Frame
  readonly visible: boolean
}

/** What the stage shows. */
export type StageSnapshot = {
  /** Whether the main panel has its place (the stage and its size are known). */
  readonly started: boolean
  /** The panels opened so far, main first. */
  readonly panels: readonly StagePanel[]
  /** Bottom to top. */
  readonly order: readonly WindowName[]
}
