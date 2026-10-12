import React, {
  type FC,
  type ReactNode,
  Suspense,
  use,
  useSyncExternalStore,
} from 'react'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { Platform } from 'react-native'

import { SkinContext } from '@/features/skins/SkinContext'
import { skinStore } from '@/features/skins/skinStore'
import { errorText } from '@/shared/utils/errorText'

export type SkinProviderProps = {
  readonly children: ReactNode
  /** Shown until the skin has loaded. */
  readonly fallback?: ReactNode
  /** Shown instead if it couldn't load, with why. */
  readonly renderError?: (message: string) => ReactNode
}

/**
 * Loads the skin chosen in the settings (once per JS runtime) and provides
 * it; re-renders when another window picks a different skin. Until there
 * is a skin, it shows the fallback, or the error if loading failed; a skin
 * set later (another window's load, a skin folder reloading) replaces
 * either.
 */
export const SkinProvider: FC<SkinProviderProps> = props => {
  const skin = useSyncExternalStore(skinStore.subscribe, skinStore.get)
  if (!skin) {
    // Only the load is under the boundary, not the window's content.
    const renderError = ({ error }: FallbackProps) =>
      props.renderError?.(errorText(error)) ?? null
    return (
      <ErrorBoundary fallbackRender={renderError}>
        <Suspense fallback={props.fallback ?? null}>
          <FirstLoad />
        </Suspense>
      </ErrorBoundary>
    )
  }
  return (
    <SkinContext.Provider value={skin}>
      {/* Windows doesn't reload an image whose source changes, so a new
          skin (or an edited skin folder) remounts the window's content. */}
      <React.Fragment
        key={
          Platform.OS === 'windows' ? `${skin.dir}|${skin.revision}` : undefined
        }
      >
        {props.children}
      </React.Fragment>
    </SkinContext.Provider>
  )
}

/**
 * Waits for the first load; the store then has the skin, which re-renders
 * SkinProvider with it.
 */
const FirstLoad: FC = () => {
  use(skinStore.load())
  return null
}
