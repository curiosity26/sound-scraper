// The parts of @curiosity26/react-native-gtk4 (React Native for Linux on
// GTK4) the app uses, for type checking where the package isn't installed:
// it's an optional dependency that installs on Linux only. Where it is
// installed, its own types (a superset) are used instead.
declare module '@curiosity26/react-native-gtk4' {
  export type WindowEvent =
    | 'focus'
    | 'blur'
    | 'resize'
    | 'close-requested'
    | 'closed'
    | 'open'

  /** One of the app's windows (Windows.open, Windows.main). */
  export type WindowHandle = {
    readonly id: number
    close(): void
    setTitle(title: string): void
    /** The content's size, in points. */
    setSize(width: number, height: number): void
    setMinimumSize(width: number, height: number): void
    focus(): void
    setInterceptClose(intercept: boolean): void
    addListener(
      type: WindowEvent,
      listener: (event: {
        id: number
        type: WindowEvent
        width?: number
        height?: number
      }) => void,
    ): { remove(): void }
  }

  export type WindowOptions = {
    component: string
    initialProps?: object
    title?: string
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    resizable?: boolean
    interceptClose?: boolean
    titleBar?: 'default' | 'hidden' | 'none'
    transparent?: boolean
  }

  export const Windows: {
    open(options: WindowOptions): WindowHandle
    readonly main: WindowHandle
    setQuitOnLastWindowClosed(quit: boolean): void
  }
}
