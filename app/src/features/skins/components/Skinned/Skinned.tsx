import { type FC, type ReactNode, useState } from 'react'
import { Text, View } from 'react-native'

import { useDoubleSize } from '@/features/skins/hooks/useDoubleSize'
import { SkinScale } from '@/features/skins/SkinScale'
import { styles } from '@/shared/theme/styles'

import { SkinProvider } from './SkinProvider'

export type SkinnedProps = {
  readonly children: ReactNode
}

/** The skin, at the current scale, around a window's content. */
export const Skinned: FC<SkinnedProps> = props => {
  const [error, setError] = useState<string>()
  const { double } = useDoubleSize()
  return (
    <SkinScale.Provider value={double ? 2 : 1}>
      <SkinProvider
        onError={setError}
        fallback={
          error ? (
            <View style={styles.skinError}>
              <Text selectable style={styles.skinErrorText}>
                Couldn't load the skin: {error}
              </Text>
            </View>
          ) : null
        }
      >
        {props.children}
      </SkinProvider>
    </SkinScale.Provider>
  )
}
