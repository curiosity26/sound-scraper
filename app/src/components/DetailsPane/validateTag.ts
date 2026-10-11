import type { Field } from '@/tags/types'

/** Validates a field; returns an error message or null. */
export const validateTag = (field: Field, text: string): string | null => {
  const t = text.trim()
  if (!t) {
    return null
  }
  if (field === 'track' && !/^\d{1,4}$/.test(t)) {
    return 'Track # must be a whole number'
  }
  if (field === 'date' && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t)) {
    return 'Use 2026, 2026-10 or 2026-10-03'
  }
  return null
}
