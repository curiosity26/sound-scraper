import React, { type FC } from 'react'

import { AsyncBoundary } from '@/components/AsyncBoundary'

import { NoPreview } from './NoPreview'
import { PreviewImage } from './PreviewImage'
import type { PreviewSource } from './types'

export type PreviewProps = PreviewSource

/**
 * A skin's picture: drawn by the core and cached, so it follows a skin
 * folder as it changes (the path changes with it). An empty frame until
 * it's ready.
 */
export const Preview: FC<PreviewProps> = props => (
  <AsyncBoundary
    what="draw the skin's picture"
    resetKeys={[props.source, props.path]}
    fallback={<NoPreview width={props.width} height={props.width / 3} />}
  >
    <PreviewImage {...props} />
  </AsyncBoundary>
)
