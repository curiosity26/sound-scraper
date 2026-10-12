import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { color } from '@/features/recorder/components/MainPanel/color'
import { num } from '@/features/recorder/components/MainPanel/LevelMeter/num'
import type { MeterProps } from '@/features/recorder/components/MainPanel/LevelMeter/types'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { meterScale } from '@/features/skins/meterScale'
import { scaleRect } from '@/features/skins/scaleRect'

export type SegmentedBarProps = MeterProps

/**
 * The segmented bar meter from the element's style: one row (the peak) or
 * two (left and right) of segments lit on, hot and clip.
 */
export const SegmentedBar: FC<SegmentedBarProps> = props => {
  const { element } = props
  const s = useSkinScale()
  const box = scaleRect(element.rect, s)
  const { width: w, height: h } = box
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
    rows === 2
      ? [meterScale(props.left), meterScale(props.right)]
      : [meterScale(props.peak)]
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
              key={`${String(row)}-${String(i)}`}
              style={[
                styles.segment,
                {
                  backgroundColor: fill,
                  left: vertical ? b : a,
                  top: vertical ? along - a - segSize : b,
                  width: vertical ? rowSize : segSize,
                  height: vertical ? segSize : rowSize,
                },
              ]}
            />
          )
        }),
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  segment: { position: 'absolute' },
})
