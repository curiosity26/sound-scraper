import { getCollection, type CollectionEntry } from 'astro:content'

import { DOC_GROUPS, type DocGroup } from '@/lib/docGroups'

export type DocPage = Readonly<{
  slug: string
  title: string
  description: string
  group: DocGroup
  order: number
  /** The file to edit on GitHub, relative to the repo root. */
  source: string
  entry: CollectionEntry<'docs'> | CollectionEntry<'skinGuide'>
}>

const fromDocs = (entry: CollectionEntry<'docs'>): DocPage => ({
  slug: entry.id,
  ...entry.data,
  source: `site/src/content/docs/${entry.id}.md`,
  entry,
})

const fromSkinGuide = (entry: CollectionEntry<'skinGuide'>): DocPage => ({
  slug: 'making-a-skin',
  title: 'Making a skin',
  description:
    'Paint your own Sound Scraper skin: skin.json, images, sprite sheets, fonts, meters and the visualizer.',
  group: 'Skins',
  order: 2,
  source: 'docs/skins.md',
  entry,
})

/** Every docs page in sidebar order. */
export const docPages = async (): Promise<readonly DocPage[]> => {
  const [docs, skinGuide] = await Promise.all([
    getCollection('docs'),
    getCollection('skinGuide'),
  ])
  return [...docs.map(fromDocs), ...skinGuide.map(fromSkinGuide)].toSorted(
    (a, b) =>
      DOC_GROUPS.indexOf(a.group) - DOC_GROUPS.indexOf(b.group) ||
      a.order - b.order,
  )
}
