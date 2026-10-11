// ------------------------------------------------------------ CD capacity

/** Red Book: 75 sectors (2352 bytes, 588 stereo samples) per second. */
export const SECTORS_PER_SECOND = 75

/** 74:00 */
export const SECTORS_74 = 74 * 60 * SECTORS_PER_SECOND

/** 79:57, what real 80-minute blanks report (a little under 80:00). */
export const SECTORS_80 = (79 * 60 + 57) * SECTORS_PER_SECOND

export const MAX_TRACKS = 99

/** Tracks shorter than 4 s are padded to it. */
export const MIN_TRACK_SECTORS = 4 * SECTORS_PER_SECOND

/** Track 1's pregap, always there. */
export const FIRST_PREGAP_SECTORS = 2 * SECTORS_PER_SECOND
