import { eventually } from './eventually'
import type { AppDriver, ElementInfo, Query } from './types'

/**
 * Waits until an element matching `query` shows and returns it; on timeout
 * the error lists what did show.
 */
export const waitToShow = async (
  app: AppDriver,
  query: Query,
): Promise<ElementInfo> => {
  try {
    return await eventually(async () => {
      const element = await app.find(query)
      if (!element) {
        throw new Error('not showing')
      }
      return element
    })
  } catch {
    let showing: readonly string[]
    try {
      showing = await app.names()
    } catch (e) {
      showing = [`(couldn't list them: ${String(e)})`]
    }
    throw new Error(
      `${JSON.stringify(query)} never showed. Showing:\n  ${showing.join(
        '\n  ',
      )}`,
    )
  }
}
