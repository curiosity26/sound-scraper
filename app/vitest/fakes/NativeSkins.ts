// The skinned windows' native module (src/bridge/NativeSkins.ts), faked:
// panels show and hide, layouts are recorded, menus answer what the test
// chose. Tests replace the module with this one:
//
//   vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))
//
// and arrange or inspect it through `fakeSkins`. Call `fakeSkins.reset()` in
// a beforeEach.
import { vi } from 'vitest'

import type {
  ResolvedSkin,
  SkinInspection,
  SkinSummary,
} from '@/bridge/generated'
import type { Spec, WindowEvent } from '@/bridge/NativeSkins'

import { fakeEmitter } from './emitter'

/** A panel's chrome, as the last setPanelLayout call gave it. */
export type PanelLayout = {
  readonly width: number
  readonly height: number
  readonly dragRegions: readonly number[]
  readonly holes: readonly number[]
  readonly grip: readonly number[]
  readonly minWidth: number
  readonly minHeight: number
  readonly scale: number
}

type State = {
  visible: Record<string, boolean>
  layouts: Record<string, PanelLayout>
  /** The menu item the next menu answers (-1 = dismissed). */
  menuChoice: number
  inspections: Record<string, SkinInspection | Error>
  installed: SkinSummary[]
  opened: string[]
  /** What loading the skin chosen in the settings answers. */
  current: ResolvedSkin | null
}

const initialState = (): State => ({
  visible: {},
  layouts: {},
  menuChoice: -1,
  inspections: {},
  installed: [],
  opened: [],
  current: null,
})

const state: State = initialState()
const windowEvents = fakeEmitter<WindowEvent>('fake:windowEvent')

const notInTests = () => Promise.reject(new Error('Not faked'))

const native = {
  onWindowEvent: vi.fn(windowEvents.on),
  loadSkin: vi.fn((_idOrPath: string) => notInTests()),
  loadCurrentSkin: vi.fn(() =>
    state.current === null
      ? notInTests()
      : Promise.resolve(JSON.stringify(state.current)),
  ),
  listSkins: vi.fn(() => Promise.resolve(JSON.stringify(state.installed))),
  installSkin: vi.fn((_archivePath: string) => notInTests()),
  removeSkin: vi.fn((_id: string) => Promise.resolve()),
  pickSkinArchive: vi.fn(() => Promise.resolve(null)),
  pickSkinFolder: vi.fn(() => Promise.resolve(null)),
  pickFolder: vi.fn((_title: string, _prompt: string) => Promise.resolve(null)),
  pickSkinSaveLocation: vi.fn((_defaultName: string) => Promise.resolve(null)),
  inspectSkin: vi.fn((archivePath: string) => {
    const answer = state.inspections[archivePath]
    return answer === undefined
      ? Promise.reject(new Error('Not a skin'))
      : answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(JSON.stringify(answer))
  }),
  skinPreview: vi.fn((_idOrPath: string) => notInTests()),
  packageSkin: vi.fn((_dir: string, _outPath: string) => notInTests()),
  createSkin: vi.fn((_parent: string, _name: string) => notInTests()),
  skinFolderStamp: vi.fn((_dir: string) => Promise.resolve('""')),
  takeOpenedSkinFiles: vi.fn(() => {
    const taken = state.opened
    state.opened = []
    return taken
  }),
  setPanelLayout: vi.fn(
    (
      panel: string,
      width: number,
      height: number,
      dragRegions: number[],
      holes: number[],
      grip: number[],
      minWidth: number,
      minHeight: number,
      scale: number,
    ) => {
      state.layouts = {
        ...state.layouts,
        [panel]: {
          width,
          height,
          dragRegions,
          holes,
          grip,
          minWidth,
          minHeight,
          scale,
        },
      }
    },
  ),
  windowAction: vi.fn((_action: string) => {}),
  beginGesture: vi.fn((_panel: string, _kind: string) => {}),
  setPanelVisible: vi.fn((panel: string, visible: boolean) => {
    state.visible = { ...state.visible, [panel]: visible }
    windowEvents.emit({ window: panel, event: visible ? 'shown' : 'hidden' })
  }),
  isPanelVisible: vi.fn((panel: string) => state.visible[panel] ?? false),
  showMenu: vi.fn(
    (
      _panel: string,
      _items: string[],
      _checked: number,
      _x: number,
      _y: number,
    ) => Promise.resolve(state.menuChoice),
  ),
} satisfies Spec

export default native

/** The test's handle on the fake skins module. */
export const fakeSkins = {
  native,
  reset: () => {
    Object.assign(state, initialState())
    Object.values(native).forEach(fn => {
      fn.mockClear()
    })
  },
  /** The panel's chrome from its latest layout, if it has reported one. */
  layoutOf: (panel: string): PanelLayout | undefined => state.layouts[panel],
  isVisible: (panel: string): boolean => state.visible[panel] ?? false,
  /** Shows or hides a panel's window quietly, as if it already was. */
  setVisible: (panel: string, visible: boolean) => {
    state.visible = { ...state.visible, [panel]: visible }
  },
  /** The item index the next native menu answers (-1 = dismissed). */
  chooseMenuItem: (index: number) => {
    state.menuChoice = index
  },
  /** What inspecting the .sskin at `path` answers (an Error rejects). */
  setInspection: (path: string, answer: SkinInspection | Error) => {
    state.inspections = { ...state.inspections, [path]: answer }
  },
  /** The skins listed as installed. */
  setInstalledSkins: (installed: SkinSummary[]) => {
    state.installed = installed
  },
  /**
   * Skins opened from the file manager (or dropped on a panel). With
   * `{ atLaunch: true }` they were opened before the app's JS started;
   * otherwise the main window is told, as the native side does.
   */
  openFiles: (paths: string[], options: { atLaunch?: boolean } = {}) => {
    state.opened = [...state.opened, ...paths]
    if (options.atLaunch !== true) {
      windowEvents.emit({ window: 'main', event: 'skinFilesOpened' })
    }
  },
  /** The skin that loading the one chosen in the settings answers. */
  setCurrentSkin: (skin: ResolvedSkin) => {
    state.current = skin
  },
  /** Sends a window event, as the native windows do. */
  emit: (event: WindowEvent) => {
    windowEvents.emit(event)
  },
}
