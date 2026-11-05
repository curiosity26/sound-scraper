/** A path inside the site, under its base path (/sound-scraper/ on GitHub Pages). */
export const url = (path = ''): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
