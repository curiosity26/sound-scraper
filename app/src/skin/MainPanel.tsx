// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatElapsed } from '../RecordBar';
import type { RecorderState } from '../native/SoundScraper';
import { type Message, useRecorder } from '../useRecorder';
import { LevelMeter, VisualizerPlaceholder } from './LevelMeter';
import { SkinButton } from './SkinButton';
import { SkinImage, SpriteCell } from './SkinImage';
import { useSkin } from './SkinProvider';
import { windows } from './skins';
import { ElementText } from './SpriteText';
import type { ElementName, SkinElement } from './types';

/** Elements that take clicks, so the window doesn't drag from them. */
const INTERACTIVE: ElementName[] = [
  'record',
  'pause',
  'stop',
  'source',
  'toggleLibrary',
  'toggleSettings',
  'minimize',
  'shade',
  'close',
];

export function statusText(state: RecorderState, starting: boolean): string {
  if (starting) {
    return 'Starting';
  }
  switch (state) {
    case 'recording':
      return '● Rec';
    case 'paused':
      return '⏸ Paused';
    case 'finalizing':
      return 'Saving';
    default:
      return 'Ready';
  }
}

/** The skinned main window: transport, time, status, levels and source. */
export function MainPanel(): React.JSX.Element {
  const skin = useSkin();
  const r = useRecorder();
  const [shaded, setShaded] = useState(false);
  const [panels, setPanels] = useState(() => ({
    library: windows.isPanelVisible('library'),
    settings: windows.isPanelVisible('settings'),
  }));
  const [shownMessage, setShownMessage] = useState<Message>();

  const shade = skin.panels.main.shade;
  const layout = shaded && shade ? shade : skin.panels.main;
  const els = layout.elements;

  useEffect(() => {
    const subscription = windows.onEvent(e => {
      if (e.window === 'main' && e.event === 'toggleShade') {
        setShaded(s => !s);
      } else if (e.window === 'library' || e.window === 'settings') {
        setPanels(p => ({ ...p, [e.window]: e.event === 'shown' }));
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const holes = INTERACTIVE.flatMap(name => {
      const el = layout.elements[name];
      return el ? [el.rect] : [];
    });
    windows.setMainLayout(layout.size, layout.dragRegions, holes);
  }, [layout]);

  // Messages show in the source display for a while.
  useEffect(() => {
    if (!r.message) {
      return;
    }
    setShownMessage(r.message);
    const timer = setTimeout(
      () => setShownMessage(undefined),
      r.message.isError ? 12000 : 6000,
    );
    return () => clearTimeout(timer);
  }, [r.message]);

  const active = r.state === 'recording' || r.state === 'paused';
  const busy = r.starting || r.state === 'finalizing';

  const { refreshApps, setSelectedPid, selectedPid, setMessage } = r;
  const chooseSource = useCallback(async () => {
    setShownMessage(undefined);
    const el = layout.elements.source;
    if (!el) {
      return;
    }
    if (active || busy) {
      setMessage({ text: 'Stop recording to change the source', isError: false });
      return;
    }
    const apps = refreshApps();
    const items = [
      'All system audio',
      '-',
      ...apps.map(a => `${a.isPlaying ? '♪ ' : ''}${a.name}`),
    ];
    const index = apps.findIndex(a => a.pid === selectedPid);
    const checked = selectedPid === 0 || index < 0 ? 0 : index + 2;
    const [x, y, , h] = el.rect;
    const chosen = await windows.showMenu(items, checked, x, y + h + 2);
    if (chosen === 0) {
      setSelectedPid(0);
    } else if (chosen >= 2) {
      setSelectedPid(apps[chosen - 2].pid);
    }
  }, [layout, active, busy, refreshApps, setSelectedPid, selectedPid, setMessage]);

  const close = useCallback(async () => {
    if (active) {
      await r.stop();
    }
    windows.quit();
  }, [active, r]);

  // Record starts, resumes when paused, and stays latched while recording.
  const onRecord = () => {
    if (r.state === 'idle') {
      r.record();
    } else if (r.state === 'paused') {
      r.resume();
    }
  };

  const togglePanel = (panel: 'library' | 'settings') => {
    windows.setPanelVisible(panel, !panels[panel]);
  };

  const button = (
    name: ElementName,
    label: string,
    onPress: () => void,
    flags: { active?: boolean; disabled?: boolean } = {},
  ) => {
    const el = els[name];
    return el ? (
      <SkinButton
        key={name}
        testID={name}
        element={el}
        accessibilityLabel={label}
        onPress={onPress}
        active={flags.active}
        disabled={flags.disabled}
      />
    ) : null;
  };

  const [width, height] = layout.size;
  const status = statusText(r.state, r.starting);
  const sourceText = shownMessage?.text ?? r.sourceName;

  return (
    <View
      testID={shaded ? 'shade-panel' : 'main-panel'}
      style={{
        width,
        height,
        backgroundColor: layout.background
          ? undefined
          : skin.colors.background ?? '#333333',
      }}
    >
      {layout.background && (
        <SkinImage
          image={layout.background}
          style={{ position: 'absolute', left: 0, top: 0 }}
        />
      )}
      {els.visualizer && <VisualizerPlaceholder element={els.visualizer} />}
      {els.levels && (
        <LevelMeter element={els.levels} peak={r.levels.peak} rms={r.levels.rms} />
      )}
      {els.elapsed && (
        <ElementText
          testID="elapsed"
          element={els.elapsed}
          fonts={skin.fonts}
          text={formatElapsed(r.elapsedMs)}
        />
      )}
      {els.status && (
        <StatusElement
          element={els.status}
          fonts={skin.fonts}
          state={r.starting ? 'recording' : r.state}
          text={status}
        />
      )}
      {els.source && (
        <Pressable
          testID="source"
          accessibilityRole="button"
          accessibilityLabel={`Source: ${r.sourceName}`}
          onPress={chooseSource}
          style={rectStyle(els.source)}
        >
          {els.source.sprite && (
            <SpriteCell
              image={els.source.sprite.image}
              at={
                els.source.sprite.states.normal ??
                Object.values(els.source.sprite.states)[0]
              }
              size={[els.source.rect[2], els.source.rect[3]]}
            />
          )}
        </Pressable>
      )}
      {els.source && (
        <ElementText element={els.source} fonts={skin.fonts} text={sourceText} />
      )}
      {button('record', 'Record', onRecord, { active, disabled: busy })}
      {button('pause', r.state === 'paused' ? 'Resume' : 'Pause',
        r.state === 'paused' ? r.resume : r.pause, {
          active: r.state === 'paused',
          disabled: !active,
        })}
      {button('stop', 'Stop', r.stop, { disabled: !active })}
      {button('toggleLibrary', 'Library', () => togglePanel('library'), {
        active: panels.library,
      })}
      {button('toggleSettings', 'Settings', () => togglePanel('settings'), {
        active: panels.settings,
      })}
      {button('minimize', 'Minimize', windows.minimize)}
      {button('shade', shaded ? 'Expand' : 'Collapse', () => setShaded(s => !s), {
        active: shaded,
      })}
      {button('close', 'Quit', close)}
    </View>
  );
}

function rectStyle(el: SkinElement) {
  const [x, y, w, h] = el.rect;
  return { position: 'absolute' as const, left: x, top: y, width: w, height: h };
}

/** The status sprite for the state when the skin has one, else its text. */
function StatusElement(props: {
  element: SkinElement;
  fonts: Parameters<typeof ElementText>[0]['fonts'];
  state: RecorderState;
  text: string;
}) {
  const { element } = props;
  const sprite = element.sprite;
  if (sprite) {
    const at = sprite.states[props.state] ?? sprite.states.idle;
    return (
      <View testID="status" accessible accessibilityLabel={props.text} style={rectStyle(element)}>
        <SpriteCell image={sprite.image} at={at} size={[element.rect[2], element.rect[3]]} />
      </View>
    );
  }
  return (
    <ElementText testID="status" element={element} fonts={props.fonts} text={props.text} />
  );
}
