import { imageRevision } from './imageRevision'

/**
 * The current skin's revision, added to image URLs so the image cache
 * doesn't keep a skin folder's old pictures after they're edited.
 */
export const setImageRevision = (r: string) => {
  imageRevision.set(r)
}
