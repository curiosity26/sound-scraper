import { errorText } from './errorText'

/**
 * A rejection handler that hands `report` the error as text, for a promise
 * nothing awaits: `save().catch(onRejected(showError))`.
 */
export const onRejected =
  (report: (message: string) => void) =>
  (e: unknown): void => {
    report(errorText(e))
  }
