import type { FC } from 'react'
import { Text, View } from 'react-native'

import type { BurnJob } from '@/burn/types'
import { commonStyles } from '@/windows/BurnApp/BurnPanel/commonStyles'

import { BurnLog } from './BurnLog'
import { BurnProgressContext } from './BurnProgressContext'
import { ProgressButtons } from './ProgressButtons'
import { Summary } from './Summary'
import { TrackList } from './TrackList'
import { useBurnProgressState } from './useBurnProgressState'

export type ProgressProps = {
  /** The job shown: burnJob's value. */
  readonly current: BurnJob
}

/** The burn going track by track: the bars, the log, and its buttons. */
export const Progress: FC<ProgressProps> = props => {
  const progress = useBurnProgressState(props.current)
  const { error, status } = progress
  return (
    <BurnProgressContext value={progress}>
      <View style={commonStyles.root}>
        <TrackList />
        <Summary />
        <BurnLog />
        {(error || status?.message) && (
          <Text selectable style={[commonStyles.small, commonStyles.error]}>
            {error ?? status?.message}
          </Text>
        )}
        <ProgressButtons />
      </View>
    </BurnProgressContext>
  )
}
