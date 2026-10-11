// The timeline's view: its size, the zoom (horizontal and vertical), the
// scroll position, and what that makes visible (ruler ticks, frame
// boundaries). The waveform is drawn natively behind a horizontal scroll
// view whose content is the whole recording at the current zoom.
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native'

import {
  clampZoom,
  fitZoom,
  MIN_MS_PER_POINT,
  rulerSteps,
  zoomScroll,
} from './model'
import type { FrameGrid, RulerTick } from './types'

/** The deepest vertical zoom. */
const MAX_GAIN = 16

export type UseTimelineViewResult = {
  readonly scrollRef: RefObject<ScrollView | null>
  readonly viewWidth: number
  readonly viewHeight: number
  readonly scrollX: number
  /** The zoom, in ms per point. */
  readonly scale: number
  /** The whole recording's width at this zoom. */
  readonly contentWidth: number
  /** The ruler's label step and minor tick step, in ms. */
  readonly steps: { readonly major: number; readonly minor: number }
  /** The first and last ms in view. */
  readonly firstVisible: number
  readonly lastVisible: number
  readonly ticks: readonly RulerTick[]
  /** MP3 frame boundaries in view, once they're 6 pt apart. */
  readonly frameTicks: readonly number[]
  /** The horizontal zoom slider: 0 = the whole recording, 1 = deepest. */
  readonly hZoom: number
  readonly setHZoom: (t: number) => void
  readonly vZoom: number
  readonly setVZoom: (t: number) => void
  /** The skin's waveform colors with the vertical zoom, for the native views. */
  readonly waveColors: string
  /** Zooms, keeping the playhead (or else the middle) where it is. */
  readonly zoomTo: (msPerPoint: number) => void
  readonly zoomFit: () => void
  /** Zooms to show a stretch, with a little room either side. */
  readonly zoomToRange: (a: number, b: number) => void
  readonly scrollToX: (x: number) => void
  /** Scrolls to put a point in the middle (the overview). */
  readonly centerOn: (ms: number) => void
  readonly onLayout: (e: LayoutChangeEvent) => void
  readonly onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
}

export type UseTimelineViewOptions = {
  readonly durationMs: number
  /** Where the player is, when it has this recording. */
  readonly playheadMs: number | null
  /** The skin's waveform colors. */
  readonly colors: Record<string, string>
  readonly frames: FrameGrid | null
}

export const useTimelineView = (
  options: UseTimelineViewOptions,
): UseTimelineViewResult => {
  const { durationMs, playheadMs, colors, frames } = options
  const [viewWidth, setViewWidth] = useState(0)
  const [msPerPoint, setMsPerPoint] = useState(0)
  const [scrollX, setScrollX] = useState(0)
  const [vZoom, setVZoom] = useState(0)
  const [viewHeight, setViewHeight] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  /** Where to scroll once a new zoom is laid out ({x} so equal values still apply). */
  const [pendingScroll, setPendingScroll] = useState<{ x: number } | null>(null)
  const fit = fitZoom(durationMs, viewWidth || 1)
  const scale = msPerPoint > 0 ? msPerPoint : fit
  const contentWidth = Math.max(viewWidth, durationMs / scale)
  const steps = rulerSteps(scale)

  // Fit the whole recording once its length and the view's width are known.
  useEffect(() => {
    if (viewWidth > 0 && durationMs > 0 && msPerPoint === 0) {
      setMsPerPoint(fitZoom(durationMs, viewWidth))
    }
  }, [viewWidth, durationMs, msPerPoint])

  // After a zoom, scroll to where it should leave the view.
  useEffect(() => {
    if (pendingScroll) {
      scrollRef.current?.scrollTo({ x: pendingScroll.x, animated: false })
      setScrollX(pendingScroll.x)
      setPendingScroll(null)
    }
  }, [pendingScroll, msPerPoint])

  const zoomTo = (next: number) => {
    const z = clampZoom(next, durationMs, viewWidth)
    // The playhead if it's in view, or else the middle.
    const anchor =
      playheadMs !== null &&
      playheadMs >= scrollX * scale &&
      playheadMs <= (scrollX + viewWidth) * scale
        ? playheadMs
        : (scrollX + viewWidth / 2) * scale
    const x = Math.min(viewWidth, Math.max(0, anchor / scale - scrollX))
    setPendingScroll({
      x: Math.min(
        zoomScroll(anchor, x, z),
        Math.max(0, durationMs / z - viewWidth),
      ),
    })
    setMsPerPoint(z)
  }
  // The horizontal zoom slider: 0 = the whole recording, 1 = deepest.
  const span = Math.log(MIN_MS_PER_POINT / fit)
  const scrollToX = useCallback((x: number) => {
    scrollRef.current?.scrollTo({ x, animated: false })
    setScrollX(x)
  }, [])

  const firstVisible = scrollX * scale
  const lastVisible = (scrollX + viewWidth) * scale
  const ticks = useMemo(() => {
    const out: RulerTick[] = []
    if (viewWidth > 0 && scale > 0) {
      const from = Math.max(0, Math.floor(firstVisible / steps.minor) - 1)
      const to = Math.min(
        Math.ceil(durationMs / steps.minor),
        Math.ceil(lastVisible / steps.minor) + 1,
      )
      for (let i = from; i <= to && out.length < 2000; i++) {
        const ms = i * steps.minor
        out.push({
          ms,
          major:
            Math.abs(ms / steps.major - Math.round(ms / steps.major)) < 1e-6,
        })
      }
    }
    return out
  }, [
    viewWidth,
    scale,
    firstVisible,
    lastVisible,
    durationMs,
    steps.minor,
    steps.major,
  ])
  // MP3 frame boundaries (where lossless cuts land), once they're 6 pt apart.
  const frameTicks = useMemo(() => {
    const out: number[] = []
    if (frames && frames.frameMs / scale >= 6 && viewWidth > 0) {
      const f = frames.frameMs
      const off = frames.offsetMs
      for (
        let ms = off + Math.max(0, Math.floor((firstVisible - off) / f)) * f;
        ms <= lastVisible && out.length < 1000;
        ms += f
      ) {
        out.push(ms)
      }
    }
    return out
  }, [frames, scale, viewWidth, firstVisible, lastVisible])
  const gain = Math.pow(MAX_GAIN, vZoom)
  const waveColors = useMemo(
    () => JSON.stringify({ ...colors, gain }),
    [colors, gain],
  )

  return {
    scrollRef,
    viewWidth,
    viewHeight,
    scrollX,
    scale,
    contentWidth,
    steps,
    firstVisible,
    lastVisible,
    ticks,
    frameTicks,
    hZoom: span < 0 ? Math.log(scale / fit) / span : 0,
    setHZoom: t => {
      zoomTo(fit * Math.exp(span * t))
    },
    vZoom,
    setVZoom,
    waveColors,
    zoomTo,
    zoomFit: () => {
      setPendingScroll({ x: 0 })
      setMsPerPoint(fitZoom(durationMs, viewWidth))
    },
    zoomToRange: (a, b) => {
      const z = clampZoom(
        ((b - a) * 1.1) / Math.max(1, viewWidth),
        durationMs,
        viewWidth,
      )
      setPendingScroll({ x: Math.max(0, a / z - viewWidth * 0.05) })
      setMsPerPoint(z)
    },
    scrollToX,
    centerOn: ms => {
      scrollToX(
        Math.max(
          0,
          Math.min(ms / scale - viewWidth / 2, contentWidth - viewWidth),
        ),
      )
    },
    onLayout: e => {
      setViewWidth(e.nativeEvent.layout.width)
      setViewHeight(e.nativeEvent.layout.height)
    },
    onScroll: e => {
      setScrollX(e.nativeEvent.contentOffset.x)
    },
  }
}
