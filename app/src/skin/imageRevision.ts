let revision = ''

/** The current skin's revision (see setImageRevision). */
export const imageRevision = {
  get: (): string => revision,
  set: (r: string) => {
    revision = r
  },
}
