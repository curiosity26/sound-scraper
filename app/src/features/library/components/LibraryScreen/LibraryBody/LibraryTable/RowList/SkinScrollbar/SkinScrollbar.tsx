// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC, useRef } from 'react'
import { type GestureResponderEvent, View } from 'react-native'

import type { ResolvedFramePanel } from '@/bridge/generated'
import { NineSlice } from '@/features/skins/components/NineSlice'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'

import { thumbGeometry } from './thumbGeometry'

export type SkinScrollbarProps = {
  readonly scrollbar: NonNullable<ResolvedFramePanel['scrollbar']>
  /** Visible height, content height and scroll offset, in points. */
  readonly viewport: number
  readonly content: number
  readonly offset: number
  readonly onScrollTo: (offset: number) => void
}

/**
 * A vertical scroll bar drawn from the skin's sprites, beside a list whose
 * own indicator is hidden. Drag the thumb, or click the track to jump.
 */
export const SkinScrollbar: FC<SkinScrollbarProps> = props => {
  const { scrollbar, viewport, content, offset } = props
  const s = useSkinScale()
  const width = scrollbar.track[2] * s
  const minThumb = scrollbar.thumb[3] * s * 0.6
  const [top, length] = thumbGeometry(
    viewport,
    viewport,
    content,
    offset,
    minThumb,
  )
  const grab = useRef(0)
  if (content <= viewport) {
    return null
  }
  const travel = viewport - length
  const scrollFor = (thumbTop: number) =>
    travel > 0
      ? (Math.min(travel, Math.max(0, thumbTop)) / travel) *
        (content - viewport)
      : 0

  const onGrant = (e: GestureResponderEvent) => {
    const y = e.nativeEvent.locationY
    if (y >= top && y <= top + length) {
      grab.current = y - top
    } else {
      grab.current = length / 2
      props.onScrollTo(scrollFor(y - grab.current))
    }
  }
  const onMove = (e: GestureResponderEvent) => {
    props.onScrollTo(scrollFor(e.nativeEvent.locationY - grab.current))
  }

  const thumbSlice = scrollbar.thumbSlice ?? [0, 0, 0, 0]
  return (
    <View
      accessible
      accessibilityRole="scrollbar"
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width,
        height: viewport,
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
    >
      <View pointerEvents="none">
        <NineSlice
          image={scrollbar.image}
          source={scrollbar.track}
          slice={[0, 0, 0, 0]}
          width={width}
          height={viewport}
        />
        <NineSlice
          image={scrollbar.image}
          source={scrollbar.thumb}
          slice={thumbSlice}
          width={scrollbar.thumb[2] * s}
          height={length}
          style={{
            position: 'absolute',
            top,
            left: (width - scrollbar.thumb[2] * s) / 2,
          }}
        />
      </View>
    </View>
  )
}
