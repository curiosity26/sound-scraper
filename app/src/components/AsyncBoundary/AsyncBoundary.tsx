// Suspense plus an error boundary for a view that reads async data with
// use(). Errors thrown while rendering show a message and a Retry button;
// errors from event handlers never reach here, so actions keep their own
// try/catch. In dev builds React Native's red box still appears on top.
import { Suspense, type FC, type ReactNode } from 'react'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'

import { ErrorFallback } from './ErrorFallback'

export type AsyncBoundaryProps = {
  readonly children: ReactNode
  /** Shown while the data loads; nothing by default. */
  readonly fallback?: ReactNode
  /** What the error message says couldn't be done, e.g. "read the library". */
  readonly what: string
  /** The boundary clears its error when any of these change. */
  readonly resetKeys?: readonly unknown[]
  /** Called by Retry before rendering again, e.g. to clear a cache. */
  readonly onReset?: () => void
}

const renderFallback =
  (what: string) =>
  ({ error, resetErrorBoundary }: FallbackProps): ReactNode =>
    <ErrorFallback what={what} error={error} onRetry={resetErrorBoundary} />

export const AsyncBoundary: FC<AsyncBoundaryProps> = props => (
  <ErrorBoundary
    resetKeys={props.resetKeys ? [...props.resetKeys] : undefined}
    onReset={props.onReset}
    fallbackRender={renderFallback(props.what)}
  >
    <Suspense fallback={props.fallback ?? null}>{props.children}</Suspense>
  </ErrorBoundary>
)
