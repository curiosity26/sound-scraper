/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { buttonState } from '../src/skin/SkinButton';
import { layoutCells, toGlyphs } from '../src/skin/SpriteText';
import { NineSlice } from '../src/skin/NineSlice';
import { imageSource } from '../src/skin/SkinImage';
import type { ImageRef, Skin, SkinElement } from '../src/skin/types';

const mockSkins = {
  onWindowEvent: () => ({ remove: jest.fn() }),
  loadCurrentSkin: jest.fn(),
  setMainLayout: jest.fn(),
  windowAction: jest.fn(),
  setPanelVisible: jest.fn(),
  isPanelVisible: () => false,
  showMenu: jest.fn(() => Promise.resolve(-1)),
};
jest.mock('../src/native/NativeSkins', () => ({
  __esModule: true,
  default: mockSkins,
}));
const mockCore = {
  listAudioApps: () => [],
  recorderStart: jest.fn(() => Promise.resolve()),
  recorderPause: jest.fn(),
  recorderResume: jest.fn(),
  recorderStop: jest.fn(() => Promise.resolve('/tmp/x.mp3')),
  recorderState: () => 'idle',
  recoverPartialRecordings: () => 0,
  onRecorderEvent: () => ({ remove: jest.fn() }),
  getSettings: () =>
    JSON.stringify({ quality: 'cbr192', id3Version: '2.4', lastSource: null }),
  setSettings: jest.fn(() => Promise.resolve()),
};
jest.mock('../src/native/NativeSoundScraper', () => ({
  __esModule: true,
  default: mockCore,
}));

const image: ImageRef = {
  path: '/skins/x/sheet.png',
  path2x: '/skins/x/sheet@2x.png',
  width: 100,
  height: 40,
};
const el = (rect: SkinElement['rect'], extra: Partial<SkinElement> = {}) => ({
  rect,
  sprite: null,
  font: null,
  text: null,
  align: null,
  style: null,
  fallback: false,
  ...extra,
});

function testSkin(): Skin {
  const sprite = { image, states: { normal: [0, 0], pressed: [20, 0] } } as const;
  return {
    id: 'com.example.test',
    name: 'Test',
    author: null,
    version: null,
    description: null,
    dir: '/skins/x',
    builtin: false,
    colors: { background: '#123456' },
    fonts: {
      lcd: { image, glyphs: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.?', cell: [5, 8], columns: 20 },
    },
    panels: {
      main: {
        size: [200, 60],
        background: null,
        dragRegions: [[0, 0, 200, 60]],
        elements: {
          record: el([4, 30, 20, 10], { sprite: { ...sprite, states: { ...sprite.states } } }),
          stop: el([30, 30, 20, 10]),
          elapsed: el([4, 4, 60, 8], { font: 'lcd', align: 'right' }),
          source: el([4, 46, 100, 8], { font: 'lcd', style: { pad: true } }),
          levels: el([120, 4, 60, 8], { style: { segments: 10 } }),
        },
        shade: null,
      },
      library: { minSize: null, resizable: true, frame: null, table: {}, scrollbar: null, controls: {} },
      settings: { minSize: null, resizable: true, frame: null, table: {}, scrollbar: null, controls: {} },
    },
    visualizer: { presets: [] },
    warnings: [],
  };
}

test('button states fall back toward normal', () => {
  const all = { normal: 1, pressed: 1, active: 1, activePressed: 1, disabled: 1 };
  const flags = { pressed: false, active: false, disabled: false };
  expect(buttonState(all, flags)).toBe('normal');
  expect(buttonState(all, { ...flags, pressed: true, active: true })).toBe('activePressed');
  expect(buttonState({ normal: 1, pressed: 1 }, { ...flags, pressed: true, active: true })).toBe('pressed');
  expect(buttonState({ normal: 1 }, { ...flags, active: true })).toBe('normal');
  expect(buttonState({ normal: 1 }, { ...flags, disabled: true })).toBe('normal');
});

test('sprite text maps, aligns, pads and scrolls', () => {
  expect(toGlyphs('Café ♪', ' ABCDEFGHIJKLMNOPQRSTUVWXYZ?')).toEqual(['C', 'A', 'F', 'E', ' ', '?']);
  expect(layoutCells(['A', 'B'], 4, 'right', false, 0)).toEqual([' ', ' ', 'A', 'B']);
  expect(layoutCells(['A', 'B'], 4, 'left', true, 0)).toEqual(['A', 'B', ' ', ' ']);
  expect(layoutCells(['A', 'B'], 4, 'left', false, 0)).toEqual(['A', 'B']);
  expect(layoutCells(['A', 'B', 'C'], 2, 'left', false, 1)).toEqual(['B', 'C']);
});

test('images use the @2x file on Retina', () => {
  expect(imageSource(image, 2)).toMatchObject({ uri: 'file:///skins/x/sheet@2x.png', scale: 2, width: 100 });
  expect(imageSource(image, 1).uri).toBe('file:///skins/x/sheet.png');
  expect(imageSource({ ...image, path: '/a b/#1.png', path2x: null }, 2).uri).toBe('file:///a%20b/%231.png');
});

test('nine-slice draws nine pieces', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<NineSlice image={image} slice={[4, 4, 4, 4]} width={300} height={200} />);
  });
  expect(tree!.root.findAllByType(require('react-native').Image)).toHaveLength(9);
});

test('the main panel renders the skin and drives the recorder', async () => {
  const { skinStore } = require('../src/skin/skins');
  const { MainPanel } = require('../src/skin/MainPanel');
  const { SkinProvider } = require('../src/skin/SkinProvider');
  skinStore.set(testSkin());
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SkinProvider>
        <MainPanel />
      </SkinProvider>,
    );
  });
  expect(mockSkins.setMainLayout).toHaveBeenCalledWith(200, 60, [0, 0, 200, 60], expect.arrayContaining([4, 30, 20, 10]));
  expect(tree!.root.findByProps({ testID: 'elapsed' })).toBeTruthy();
  // Elements the skin lacks aren't drawn.
  expect(tree!.root.findAllByProps({ testID: 'pause' })).toHaveLength(0);
  await ReactTestRenderer.act(async () => {
    tree!.root.findByProps({ testID: 'record' }).props.onPress();
  });
  expect(mockCore.recorderStart).toHaveBeenCalledWith(0);
});
