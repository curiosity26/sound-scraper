// A small skin for component tests: a 200×60 main panel with a few
// elements, and plain library-style panels.
import type { ResolvedFramePanel, ResolvedSkin } from '@/bridge/generated'

import { sheet } from './sheet'
import { skinElement } from './skinElement'

const framePanel = (): ResolvedFramePanel => ({
  minSize: null,
  resizable: true,
  frame: null,
  table: {},
  scrollbar: null,
  controls: {},
  waveform: {},
  playlist: {},
  progress: {},
  title: null,
  close: null,
  menu: null,
  grip: [14, 14],
})

const reel = {
  image: sheet,
  states: {
    normal: [0, 0] satisfies [number, number],
    pressed: [20, 0] satisfies [number, number],
    recording: [40, 0] satisfies [number, number],
  },
}

/** The test skin; change what a test needs on the copy it returns. */
export const testSkin = (): ResolvedSkin => ({
  id: 'com.example.test',
  name: 'Test',
  author: null,
  version: null,
  description: null,
  dir: '/skins/x',
  builtin: false,
  revision: '',
  colors: { background: '#123456' },
  fonts: {
    lcd: {
      image: sheet,
      glyphs: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.?',
      cell: [5, 8],
      columns: 20,
    },
  },
  panels: {
    main: {
      size: [200, 60],
      background: null,
      dragRegions: [[0, 0, 200, 60]],
      elements: {
        record: skinElement([4, 30, 20, 10], { sprite: reel }),
        stop: skinElement([30, 30, 20, 10]),
        elapsed: skinElement([4, 4, 60, 8], { font: 'lcd', align: 'right' }),
        source: skinElement([4, 46, 100, 8], {
          font: 'lcd',
          style: { pad: true },
        }),
        levels: skinElement([120, 4, 60, 8], { style: { segments: 10 } }),
        visualizer: skinElement([120, 14, 60, 12], {
          style: { grid: '#111111' },
        }),
      },
      animations: [
        {
          name: 'reel',
          rect: [150, 30, 20, 10],
          sprite: reel,
          frames: ['normal', 'pressed'],
          fps: 10,
          play: 'recording',
          speed: 'constant',
        },
      ],
      shade: null,
    },
    library: framePanel(),
    settings: framePanel(),
    details: framePanel(),
    editor: framePanel(),
    burn: framePanel(),
  },
  visualizer: {
    presets: [
      { name: 'Bars', style: 'bars' },
      { name: 'Scope', style: 'scope' },
    ],
  },
  warnings: [],
})
