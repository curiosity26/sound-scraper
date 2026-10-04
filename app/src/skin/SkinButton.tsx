// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { Pressable } from 'react-native';

import { SpriteCell } from './SkinImage';
import type { SkinElement } from './types';

type Props = {
  element: SkinElement;
  onPress: () => void;
  /** Latched on (recording, paused, a panel open…). */
  active?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel: string;
};

/** Picks the best sprite state for a button, falling back toward "normal". */
export function buttonState(
  states: Record<string, unknown>,
  flags: { pressed: boolean; active: boolean; disabled: boolean },
): string {
  const candidates = flags.disabled
    ? ['disabled']
    : flags.pressed && flags.active
    ? ['activePressed', 'pressed', 'active']
    : flags.pressed
    ? ['pressed']
    : flags.active
    ? ['active']
    : [];
  return candidates.find(s => s in states) ?? 'normal';
}

/**
 * A skin button: the element's sprite cell for its state (normal, pressed,
 * active, activePressed, disabled), or an invisible hot spot when the skin
 * paints the button into its background.
 */
export function SkinButton(props: Props): React.JSX.Element {
  const { element, active = false, disabled = false } = props;
  const [x, y, w, h] = element.rect;
  const sprite = element.sprite;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      onPress={props.onPress}
      disabled={disabled}
      style={{ position: 'absolute', left: x, top: y, width: w, height: h }}
    >
      {({ pressed }) => {
        if (!sprite) {
          return null;
        }
        const state = buttonState(sprite.states, { pressed, active, disabled });
        const dim = disabled && !('disabled' in sprite.states);
        return (
          <SpriteCell
            image={sprite.image}
            at={sprite.states[state]}
            size={[w, h]}
            style={dim ? { opacity: 0.5 } : undefined}
          />
        );
      }}
    </Pressable>
  );
}
