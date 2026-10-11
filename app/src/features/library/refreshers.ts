// Every mounted library view, so a change elsewhere (e.g. the recordings
// folder in the settings window) can refresh them.
export const refreshers = new Set<() => void>()
