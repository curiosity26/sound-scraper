import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

import { BurnButton } from './BurnButton'
import { CapacityMeter } from './CapacityMeter'
import { capacitySummary } from './capacitySummary'
import { capacityText } from './capacityText'
import { useCapacityColors } from './useCapacityColors'

/**
 * The showing playlist's CD capacity bar with 74 and 80 minute marks, what
 * it means, and Burn CD… beside the summary when the screen can burn.
 */
export const CapacityBar: FC = () => {
  const t = usePanelStyles()
  const { textStyle, onBurn } = useLibraryScreen()
  const c = useLibraryView().shown.capacity
  const { fill, text } = useCapacityColors()
  return (
    <View style={styles.capacity} testID="cd-capacity">
      <View style={styles.capacityTop}>
        <Text
          style={[
            styles.capacityLine,
            styles.capacitySummary,
            textStyle,
            { color: text },
            t.cell,
          ]}
        >
          {capacitySummary(c)}
        </Text>
        {onBurn && <BurnButton />}
      </View>
      <CapacityMeter />
      <Text
        style={[
          styles.capacityLine,
          textStyle,
          { color: c.fit === 'tooLong' || c.fit === 'tooMany' ? fill : text },
          t.cell,
        ]}
      >
        {capacityText(c)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  capacity: { marginTop: 6, gap: 3 },
  capacityLine: { fontSize: 12 },
  capacityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacitySummary: { flex: 1 },
})
