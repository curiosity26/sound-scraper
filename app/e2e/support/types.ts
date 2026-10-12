/** How a test names an element: its accessible name (accessibilityLabel). */
export type Query = {
  readonly name: string
  /** exact (the default), prefix, or a regular expression's source. */
  readonly match?: 'exact' | 'prefix' | 'regex'
  /** The platform's role name (on Linux AT-SPI's, e.g. "button"). */
  readonly role?: string
}

/** The keys a test can press. */
export type Key = 'Return' | 'Escape' | 'Tab'

/** What a test can see of an element. */
export type ElementInfo = {
  readonly name: string
  readonly role: string
  readonly enabled: boolean
  readonly selected: boolean
  readonly checked: boolean
}

/** The running app, as the platform's accessibility API shows it. */
export type AppDriver = {
  /** The first showing element matching, or undefined. */
  readonly find: (query: Query) => Promise<ElementInfo | undefined>
  /** Activates the element (a click, or Enter on it) once it shows. */
  readonly press: (query: Query) => Promise<void>
  /** Replaces the text of the focused text field with `text`. */
  readonly type: (text: string) => Promise<void>
  /** Presses a key (Return, Escape or Tab) in the focused window. */
  readonly key: (key: Key) => Promise<void>
  /** Every named element showing, for failure messages. */
  readonly names: () => Promise<readonly string[]>
  /** Quits the app and waits for it to exit. */
  readonly quit: () => Promise<void>
}

/** Where the launched app keeps its files: a fresh home folder per test. */
export type Sandbox = {
  readonly home: string
  readonly recordingsDir: string
  readonly remove: () => Promise<void>
}
