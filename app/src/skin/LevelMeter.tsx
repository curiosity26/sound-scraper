// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

import { scaleRect, SpriteCell, useSkinScale } from './SkinImage'
import type { SkinElement } from './types'

/** Maps a linear level to 0..1 over a 60 dB range. */
export function meterScale(level: number): number {
  if (level <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, (20 * Math.log10(level) + 60) / 60))
}

type Props = {
  element: SkinElement
  /** Linear 0..1: the louder channel's peak, and each channel's. */
  peak: number
  left: number
  right: number
  /** Each channel's RMS (needle meters), when known. */
  rmsLeft?: number
  rmsRight?: number
}

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' ? v : fallback

/**
 * The level meter. With a sprite, its "on" cell is revealed over the "off"
 * cell up to the level. Otherwise it draws segments from the style: rows
 * (1 = peak; 2 = left and right), segments, gap, vertical, and the on, hot
 * (top 30%), clip (top 10%) and off colors. Style kind "needle" draws
 * analog meters instead (NeedleMeter).
 */
export function LevelMeter(props: Props): React.JSX.Element {
  return props.element.style?.kind === 'needle' ? (
    <NeedleMeter {...props} />
  ) : (
    <BarMeter {...props} />
  )
}

function BarMeter(props: Props): React.JSX.Element {
  const { element } = props
  const s = useSkinScale()
  const box = scaleRect(element.rect, s)
  const { width: w, height: h } = box
  const peak = meterScale(props.peak)
  const sprite = element.sprite
  if (sprite) {
    const vertical = h > w
    const reveal = vertical ? Math.round(h * peak) : Math.round(w * peak)
    const cell = (state: string) => sprite.states[state]
    return (
      <View
        testID="levels"
        pointerEvents="none"
        style={[box, { overflow: 'hidden' }]}
      >
        <Cell element={element} at={cell('off')} />
        <View
          style={{
            position: 'absolute',
            overflow: 'hidden',
            left: 0,
            bottom: 0,
            width: vertical ? w : reveal,
            height: vertical ? reveal : h,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: w,
              height: h,
            }}
          >
            <Cell element={element} at={cell('on')} />
          </View>
        </View>
      </View>
    )
  }
  const st = element.style ?? {}
  const rows = Math.min(2, Math.max(1, num(st.rows, 1)))
  const segments = Math.max(1, num(st.segments, 20))
  const gap = Math.max(0, num(st.gap, 1)) * s
  const vertical = st.vertical === true
  const on = color(st.on, '#9fd630')
  const hot = color(st.hot, on)
  const clip = color(st.clip, hot)
  const off = color(st.off, '#00000033')
  const levels =
    rows === 2 ? [meterScale(props.left), meterScale(props.right)] : [peak]
  const across = vertical ? w : h
  const along = vertical ? h : w
  const rowSize = (across - gap * (rows - 1)) / rows
  const segSize = (along - gap * (segments - 1)) / segments
  return (
    <View testID="levels" pointerEvents="none" style={box}>
      {levels.map((level, row) =>
        Array.from({ length: segments }, (_, i) => {
          const lit = i < Math.round(level * segments)
          const fill = !lit
            ? off
            : i >= segments * 0.9
            ? clip
            : i >= segments * 0.7
            ? hot
            : on
          const a = i * (segSize + gap)
          const b = row * (rowSize + gap)
          return (
            <View
              key={`${row}-${i}`}
              style={{
                position: 'absolute',
                backgroundColor: fill,
                left: vertical ? b : a,
                top: vertical ? along - a - segSize : b,
                width: vertical ? rowSize : segSize,
                height: vertical ? segSize : rowSize,
              }}
            />
          )
        }),
      )}
    </View>
  )
}

/**
 * Where a needle points for a linear level, in degrees from straight up:
 * the level in dBFS, less `reference` (the dBFS that reads 0 VU), placed
 * on the `range` of VU across `sweep` degrees.
 */
export function needleAngle(
  level: number,
  style: { sweep: number; range: [number, number]; reference: number },
): number {
  const [lo, hi] = style.range
  const vu = level > 0 ? 20 * Math.log10(level) - style.reference : -1000
  const t = Math.min(1, Math.max(0, (vu - lo) / (hi - lo)))
  return -style.sweep / 2 + t * style.sweep
}

const pair = (v: unknown, fallback: [number, number]): [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number')
    ? [v[0], v[1]]
    : fallback

function needleStyle(st: Record<string, unknown>) {
  return {
    faces: Math.min(2, Math.max(1, num(st.faces, 2))),
    gap: Math.max(0, num(st.gap, 4)),
    pivot: st.pivot,
    length: st.length,
    sweep: num(st.sweep, 90),
    range: pair(st.range, [-20, 3]),
    reference: num(st.reference, -18),
    needle: color(st.needle, '#1a120a'),
    tip: color(st.tip, color(st.needle, '#1a120a')),
    width: Math.max(0.5, num(st.width, 1)),
    peak: st.source === 'peak',
  }
}

/**
 * Analog needle meters (style kind "needle"): one face, or two (left and
 * right) side by side `gap` apart, each a window onto a needle pivoting at
 * `pivot` ([x, y] in points from the face's top left, usually below it)
 * that's `length` long. The scale is the skin's artwork; `sweep`, `range`
 * and `reference` must match it (see needleAngle). Needles follow RMS like
 * a VU meter (`source: "peak"` for peaks), eased between level updates.
 */
function NeedleMeter(props: Props) {
  const { element } = props
  const s = useSkinScale()
  const box = scaleRect(element.rect, s)
  const st = needleStyle(element.style ?? {})
  const faceW = (element.rect[2] - st.gap * (st.faces - 1)) / st.faces
  const faceH = element.rect[3]
  const pivot = pair(st.pivot, [faceW / 2, faceH * 1.3])
  const length = num(st.length, pivot[1] * 0.9)
  const levels =
    st.faces === 2
      ? st.peak
        ? [props.left, props.right]
        : [props.rmsLeft ?? props.left, props.rmsRight ?? props.right]
      : [
          st.peak
            ? props.peak
            : Math.max(props.rmsLeft ?? 0, props.rmsRight ?? 0) || props.peak,
        ]
  return (
    <View testID="levels" pointerEvents="none" style={box}>
      {levels.map((level, i) => (
        <Needle
          key={i}
          angle={needleAngle(level, st)}
          left={i * (faceW + st.gap) * s}
          face={[faceW * s, faceH * s]}
          pivot={[pivot[0] * s, pivot[1] * s]}
          length={length * s}
          width={st.width * s}
          color={st.needle}
          tip={st.tip}
        />
      ))}
    </View>
  )
}

function Needle(props: {
  angle: number
  left: number
  face: [number, number]
  pivot: [number, number]
  length: number
  width: number
  color: string
  tip: string
}) {
  const angle = useRef(new Animated.Value(props.angle)).current
  const target = useRef(props.angle)
  useEffect(() => {
    // Levels arrive about 10 times a second; ease between them, quicker
    // up than down like a meter's ballistics.
    const rising = props.angle > target.current
    target.current = props.angle
    Animated.timing(angle, {
      toValue: props.angle,
      duration: rising ? 120 : 240,
      easing: Easing.out(Easing.quad),
      // The JS driver: native-driven transforms don't update on macOS
      // (the needles sat still).
      useNativeDriver: false,
    }).start()
  }, [angle, props.angle])
  const { length, width } = props
  const rotate = angle.interpolate({
    inputRange: [-180, 180],
    outputRange: ['-180deg', '180deg'],
  })
  return (
    <View
      style={{
        position: 'absolute',
        left: props.left,
        top: 0,
        width: props.face[0],
        height: props.face[1],
        overflow: 'hidden',
      }}
    >
      {/* Twice the needle's length, centered on the pivot, so it turns
          about the pivot; only the top half is drawn. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: props.pivot[0] - width / 2,
          top: props.pivot[1] - length,
          width,
          height: length * 2,
          transform: [{ rotate }],
        }}
      >
        <View style={{ height: length * 0.2, backgroundColor: props.tip }} />
        <View style={{ height: length * 0.8, backgroundColor: props.color }} />
      </Animated.View>
    </View>
  )
}

function Cell(props: { element: SkinElement; at: [number, number] }) {
  const { element } = props
  return (
    <SpriteCell
      image={element.sprite!.image}
      at={props.at}
      size={[element.rect[2], element.rect[3]]}
    />
  )
}

/**
 * Where the visualizer will draw (phase 2: a native view fed by the Rust
 * analyzer). For now: the style's grid and a flat line.
 */
export function VisualizerPlaceholder(props: { element: SkinElement }) {
  const s = useSkinScale()
  const box = scaleRect(props.element.rect, s)
  const { width: w, height: h } = box
  const st = props.element.style ?? {}
  const grid = color(st.grid, '#ffffff1a')
  const line = color(st.line, '#9fd630')
  return (
    <View testID="visualizer" pointerEvents="none" style={box}>
      {Array.from({ length: Math.floor(w / (8 * s)) + 1 }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * 8 * s,
            top: 0,
            width: s,
            height: h,
            backgroundColor: grid,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: Math.floor(h / 2),
          width: w,
          height: s,
          backgroundColor: line,
        }}
      />
    </View>
  )
}
