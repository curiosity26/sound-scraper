import React, { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { doubleSizeStore } from '@/skin/doubleSizeStore'
import { SkinProvider } from '@/skin/SkinProvider'
import { SkinScale } from '@/skin/SkinScale'

import { styles } from './styles'

/** Double size (⌘D), shared by every window. */
function useDoubleSize(): boolean {
  const [double, setDouble] = useState(doubleSizeStore.get)
  useEffect(() => doubleSizeStore.subscribe(setDouble), [])
  return double
}

/** The skin, at the current scale, around a window's content. */
export const Skinned = (props: {
  children: React.ReactNode
}): React.JSX.Element => {
  const [error, setError] = useState<string>()
  const double = useDoubleSize()
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
