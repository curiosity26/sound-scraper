import type { Tags } from '@/native/types'
import type { Field } from '@/tags/types'

export const fieldText = (tags: Tags, field: Field): string => {
  const v = field === 'track' ? tags.track : tags[field]
  return v == null ? '' : String(v)
}
