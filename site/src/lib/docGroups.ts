export const DOC_GROUPS = [
  'Start here',
  'Using the app',
  'Skins',
  'Help',
] as const

export type DocGroup = (typeof DOC_GROUPS)[number]
