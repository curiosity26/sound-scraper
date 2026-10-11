import React, { type FC, useEffect, useRef, useState } from 'react'

import type { RecorderState } from '@/native/types'

import { animationPlays } from './animationPlays'
import { animationRate } from './animationRate'
import { scaleRect } from './scaleRect'
import { SpriteCell } from './SpriteCell'
import type { SkinAnimationDef } from './types'
import { useSkinScale } from './useSkinScale'

const TICK_MS = 33

export type SkinAnimationProps = {
  readonly animation: SkinAnimationDef
  readonly state: RecorderState
  /** Playing back (state is then "recording"). */
  readonly playing?: boolean
  /** Linear 0..1, for speed "level". */
  readonly level: number
}

/** A skin's decorative sprite animation (e.g. the spinning tape reels). */
export const SkinAnimation: FC<SkinAnimationProps> = props => {
  const { animation, state, level } = props
  const s = useSkinScale()
  const [frame, setFrame] = useState(0)
  const phase = useRef(0)
  const rate = useRef(0)
  rate.current = animationRate(animation.fps, animation.speed, level)
  const playing = animationPlays(animation.play, state, props.playing)
  const count = animation.frames.length

  useEffect(() => {
    if (!playing || count < 2) {
      return
    }
    let last = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      phase.current =
        (phase.current + ((now - last) / 1000) * rate.current) % count
      last = now
      setFrame(Math.floor(phase.current))
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [playing, count])

  const [, , w, h] = animation.rect
  const name = animation.frames[frame % count]
  const at = name === undefined ? undefined : animation.sprite.states[name]
  return (
    <SpriteCell
      image={animation.sprite.image}
      at={at}
      size={[w, h]}
      style={scaleRect(animation.rect, s)}
    />
  )
}
