import type { FC } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'
import type { Target } from '@/features/burn/types'

import { BurnOptions } from './BurnOptions'
import { BurnSetupContext } from './BurnSetupContext'
import { DeviceList } from './DeviceList'
import { Label } from './Label'
import { SetupFooter } from './SetupFooter'
import { SimulatorSettings } from './SimulatorSettings'
import { useBurnSetupState } from './useBurnSetupState'

export type SetupProps = {
  readonly target: Target
}

/** Where and how to burn `target`, and the button that starts it. */
export const Setup: FC<SetupProps> = props => {
  const { target } = props
  const th = useBurnTheme()
  const setup = useBurnSetupState(target)
  const { tracks } = setup.options.capacity
  return (
    <BurnSetupContext value={setup}>
      <View style={commonStyles.root}>
        <ScrollView
          style={commonStyles.flex}
          contentContainerStyle={styles.setup}
        >
          <Text
            style={[commonStyles.heading, { color: th.text }]}
            numberOfLines={1}
          >
            “{target.name}” · {tracks} {tracks === 1 ? 'track' : 'tracks'}
          </Text>

          <Label text="Write to" />
          <DeviceList />

          <SimulatorSettings />

          <BurnOptions />
        </ScrollView>

        <SetupFooter />
      </View>
    </BurnSetupContext>
  )
}

const styles = StyleSheet.create({
  setup: { gap: 8, paddingBottom: 8 },
})
