import React, { type FC, useEffect, useRef, useState } from 'react'

import type { ResolvedAnimation } from '@/bridge/generated'
import { useTransport } from '@/features/recorder/components/MainPanel/useTransport'
import { SpriteCell } from '@/features/skins/components/SpriteCell'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { scaleRect } from '@/features/skins/scaleRect'

import { animationPlays } from './animationPlays'
import { animationRate } from './animationRate'

const TICK_MS = 33

export type SkinAnimationProps = {
  readonly animation: ResolvedAnimation
}

/**
 * A skin's decorative sprite animation (e.g. the spinning tape reels),
 * following the tape: recording or playing back (the tape state is then
 * "recording"), at a speed that can follow the level.
 */
export const SkinAnimation: FC<SkinAnimationProps> = props => {
  const { animation } = props
  const s = useSkinScale()
  const { tapeState, playing: playingBack, levels } = useTransport()
  const level = levels.peak
  const [frame, setFrame] = useState(0)
  const phase = useRef(0)
  const rate = useRef(0)
  rate.current = animationRate(animation.fps, animation.speed, level)
  const playing = animationPlays(animation.play, tapeState, playingBack)
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
