import React, { type FC } from 'react'
import { View } from 'react-native'

import { useSkinScale } from '@/hooks/useSkinScale'
import { scaleRect } from '@/skin/scaleRect'
import { color } from '@/windows/MainApp/MainPanel/color'
import { num } from '@/windows/MainApp/MainPanel/LevelMeter/num'
import type { MeterProps } from '@/windows/MainApp/MainPanel/LevelMeter/types'

import { Needle } from './Needle'
import { needleAngle } from './needleAngle'

export type NeedleMeterProps = MeterProps

const pair = (v: unknown, fallback: [number, number]): [number, number] => {
  if (Array.isArray(v) && v.length === 2) {
    const a: unknown = v[0]
    const b: unknown = v[1]
    if (typeof a === 'number' && typeof b === 'number') {
      return [a, b]
    }
  }
  return fallback
}

const needleStyle = (st: Record<string, unknown>) => {
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
export const NeedleMeter: FC<NeedleMeterProps> = props => {
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
