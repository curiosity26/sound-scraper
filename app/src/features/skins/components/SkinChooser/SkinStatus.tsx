import { type FC, useSyncExternalStore } from 'react'
import { Text } from 'react-native'

import { skinMessages } from './skinMessages'
import { styles } from './styles'
import { useSkinChooser } from './useSkinChooser'

/** The last note or error, and the current skin's warnings. */
export const SkinStatus: FC = () => {
  const { warnings, textStyle } = useSkinChooser()
  // Shared, so they survive the window re-mounting for a new skin.
  const { note, error } = useSyncExternalStore(
    skinMessages.subscribe,
    skinMessages.get,
  )
  return (
    <>
      {note && <Text style={[styles.note, textStyle]}>{note}</Text>}
      {error && (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      )}
      {warnings.map((w, i) => (
        <Text key={i} selectable style={[styles.warning, textStyle]}>
          ⚠︎ {w}
        </Text>
      ))}
    </>
  )
}
