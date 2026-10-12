// The "SoundScraperStage" TurboModule (Linux only: app/linux/src/StageModule.h).
// Kept out of src/bridge, so the macOS and Windows codegen don't see it.
import {
  type CodegenTypes,
  type TurboModule,
  TurboModuleRegistry,
} from 'react-native'

/** A gesture's new frames (JSON placements), then its end. */
export type StageEvent = {
  frames?: string
  end?: boolean
}

export type Spec = TurboModule & {
  readonly onStageEvent: CodegenTypes.EventEmitter<StageEvent>
  /** The saved layout JSON (ss_layout_load), "null" if none. */
  load(): string
  save(json: string): void
  /** Where panel `id` opens (ss_layout_place): {"x", "y", "w", "h"}. */
  place(
    scene: string,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): string
  /** {"docked", "constrain", "tidy"} (ss_layout_analyze). */
  analyze(scene: string): string
  /** Placements for a double-size change by `ratio` (ss_layout_scale). */
  scale(scene: string, ratio: number): string
  /** Placements for panel `id` resized by (dw, dh), keeping docked panels attached. */
  resize(scene: string, id: string, dw: number, dh: number): string
  /** Moves or resizes panel `id` with the press in progress (onStageEvent). */
  beginGesture(
    scene: string,
    id: string,
    kind: string,
    minWidth: number,
    minHeight: number,
  ): void
  /** The window's input region: flat [x, y, w, h, …] in points. */
  setInputRegion(rects: Array<number>): void
  moveToNextMonitor(): void
}

export const stageNative = (): Spec => {
  const module = TurboModuleRegistry.get<Spec>('SoundScraperStage')
  if (!module) {
    throw new Error('The stage is only on Linux')
  }
  return module
}
