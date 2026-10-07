// The resolved skin the Rust core hands the UI (core/crates/skin/src/resolve.rs,
// ResolvedSkin): absolute image paths, colors resolved, and anything the skin
// left out filled in from the Default skin.

/** [x, y, width, height] in points from the panel's top left. */
export type Rect = [number, number, number, number];

export type ImageRef = {
  path: string;
  /** Exactly twice the pixels, for Retina displays. */
  path2x: string | null;
  /** Four times the pixels (double size on Retina). */
  path4x: string | null;
  /** Size in points (= 1x pixels). */
  width: number;
  height: number;
};

export type SpriteFont = {
  image: ImageRef;
  /** The characters in the sprite's cells, row-major. */
  glyphs: string;
  cell: [number, number];
  columns: number;
};

export type Sprite = {
  image: ImageRef;
  /** State → top-left of a cell the element's size. */
  states: Record<string, [number, number]>;
};

export type TextStyleDef = {
  color: string | null;
  size: number | null;
  family: string | null;
  weight: 'normal' | 'bold' | null;
  uppercase: boolean;
};

export type SkinElement = {
  rect: Rect;
  sprite: Sprite | null;
  font: string | null;
  text: TextStyleDef | null;
  align: 'left' | 'center' | 'right' | null;
  style: Record<string, unknown> | null;
  /** Came from the Default skin. */
  fallback: boolean;
};

export type ElementName =
  | 'record'
  | 'play'
  | 'pause'
  | 'stop'
  | 'seek'
  | 'elapsed'
  | 'status'
  | 'source'
  | 'levels'
  | 'visualizer'
  | 'toggleLibrary'
  | 'toggleSettings'
  | 'minimize'
  | 'shade'
  | 'close';

export type SkinAnimationDef = {
  name: string | null;
  rect: Rect;
  sprite: Sprite;
  /** Sprite states in playing order. */
  frames: string[];
  fps: number;
  play: 'recording' | 'active' | 'always';
  speed: 'constant' | 'level';
};

export type SkinLayout = {
  size: [number, number];
  background: ImageRef | null;
  dragRegions: Rect[];
  elements: Partial<Record<ElementName, SkinElement>>;
  animations: SkinAnimationDef[];
};

export type FramePanel = {
  minSize: [number, number] | null;
  resizable: boolean;
  frame: { image: ImageRef; slice: [number, number, number, number] } | null;
  table: Record<string, string>;
  scrollbar: {
    image: ImageRef;
    track: Rect;
    thumb: Rect;
    thumbSlice: [number, number, number, number] | null;
  } | null;
  controls: Record<string, string>;
  /** Track editor colors (the editor panel). */
  waveform: Record<string, string>;
  /** Playlist colors (the library panel): capacity bar, handles, missing rows. */
  playlist: Record<string, string>;
  title: {
    font: string | null;
    offset: [number, number];
    color: string | null;
    /** Behind the text; the skin's panel color when null. */
    background: string | null;
  } | null;
  /** Offset is [right, top] from the top right corner. */
  close: {
    offset: [number, number];
    size: [number, number];
    sprite: Sprite;
  } | null;
  /** A title-bar menu button, placed like close. */
  menu: {
    offset: [number, number];
    size: [number, number];
    sprite: Sprite;
  } | null;
  /** Resize corner size. */
  grip: [number, number];
};

export type Skin = {
  id: string;
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  dir: string;
  builtin: boolean;
  /** Changes when the skin's files do (a skin folder being edited). */
  revision: string;
  colors: Record<string, string>;
  fonts: Record<string, SpriteFont>;
  panels: {
    main: SkinLayout & { shade: SkinLayout | null };
    library: FramePanel;
    settings: FramePanel;
    details: FramePanel;
    editor: FramePanel;
  };
  visualizer: { presets: Array<Record<string, unknown>> };
  warnings: string[];
};

/** A .sskin looked at before installing it (ss_skin_inspect). */
export type SkinInspection = {
  id: string;
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  /** The archive. */
  path: string;
  /** A PNG of the main panel, 2x. */
  preview: string | null;
  warnings: string[];
  /** The installed skin it would replace. */
  installed: SkinSummary | null;
};

export type SkinSummary = {
  id: string;
  name: string;
  author: string | null;
  version: string | null;
  dir: string;
  builtin: boolean;
  /** Set when an installed skin no longer loads. */
  error: string | null;
};
