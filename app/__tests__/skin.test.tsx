/**
 * @format
 */

import { act, type FC, type ReactElement } from 'react'
import { Image } from 'react-native'
import { create, type ReactTestRenderer } from 'react-test-renderer'

import { DetailsPane } from '@/components/DetailsPane'
import { thumbGeometry } from '@/components/LibraryScreen/LibraryBody/LibraryTable/RowList/SkinScrollbar/thumbGeometry'
import { visibleColumns } from '@/components/LibraryScreen/LibraryBody/LibraryTable/visibleColumns'
import { NineSlice } from '@/components/NineSlice'
import { imageSource } from '@/components/SkinImage/imageSource'
import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { layoutCells } from '@/components/SpriteText/layoutCells'
import { toGlyphs } from '@/components/SpriteText/toGlyphs'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import NativeSkins from '@/native/NativeSkins'
import NativeSoundScraper, {
  type RecorderEvent,
} from '@/native/NativeSoundScraper'
import { playback } from '@/playback/playback'
import { buttonState } from '@/skin/buttonState'
import { isFolderSkin } from '@/skin/isFolderSkin'
import { isSkinArchive } from '@/skin/isSkinArchive'
import { openSkinFiles } from '@/skin/openSkinFiles'
import { pendingInstall } from '@/skin/pendingInstall'
import { settingsTab } from '@/skin/settingsTab'
import { SkinScale } from '@/skin/SkinScale'
import { skinStore } from '@/skin/skinStore'
import type { ImageRef, Skin, SkinElement } from '@/skin/types'
import { isDarkColor } from '@/utils/isDarkColor'
import { isRecord } from '@/utils/isRecord'
import { MainPanel } from '@/windows/MainApp/MainPanel'
import { needleAngle } from '@/windows/MainApp/MainPanel/LevelMeter/NeedleMeter/needleAngle'
import { animationPlays } from '@/windows/MainApp/MainPanel/SkinAnimation/animationPlays'
import { animationRate } from '@/windows/MainApp/MainPanel/SkinAnimation/animationRate'
import { seekGeometry } from '@/windows/MainApp/MainPanel/SkinSeek/seekGeometry'
import { thumbSize } from '@/windows/MainApp/MainPanel/SkinSeek/thumbSize'
import { nextPreset } from '@/windows/MainApp/MainPanel/Visualizer/nextPreset'
import { SkinProvider } from '@/windows/Skinned/SkinProvider'

// jest.mock is hoisted above the imports, so each mock is built inside its
// factory and reached through the (mocked) module below.
jest.mock('@/native/NativeSkins', () => ({
  __esModule: true,
  default: {
    onWindowEvent: () => ({ remove: jest.fn() }),
    loadCurrentSkin: jest.fn(),
    setPanelLayout: jest.fn(),
    setPanelVisible: jest.fn(),
    windowAction: jest.fn(),
    isPanelVisible: () => false,
    showMenu: jest.fn(() => Promise.resolve(-1)),
    inspectSkin: jest.fn(),
  },
}))
jest.mock('@/native/NativeSoundScraper', () => ({
  __esModule: true,
  default: {
    listAudioApps: () => [],
    recorderStart: jest.fn(() => Promise.resolve()),
    recorderPause: jest.fn(),
    recorderResume: jest.fn(),
    recorderStop: jest.fn(() => Promise.resolve('/tmp/x.mp3')),
    recorderState: () => 'idle',
    recoverPartialRecordings: () => 0,
    onRecorderEvent: jest.fn(() => ({ remove: jest.fn() })),
    playerLoad: jest.fn(() => Promise.resolve()),
    playerUnload: jest.fn(),
    playerPlay: jest.fn(() => Promise.resolve()),
    playerPause: jest.fn(),
    playerStop: jest.fn(),
    playerSeek: jest.fn(),
    playerState: () => 'empty',
    getSettings: () =>
      JSON.stringify({
        quality: 'cbr192',
        id3Version: '2.4',
        lastSource: null,
      }),
    setSettings: jest.fn(() => Promise.resolve()),
    readTags: jest.fn(),
    listRecordings: jest.fn(),
    writeTags: jest.fn(),
    renameRecording: jest.fn(),
  },
}))

if (!NativeSkins) {
  throw new Error('NativeSkins is mocked above')
}
const mockSkins = jest.mocked(NativeSkins)
const mockCore = jest.mocked(NativeSoundScraper)

/** Sends a player event to every recorder-event listener. */
const emitPlayer = (
  event: Pick<
    RecorderEvent,
    'kind' | 'playerState' | 'positionMs' | 'durationMs'
  > &
    Partial<RecorderEvent>,
) => {
  const full: RecorderEvent = {
    state: 'idle',
    elapsedMs: 0,
    peak: 0,
    rms: 0,
    path: null,
    message: null,
    ...event,
  }
  mockCore.onRecorderEvent.mock.calls.forEach(([listener]) => {
    void listener(full)
  })
}

// eslint-disable-next-line @typescript-eslint/no-deprecated -- react-test-renderer is the renderer installed; @testing-library/react-native isn't a dependency
type TestRenderer = ReactTestRenderer
type TestInstance = TestRenderer['root']

/** Renders `element` inside act. */
const render = async (element: ReactElement): Promise<TestRenderer> => {
  let tree: TestRenderer | undefined
  await act(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- react-test-renderer is the renderer installed; @testing-library/react-native isn't a dependency
    tree = create(element)
    return Promise.resolve()
  })
  if (!tree) {
    throw new Error('Nothing rendered')
  }
  return tree
}

/** Runs `fn` in an async act, so promises it starts settle first. */
const actAsync = (fn: () => void) =>
  act(() => {
    fn()
    return Promise.resolve()
  })

const isHandler = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === 'function'

/** A test instance's prop, as unknown. */
const prop = (node: TestInstance, name: string): unknown => node.props[name]

/** Calls a test instance's handler prop (onPress, onLayout…). */
const call = (node: TestInstance, name: string, ...args: unknown[]) => {
  const handler = prop(node, name)
  if (!isHandler(handler)) {
    throw new Error(`No ${name} handler`)
  }
  return handler(...args)
}

const image: ImageRef = {
  path: '/skins/x/sheet.png',
  path2x: '/skins/x/sheet@2x.png',
  path4x: '/skins/x/sheet@4x.png',
  width: 100,
  height: 40,
}
const el = (rect: SkinElement['rect'], extra: Partial<SkinElement> = {}) => ({
  rect,
  sprite: null,
  font: null,
  text: null,
  align: null,
  style: null,
  fallback: false,
  ...extra,
})

const testSkin = (): Skin => {
  const sprite: { image: ImageRef; states: Record<string, [number, number]> } =
    {
      image,
      states: { normal: [0, 0], pressed: [20, 0], recording: [40, 0] },
    }
  return {
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
        image,
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
          record: el([4, 30, 20, 10], {
            sprite: { ...sprite, states: { ...sprite.states } },
          }),
          stop: el([30, 30, 20, 10]),
          elapsed: el([4, 4, 60, 8], { font: 'lcd', align: 'right' }),
          source: el([4, 46, 100, 8], { font: 'lcd', style: { pad: true } }),
          levels: el([120, 4, 60, 8], { style: { segments: 10 } }),
          visualizer: el([120, 14, 60, 12], { style: { grid: '#111111' } }),
        },
        animations: [
          {
            name: 'reel',
            rect: [150, 30, 20, 10],
            sprite,
            frames: ['normal', 'pressed'],
            fps: 10,
            play: 'recording',
            speed: 'constant',
          },
        ],
        shade: null,
      },
      library: {
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
      },
      settings: {
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
      },
      details: {
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
      },
      editor: {
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
      },
      burn: {
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
      },
    },
    visualizer: {
      presets: [
        { name: 'Bars', style: 'bars' },
        { name: 'Scope', style: 'scope' },
      ],
    },
    warnings: [],
  }
}

test('button states fall back toward normal', () => {
  const all = {
    normal: 1,
    pressed: 1,
    active: 1,
    activePressed: 1,
    disabled: 1,
  }
  const flags = { pressed: false, active: false, disabled: false }
  expect(buttonState(all, flags)).toBe('normal')
  expect(buttonState(all, { ...flags, pressed: true, active: true })).toBe(
    'activePressed',
  )
  expect(
    buttonState(
      { normal: 1, pressed: 1 },
      { ...flags, pressed: true, active: true },
    ),
  ).toBe('pressed')
  expect(buttonState({ normal: 1 }, { ...flags, active: true })).toBe('normal')
  expect(buttonState({ normal: 1 }, { ...flags, disabled: true })).toBe(
    'normal',
  )
  // Modes (record while recording) fall back to active, then normal.
  const rec = { normal: 1, pressed: 1, recording: 1 }
  expect(buttonState(rec, { ...flags, mode: 'recording' })).toBe('recording')
  expect(buttonState(rec, { ...flags, mode: 'recording', pressed: true })).toBe(
    'pressed',
  )
  expect(buttonState(rec, { ...flags, mode: 'paused' })).toBe('normal')
  // Disabled in a mode keeps the mode's look (record lit while recording).
  expect(
    buttonState(
      { ...rec, disabled: 1 },
      { ...flags, mode: 'recording', disabled: true },
    ),
  ).toBe('recording')
  expect(
    buttonState(
      { ...rec, disabled: 1 },
      { ...flags, mode: 'paused', disabled: true },
    ),
  ).toBe('disabled')
})

test('the seek bar places its thumb and fill', () => {
  expect(seekGeometry(104, 4, 0)).toEqual({ thumbX: 0, fillWidth: 2 })
  expect(seekGeometry(104, 4, 0.5)).toEqual({ thumbX: 50, fillWidth: 52 })
  expect(seekGeometry(104, 4, 2)).toEqual({ thumbX: 100, fillWidth: 102 })
  expect(
    thumbSize(el([0, 0, 100, 10], { style: { thumbSize: [6, 12] } })),
  ).toEqual([6, 12])
  expect(thumbSize(el([0, 0, 100, 10]))).toEqual([5, 10])
})

test('sprite text maps, aligns, pads and scrolls', () => {
  expect(toGlyphs('Café ♪', ' ABCDEFGHIJKLMNOPQRSTUVWXYZ?')).toEqual([
    'C',
    'A',
    'F',
    'E',
    ' ',
    '?',
  ])
  expect(layoutCells(['A', 'B'], 4, 'right', false, 0)).toEqual([
    ' ',
    ' ',
    'A',
    'B',
  ])
  expect(layoutCells(['A', 'B'], 4, 'left', true, 0)).toEqual([
    'A',
    'B',
    ' ',
    ' ',
  ])
  expect(layoutCells(['A', 'B'], 4, 'left', false, 0)).toEqual(['A', 'B'])
  expect(layoutCells(['A', 'B', 'C'], 2, 'left', false, 1)).toEqual(['B', 'C'])
})

test('images use the @2x file on Retina', () => {
  expect(imageSource(image, 2)).toMatchObject({
    uri: 'file:///skins/x/sheet@2x.png',
    scale: 2,
    width: 100,
  })
  expect(imageSource(image, 1).uri).toBe('file:///skins/x/sheet.png')
  // Double size on Retina.
  expect(imageSource(image, 4)).toMatchObject({
    uri: 'file:///skins/x/sheet@4x.png',
    scale: 4,
  })
  expect(imageSource({ ...image, path4x: null }, 4).scale).toBe(2)
  expect(
    imageSource({ ...image, path: '/a b/#1.png', path2x: null }, 2).uri,
  ).toBe('file:///a%20b/%231.png')
})

test('nine-slice draws nine pieces', async () => {
  const tree = await render(
    <NineSlice image={image} slice={[4, 4, 4, 4]} width={300} height={200} />,
  )
  expect(tree.root.findAllByType(Image)).toHaveLength(9)
})

test('the main panel renders the skin and drives the recorder', async () => {
  skinStore.set(testSkin())
  const tree = await render(
    <SkinProvider>
      <MainPanel />
    </SkinProvider>,
  )
  expect(mockSkins.setPanelLayout.mock.calls).toContainEqual([
    'main',
    200,
    60,
    [0, 0, 200, 60],
    expect.arrayContaining([4, 30, 20, 10]),
    [],
    200,
    60,
    1,
  ])
  expect(tree.root.findByProps({ testID: 'elapsed' })).toBeTruthy()
  // Elements the skin lacks aren't drawn.
  expect(tree.root.findAllByProps({ testID: 'pause' })).toHaveLength(0)
  await actAsync(() => {
    call(tree.root.findByProps({ testID: 'record' }), 'onPress')
  })
  expect(mockCore.recorderStart.mock.calls).toContainEqual([0])
})

test('the main panel plays back a loaded recording', async () => {
  const skin = testSkin()
  const { elements } = skin.panels.main
  elements.play = el([56, 30, 20, 10])
  elements.seek = el([4, 20, 100, 6], { style: { fill: '#00ff00' } })
  skinStore.set(skin)
  const tree = await render(
    <SkinProvider>
      <MainPanel />
    </SkinProvider>,
  )
  const find = (id: string) => tree.root.findByProps({ testID: id })
  expect(prop(find('play'), 'disabled')).toBe(true)
  await act(async () => {
    await playback.select({
      fileName: 'a.mp3',
      path: '/music/a.mp3',
      title: 'a',
      artist: null,
      album: null,
      durationMs: 60000,
      sizeBytes: 1,
      recordedAtMs: 0,
    })
    emitPlayer({
      kind: 'playerState',
      playerState: 'stopped',
      positionMs: 0,
      durationMs: 60000,
    })
  })
  expect(mockCore.playerLoad.mock.calls).toContainEqual(['/music/a.mp3'])
  expect(prop(find('play'), 'disabled')).toBe(false)
  await actAsync(() => {
    call(find('play'), 'onPress')
  })
  expect(mockCore.playerPlay.mock.calls).not.toHaveLength(0)
  await actAsync(() => {
    emitPlayer({
      kind: 'playerState',
      playerState: 'playing',
      positionMs: 0,
      durationMs: 60000,
    })
    emitPlayer({
      kind: 'playerProgress',
      playerState: 'playing',
      positionMs: 30000,
      durationMs: 60000,
      peak: 0.5,
      rms: 0.2,
    })
  })
  expect(prop(find('play'), 'accessibilityLabel')).toBe('Pause')
  const seekValue = prop(find('seek'), 'accessibilityValue')
  expect(isRecord(seekValue) ? seekValue.now : undefined).toBe(30)
  // Record is enabled while playing back: it starts a new recording.
  expect(prop(find('record'), 'disabled')).toBe(false)
  await actAsync(() => {
    call(find('play'), 'onPress')
    call(find('stop'), 'onPress')
  })
  expect(mockCore.playerPause.mock.calls).not.toHaveLength(0)
  expect(mockCore.playerStop.mock.calls).not.toHaveLength(0)
})

test('double size scales the window and its drag regions', async () => {
  skinStore.set(testSkin())
  mockSkins.setPanelLayout.mockClear()
  await render(
    <SkinScale.Provider value={2}>
      <SkinProvider>
        <MainPanel />
      </SkinProvider>
    </SkinScale.Provider>,
  )
  expect(mockSkins.setPanelLayout.mock.calls).toContainEqual([
    'main',
    400,
    120,
    [0, 0, 400, 120],
    expect.arrayContaining([8, 60, 40, 20]),
    [],
    400,
    120,
    2,
  ])
})

test('animations play by recorder state and speed', () => {
  expect(animationPlays('recording', 'recording')).toBe(true)
  expect(animationPlays('recording', 'paused')).toBe(false)
  expect(animationPlays('active', 'paused')).toBe(true)
  expect(animationPlays('active', 'idle')).toBe(false)
  expect(animationPlays('always', 'idle')).toBe(true)
  // During playback the state is "recording" and playing is true.
  expect(animationPlays('recording', 'recording', true)).toBe(false)
  expect(animationPlays('rolling', 'recording', true)).toBe(true)
  expect(animationPlays('rolling', 'recording')).toBe(true)
  expect(animationPlays('playing', 'recording', true)).toBe(true)
  expect(animationPlays('playing', 'recording')).toBe(false)
  expect(animationRate(12, 'constant', 0)).toBe(12)
  expect(animationRate(12, 'level', 1)).toBeCloseTo(24)
  expect(animationRate(12, 'level', 0)).toBeCloseTo(3.6)
})

test('the visualizer cycles presets on click', async () => {
  expect(nextPreset(0, 3)).toBe(1)
  expect(nextPreset(2, 3)).toBe(0)
  expect(nextPreset(0, 0)).toBe(0)
  skinStore.set(testSkin())
  const tree = await render(
    <SkinProvider>
      <MainPanel />
    </SkinProvider>,
  )
  const presetOf = (): unknown => {
    const json = prop(tree.root.findByProps({ pixelated: true }), 'preset')
    return typeof json === 'string' ? JSON.parse(json) : undefined
  }
  expect(presetOf()).toMatchObject({ name: 'Bars', grid: '#111111' })
  await actAsync(() => {
    call(tree.root.findByProps({ testID: 'visualizer' }), 'onPress')
  })
  expect(presetOf()).toMatchObject({ name: 'Scope' })
})

test('scroll bar thumb geometry', () => {
  expect(thumbGeometry(100, 100, 50, 0, 10)).toEqual([0, 100])
  expect(thumbGeometry(100, 100, 400, 0, 10)).toEqual([0, 25])
  expect(thumbGeometry(100, 100, 400, 300, 10)).toEqual([75, 25])
  expect(thumbGeometry(100, 100, 100000, 0, 10)[1]).toBe(10)
})

test('panel frames report their chrome and theme their content', async () => {
  expect(isDarkColor('#221d1a')).toBe(true)
  expect(isDarkColor('#f3ead0')).toBe(false)
  const skin = testSkin()
  skin.panels.library = {
    ...skin.panels.library,
    minSize: [300, 200],
    frame: { image, slice: [20, 4, 4, 4] },
    close: {
      offset: [6, 4],
      size: [10, 8],
      sprite: { image, states: { normal: [0, 0] } },
    },
    controls: { text: '#eeeeee', accent: '#00ff00', background: '#111111' },
  }
  skinStore.set(skin)
  let seen: ReturnType<typeof usePanelStyles> | undefined
  const Probe: FC = () => {
    seen = usePanelStyles()
    return null
  }
  mockSkins.setPanelLayout.mockClear()
  const tree = await render(
    <SkinProvider>
      <SkinPanelFrame panel="library" title="Library">
        <Probe />
      </SkinPanelFrame>
    </SkinProvider>,
  )
  expect(seen?.link.color).toBe('#00ff00')
  await actAsync(() => {
    call(tree.root.findByProps({ testID: 'library-frame' }), 'onLayout', {
      nativeEvent: { layout: { width: 400, height: 300 } },
    })
  })
  expect(mockSkins.setPanelLayout.mock.lastCall).toEqual([
    'library',
    0,
    0,
    [0, 0, 400, 20],
    [384, 4, 10, 8],
    [386, 286, 14, 14],
    300,
    200,
    1,
  ])
  await actAsync(() => {
    call(tree.root.findByProps({ testID: 'library-close' }), 'onPress')
  })
  expect(mockSkins.setPanelVisible.mock.calls).toContainEqual([
    'library',
    false,
  ])
})

test('narrow libraries hide the less important columns', () => {
  expect(visibleColumns(0)).toEqual([
    'name',
    'duration',
    'date',
    'size',
    'artist',
  ])
  expect(visibleColumns(700)).toHaveLength(5)
  expect(visibleColumns(500)).toEqual(['name', 'duration', 'date', 'size'])
  expect(visibleColumns(400)).toEqual(['name', 'duration', 'date'])
})

/** The element with `testID` that has handler `prop` (not its host view). */
const withHandler = (
  tree: TestRenderer,
  testID: string,
  name: string,
): TestInstance => {
  const node = tree.root
    .findAllByProps({ testID })
    .find(n => isHandler(prop(n, name)))
  if (!node) {
    throw new Error(`No ${testID} with ${name}`)
  }
  return node
}

test('the details pane edits a tag in place and renames', async () => {
  mockCore.readTags.mockImplementation(() =>
    Promise.resolve({
      title: 'Old title',
      artist: null,
      album: null,
      albumArtist: null,
      date: null,
      genre: null,
      comment: null,
      track: null,
      coverPath: null,
    }),
  )
  mockCore.listRecordings.mockImplementation(() =>
    Promise.resolve([
      {
        fileName: 'Song.mp3',
        path: '/m/Song.mp3',
        title: 'Old title',
        artist: null,
        album: null,
        durationMs: 61000,
        sizeBytes: 2048,
        recordedAtMs: 0,
      },
    ]),
  )
  mockCore.writeTags.mockImplementation(() => Promise.resolve())
  mockCore.renameRecording.mockImplementation(() =>
    Promise.resolve('New name.mp3'),
  )
  const onRenamed = jest.fn()
  const tree = await render(
    <DetailsPane
      fileNames={['Song.mp3']}
      onRenamed={onRenamed}
      onChanged={jest.fn()}
      onClose={jest.fn()}
      textStyle={{}}
      isDark
    />,
  )
  // Click Title, type, Enter: writes just that field.
  await actAsync(() => {
    call(withHandler(tree, 'details-title', 'onPress'), 'onPress')
  })
  const input = withHandler(tree, 'details-title-input', 'onChangeText')
  await actAsync(() => {
    call(input, 'onChangeText', 'New title')
  })
  await actAsync(() => {
    call(
      tree.root.findByProps({ testID: 'details-title-input' }),
      'onSubmitEditing',
    )
  })
  expect(mockCore.writeTags.mock.calls).toContainEqual([
    ['Song.mp3'],
    expect.objectContaining({ fields: ['title'], title: 'New title' }),
  ])
  // Rename through the file name.
  await actAsync(() => {
    call(withHandler(tree, 'details-name', 'onPress'), 'onPress')
  })
  await actAsync(() => {
    call(
      tree.root.findByProps({ testID: 'details-name-input' }),
      'onChangeText',
      'New name',
    )
  })
  await actAsync(() => {
    call(
      tree.root.findByProps({ testID: 'details-name-input' }),
      'onSubmitEditing',
    )
  })
  expect(mockCore.renameRecording.mock.calls).toContainEqual([
    'Song.mp3',
    'New name',
  ])
  expect(onRenamed).toHaveBeenCalledWith('Song.mp3', 'New name.mp3')
})

test('needles sweep the VU range from the reference level', () => {
  const style: Parameters<typeof needleAngle>[1] = {
    sweep: 64,
    range: [-20, 3],
    reference: -16,
  }
  expect(needleAngle(0, style)).toBe(-32)
  // 0 VU is the reference level: -16 dBFS.
  const zero = needleAngle(10 ** (-16 / 20), style)
  expect(zero).toBeCloseTo(-32 + (64 * 20) / 23, 5)
  // Pinned at the ends.
  expect(needleAngle(1, style)).toBe(32)
  expect(needleAngle(1e-6, style)).toBe(-32)
})

test('skin paths: folders and archives', () => {
  expect(isFolderSkin('/Users/me/Skins/Mine')).toBe(true)
  expect(isFolderSkin('C:\\Skins\\Mine')).toBe(true)
  expect(isFolderSkin('com.example.skin')).toBe(false)
  expect(isFolderSkin(null)).toBe(false)
  expect(isSkinArchive('/x/Hi-Fi 74.sskin')).toBe(true)
  expect(isSkinArchive('C:\\x\\skin.ZIP')).toBe(true)
  expect(isSkinArchive('/x/My Skin')).toBe(false)
})

test('an opened .sskin gets the install card in Settings › Skin', async () => {
  const inspection = {
    id: 'com.example.retro',
    name: 'Retro',
    author: null,
    version: '1.0',
    description: null,
    path: '/x/Retro.sskin',
    preview: null,
    warnings: [],
    installed: null,
  }
  mockSkins.inspectSkin.mockResolvedValueOnce(JSON.stringify(inspection))
  await openSkinFiles(['/x/Retro.sskin'])
  expect(mockSkins.setPanelVisible.mock.calls).toContainEqual([
    'settings',
    true,
  ])
  expect(settingsTab.get()).toBe('skin')
  expect(pendingInstall.get()).toEqual({ inspection })
  // A broken one says why.
  mockSkins.inspectSkin.mockRejectedValueOnce(new Error('skin.json is missing'))
  await openSkinFiles(['/x/Broken.sskin'])
  expect(pendingInstall.get()).toEqual({
    path: '/x/Broken.sskin',
    error: 'skin.json is missing',
  })
  pendingInstall.set(null)
})
