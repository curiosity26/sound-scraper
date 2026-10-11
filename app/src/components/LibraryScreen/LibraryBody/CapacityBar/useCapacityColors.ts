// The capacity bar's colours: the skin's playlist colours, or defaults.
import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { colors } from '@/theme/colors'

export type UseCapacityColorsResult = {
  /** The bar's fill: fits 74 minutes, fits 80, or too long. */
  readonly fill: string
  /** The captions (undefined: the screen's text colour). */
  readonly text: string | undefined
  /** Behind the fill. */
  readonly track: string
  /** The 74 and 80 minute marks. */
  readonly mark: string
}

export const useCapacityColors = (): UseCapacityColorsResult => {
  const theme = usePanelTheme()
  const c = useLibraryView().shown.capacity
  const pc = theme?.playlist ?? {}
  const text = pc.text ?? theme?.text
  return {
    fill:
      c.fit === 'fits74'
        ? pc.fill ?? theme?.accent ?? colors.accent
        : c.fit === 'fits80'
        ? pc.fill80 ?? '#e0a030'
        : pc.over ?? colors.error,
    text,
    track: pc.track ?? '#0004',
    mark: pc.mark ?? text ?? '#fff',
  }
}
