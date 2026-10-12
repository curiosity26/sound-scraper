import type { ResolvedElement } from '@/bridge/generated'

/** A skin element at `rect`, plain unless `extra` says otherwise. */
export const skinElement = (
  rect: ResolvedElement['rect'],
  extra: Partial<ResolvedElement> = {},
): ResolvedElement => ({
  rect,
  sprite: null,
  font: null,
  text: null,
  align: null,
  style: null,
  fallback: false,
  ...extra,
})
