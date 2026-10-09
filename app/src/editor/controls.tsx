// Small controls for the track editor, drawn with plain views so they take
// the skin's colors: icons, icon and tool buttons, a segmented control, a
// stepper, a slider and the LCD time readout.

/* eslint-disable react-native/no-inline-styles */
import React, { useRef, useState } from 'react'
import {
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { EditorTheme } from './theme'

export type IconName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'toStart'
  | 'magnet'
  | 'zoomOutH'
  | 'zoomInH'
  | 'zoomOutV'
  | 'zoomInV'

/** Simple shapes, sized `size` points, in `color`. */
export function Icon(props: {
  name: IconName
  color: string
  size?: number
}): React.JSX.Element {
  const s = props.size ?? 12
  const c = props.color
  const tri = (dir: 'left' | 'right', h: number) => ({
    width: 0,
    height: 0,
    borderTopWidth: h / 2,
    borderBottomWidth: h / 2,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    ...(dir === 'right'
      ? { borderLeftWidth: h * 0.85, borderLeftColor: c }
      : { borderRightWidth: h * 0.85, borderRightColor: c }),
  })
  const box = {
    width: s,
    height: s,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }
  switch (props.name) {
    case 'play':
      return (
        <View style={box}>
          <View style={[tri('right', s), { marginLeft: s * 0.15 }]} />
        </View>
      )
    case 'pause':
      return (
        <View style={[box, { flexDirection: 'row', gap: s * 0.22 }]}>
          <View
            style={{ width: s * 0.28, height: s * 0.9, backgroundColor: c }}
          />
          <View
            style={{ width: s * 0.28, height: s * 0.9, backgroundColor: c }}
          />
        </View>
      )
    case 'stop':
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.78,
              height: s * 0.78,
              backgroundColor: c,
              borderRadius: 1,
            }}
          />
        </View>
      )
    case 'toStart':
      return (
        <View style={[box, { flexDirection: 'row' }]}>
          <View
            style={{ width: s * 0.16, height: s * 0.85, backgroundColor: c }}
          />
          <View style={tri('left', s * 0.85)} />
        </View>
      )
    case 'magnet':
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.8,
              height: s * 0.8,
              borderWidth: s * 0.22,
              borderTopWidth: 0,
              borderColor: c,
              borderBottomLeftRadius: s * 0.4,
              borderBottomRightRadius: s * 0.4,
            }}
          />
        </View>
      )
    case 'zoomOutH':
    case 'zoomInH':
    case 'zoomOutV':
    case 'zoomInV': {
      const big = props.name === 'zoomInH' || props.name === 'zoomInV'
      const horizontal = props.name === 'zoomOutH' || props.name === 'zoomInH'
      const long = big ? s : s * 0.45
      return (
        <View style={box}>
          <View
            style={{
              width: horizontal ? long : s * 0.45,
              height: horizontal ? s * 0.45 : long,
              borderWidth: 1.5,
              borderColor: c,
              borderRadius: 1.5,
            }}
          />
        </View>
      )
    }
  }
}

/** A square button with an icon (transport). */
export function IconButton(props: {
  th: EditorTheme
  icon: IconName
  label: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
  size?: number
}): React.JSX.Element {
  const { th } = props
  const color = props.active ? th.accent : th.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: props.disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={props.icon} color={color} size={props.size ?? 12} />
    </Pressable>
  )
}

/**
 * A tool: a glyph or icon with a label, quiet until hovered or pressed;
 * `active` shows it latched (Snap), `accent` fills it (Save).
 */
export function ToolButton(props: {
  th: EditorTheme
  label: string
  glyph?: string
  icon?: IconName
  detail?: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
  accent?: boolean
  testID?: string
  /** For glyph-only tools (empty label). */
  a11yLabel?: string
}): React.JSX.Element {
  const { th } = props
  const [hover, setHover] = useState(false)
  const fg = props.accent ? th.accentText : props.active ? th.accent : th.text
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.a11yLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled, selected: props.active }}
      disabled={props.disabled}
      onPress={props.onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        styles.tool,
        {
          backgroundColor: props.accent
            ? th.accent
            : props.active
            ? th.raised
            : hover || pressed
            ? th.raised
            : 'transparent',
          borderColor: props.active ? th.accent : 'transparent',
          opacity: props.disabled ? 0.35 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {props.icon && <Icon name={props.icon} color={fg} size={11} />}
      {props.glyph && (
        <Text style={[styles.toolGlyph, { color: fg }]}>{props.glyph}</Text>
      )}
      {props.label !== '' && (
        <Text style={[styles.toolLabel, { color: fg }]}>{props.label}</Text>
      )}
      {props.detail && (
        <Text style={[styles.toolDetail, { color: fg }]}>{props.detail}</Text>
      )}
    </Pressable>
  )
}

/** A thin vertical line between groups. */
export function Divider(props: { th: EditorTheme }): React.JSX.Element {
  return <View style={[styles.divider, { backgroundColor: props.th.border }]} />
}

/** Joined buttons, one selected. */
export function Segmented<T extends string>(props: {
  th: EditorTheme
  options: Array<{ value: T; label: string }>
  value: T | null
  onChange: (value: T) => void
}): React.JSX.Element {
  const { th } = props
  return (
    <View style={[styles.segmented, { borderColor: th.border }]}>
      {props.options.map((o, i) => {
        const on = o.value === props.value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(o.value)}
            style={[
              styles.segment,
              i > 0 && { borderLeftWidth: 1, borderLeftColor: th.border },
              on && { backgroundColor: th.accent },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: on ? th.accentText : th.text },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** A label and a value with ‹ › steppers. */
export function Stepper(props: {
  th: EditorTheme
  label: string
  value: string
  onStep: (dir: 1 | -1) => void
}): React.JSX.Element {
  const { th } = props
  const arrow = (dir: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label} ${dir > 0 ? 'up' : 'down'}`}
      onPress={() => props.onStep(dir)}
      style={({ pressed }) => [
        styles.stepArrow,
        { opacity: pressed ? 0.5 : 1 },
      ]}
    >
      <Text style={[styles.stepArrowText, { color: th.accent }]}>
        {dir > 0 ? '›' : '‹'}
      </Text>
    </Pressable>
  )
  return (
    <View style={styles.stepper}>
      <Text style={[styles.stepLabel, { color: th.dim }]}>{props.label}</Text>
      <View
        style={[
          styles.stepBox,
          { borderColor: th.border, backgroundColor: th.well },
        ]}
      >
        {arrow(-1)}
        <Text style={[styles.stepValue, { color: th.text }]}>
          {props.value}
        </Text>
        {arrow(1)}
      </View>
    </View>
  )
}

/**
 * A slider, 0..1, with an icon at each end (zoom). Horizontal by default;
 * `vertical` runs bottom (0) to top (1).
 */
export function Slider(props: {
  th: EditorTheme
  value: number
  onChange: (value: number) => void
  label: string
  low: IconName
  high: IconName
  /** The track's length in points. */
  length?: number
  vertical?: boolean
  disabled?: boolean
}): React.JSX.Element {
  const { th, vertical } = props
  const length = Math.max(20, props.length ?? 80)
  const track = useRef<View>(null)
  const origin = useRef(0)
  const measure = () =>
    track.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      origin.current = vertical ? pageY : pageX
    })
  const set = (e: GestureResponderEvent) => {
    const at = vertical ? e.nativeEvent.pageY : e.nativeEvent.pageX
    const t = (at - origin.current) / length
    props.onChange(Math.min(1, Math.max(0, vertical ? 1 - t : t)))
  }
  const v = Math.min(1, Math.max(0, props.value))
  const end = (which: 'low' | 'high') => (
    <Pressable
      accessibilityLabel={`${props.label}: ${
        which === 'low' ? 'less' : 'more'
      }`}
      onPress={() =>
        props.onChange(
          which === 'low' ? Math.max(0, v - 0.1) : Math.min(1, v + 0.1),
        )
      }
      disabled={props.disabled}
      hitSlop={4}
    >
      <Icon name={props[which]} color={th.dim} size={10} />
    </Pressable>
  )
  return (
    <View
      style={[
        vertical ? styles.sliderV : styles.slider,
        { opacity: props.disabled ? 0.35 : 1 },
      ]}
    >
      {end(vertical ? 'high' : 'low')}
      <View
        ref={track}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={props.label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
        style={
          vertical
            ? [styles.sliderTrackV, { height: length }]
            : [styles.sliderTrack, { width: length }]
        }
        onLayout={measure}
        onStartShouldSetResponder={() => !props.disabled}
        onMoveShouldSetResponder={() => !props.disabled}
        onResponderGrant={e => {
          // Re-measure: the window may have moved since layout.
          measure()
          set(e)
        }}
        onResponderMove={set}
        onResponderTerminationRequest={() => false}
      >
        <View
          style={[
            vertical ? styles.sliderRailV : styles.sliderRail,
            { backgroundColor: th.border },
          ]}
        />
        <View
          style={[
            vertical ? styles.sliderFillV : styles.sliderFill,
            vertical ? { height: v * length } : { width: v * length },
            { backgroundColor: th.accent },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            vertical ? { top: (1 - v) * length - 5 } : { left: v * length - 5 },
            { backgroundColor: th.text, borderColor: th.background },
          ]}
        />
      </View>
      {end(vertical ? 'low' : 'high')}
    </View>
  )
}

/** The position readout: a small LCD. */
export function Lcd(props: {
  th: EditorTheme
  main: string
  sub: string
}): React.JSX.Element {
  const { th } = props
  return (
    <View
      style={[styles.lcd, { backgroundColor: th.lcd, borderColor: th.border }]}
    >
      <Text style={[styles.lcdMain, { color: th.lcdText }]}>{props.main}</Text>
      <Text style={[styles.lcdSub, { color: th.lcdText }]}>{props.sub}</Text>
    </View>
  )
}

const MONO = 'Menlo'

const styles = StyleSheet.create({
  iconButton: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
  },
  toolGlyph: { fontSize: 13 },
  toolLabel: { fontSize: 12 },
  toolDetail: { fontSize: 10, opacity: 0.7, fontFamily: MONO },
  divider: { width: 1, height: 18, marginHorizontal: 4 },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  segment: { paddingHorizontal: 9, height: 22, justifyContent: 'center' },
  segmentText: { fontSize: 11 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepLabel: { fontSize: 11 },
  stepBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    height: 22,
  },
  stepArrow: { width: 18, alignItems: 'center' },
  stepArrowText: { fontSize: 15, lineHeight: 18 },
  stepValue: {
    fontSize: 11,
    minWidth: 46,
    textAlign: 'center',
    fontFamily: MONO,
  },
  slider: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sliderTrack: { height: 16, justifyContent: 'center' },
  sliderV: { alignItems: 'center', gap: 5 },
  sliderTrackV: { width: 16, alignItems: 'center' },
  sliderRailV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  sliderFillV: { position: 'absolute', bottom: 0, width: 3, borderRadius: 2 },
  sliderRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
  sliderFill: { position: 'absolute', left: 0, height: 3, borderRadius: 2 },
  sliderThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  lcd: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 112,
  },
  lcdMain: { fontSize: 15, fontFamily: MONO, letterSpacing: 0.5 },
  lcdSub: { fontSize: 9, fontFamily: MONO, opacity: 0.65, marginTop: -1 },
})
