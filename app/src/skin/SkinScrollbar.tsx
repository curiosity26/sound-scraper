// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useRef } from 'react';
import { type GestureResponderEvent, View } from 'react-native';

import { NineSlice } from './NineSlice';
import { useSkinScale } from './SkinImage';
import type { FramePanel } from './types';

type Props = {
  scrollbar: NonNullable<FramePanel['scrollbar']>;
  /** Visible height, content height and scroll offset, in points. */
  viewport: number;
  content: number;
  offset: number;
  onScrollTo: (offset: number) => void;
};

/** Where the thumb goes: [top, length] in a track `track` points long. */
export function thumbGeometry(
  track: number,
  viewport: number,
  content: number,
  offset: number,
  minLength: number,
): [number, number] {
  if (content <= viewport || track <= 0) {
    return [0, track];
  }
  const length = Math.max(minLength, (track * viewport) / content);
  const travel = track - length;
  const ratio = Math.min(1, Math.max(0, offset / (content - viewport)));
  return [travel * ratio, length];
}

/**
 * A vertical scroll bar drawn from the skin's sprites, beside a list whose
 * own indicator is hidden. Drag the thumb, or click the track to jump.
 */
export function SkinScrollbar(props: Props): React.JSX.Element | null {
  const { scrollbar, viewport, content, offset } = props;
  const s = useSkinScale();
  const width = scrollbar.track[2] * s;
  const minThumb = scrollbar.thumb[3] * s * 0.6;
  const [top, length] = thumbGeometry(
    viewport,
    viewport,
    content,
    offset,
    minThumb,
  );
  const grab = useRef(0);
  if (content <= viewport) {
    return null;
  }
  const travel = viewport - length;
  const scrollFor = (thumbTop: number) =>
    travel > 0
      ? (Math.min(travel, Math.max(0, thumbTop)) / travel) *
        (content - viewport)
      : 0;

  const onGrant = (e: GestureResponderEvent) => {
    const y = e.nativeEvent.locationY;
    if (y >= top && y <= top + length) {
      grab.current = y - top;
    } else {
      grab.current = length / 2;
      props.onScrollTo(scrollFor(y - grab.current));
    }
  };
  const onMove = (e: GestureResponderEvent) =>
    props.onScrollTo(scrollFor(e.nativeEvent.locationY - grab.current));

  const thumbSlice = scrollbar.thumbSlice ?? [0, 0, 0, 0];
  return (
    <View
      testID="skin-scrollbar"
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
  );
}
