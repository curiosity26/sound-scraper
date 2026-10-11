/** Whether a dropped or opened path is a skin archive (else a folder). */
export const isSkinArchive = (path: string): boolean => {
  return /\.(sskin|zip)$/i.test(path)
}
