import type { FC } from 'react'

import { type OverlayName, useOverlay } from '@/App/Overlay'
import { TextLink } from '@/components/TextLink'

export type HeaderLinkProps = {
  readonly label: string
  /** The panel the link opens. */
  readonly opens: OverlayName
}

/** A title-bar link that opens a side panel. */
export const HeaderLink: FC<HeaderLinkProps> = props => {
  const { open } = useOverlay()
  return (
    <TextLink
      label={props.label}
      onPress={() => {
        open(props.opens)
      }}
      testName={`open-${props.opens}`}
    />
  )
}
