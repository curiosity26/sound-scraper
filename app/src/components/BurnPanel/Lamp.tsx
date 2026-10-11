import { type FC, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import type { BurnTheme, TrackState } from '@/burn/types'
import { colors } from '@/theme/colors'

import { TRACK_WORDS } from './constants'

/** A status lamp: dark while waiting, lit while working, green or red after. */
export type LampProps = {
  readonly th: BurnTheme
  readonly state: TrackState
}

export const Lamp: FC<LampProps> = props => {
  const { th, state } = props
  const color =
    state === 'done'
      ? th.c('done', th.accent)
      : state === 'failed'
      ? th.c('failed', colors.error)
      : state === 'writing'
      ? th.c('writing', '#ffb03a')
      : state === 'preparing' || state === 'ready'
      ? th.c('preparing', '#a08a6a')
      : th.c('waiting', '#4a423c')
  const glow = th.c('glow', '#00000000')
  const lit = state !== 'waiting'
  const [blink, setBlink] = useState(true)
  useEffect(() => {
    if (state !== 'writing') {
      setBlink(true)
      return
    }
    const t = setInterval(() => {
      setBlink(b => !b)
    }, 450)
    return () => {
      clearInterval(t)
    }
  }, [state])
  const look = {
    backgroundColor: color,
    opacity: blink ? 1 : 0.45,
    shadowColor: lit ? glow : 'transparent',
  }
  return (
    <View accessibilityLabel={TRACK_WORDS[state]} style={[styles.lamp, look]} />
  )
}

const styles = StyleSheet.create({
  lamp: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
})
