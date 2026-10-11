// ------------------------------------------------------- ruler and zoom

/** Ruler label steps and their minor ticks, in ms. */
const STEPS: Array<[number, number]> = [
  [1, 1],
  [2, 1],
  [5, 1],
  [10, 2],
  [20, 5],
  [50, 10],
  [100, 20],
  [200, 50],
  [500, 100],
  [1000, 200],
  [2000, 500],
  [5000, 1000],
  [10_000, 2000],
  [15_000, 5000],
  [30_000, 5000],
  [60_000, 10_000],
  [120_000, 30_000],
  [300_000, 60_000],
  [600_000, 120_000],
  [900_000, 300_000],
  [1_800_000, 300_000],
  [3_600_000, 600_000],
]

/** At least this many points between ruler labels. */
const LABEL_SPACING = 70

/**
 * The ruler's labelled step and its minor tick (the snap interval), for a
 * zoom of `msPerPoint`.
 */
export function rulerSteps(msPerPoint: number): {
  major: number
  minor: number
} {
  const [major, minor] =
    STEPS.find(([m]) => m / msPerPoint >= LABEL_SPACING) ??
    STEPS[STEPS.length - 1]
  return { major, minor }
}
