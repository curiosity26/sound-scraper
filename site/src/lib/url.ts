/** A path inside the site, under its base path (the domain root on soundscraper.app). */
export const url = (path = ''): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
