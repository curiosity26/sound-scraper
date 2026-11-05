import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

import { DOC_GROUPS } from '@/lib/docGroups'

const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.enum(DOC_GROUPS),
    order: z.number(),
  }),
})

// The skin authoring guide lives in the repo's docs/ (it ships with the
// skin template too), so the site reads it from there.
const skinGuide = defineCollection({
  loader: glob({ base: '../docs', pattern: 'skins.md' }),
})

export const collections = { docs, skinGuide }
