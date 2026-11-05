import { defineConfig } from 'astro/config'

// The site lives at https://soundscraper.app (GitHub Pages with a custom
// domain). In CI the Pages workflow passes the origin and base path from
// actions/configure-pages, so changing the domain in Settings › Pages
// needs no change here; an empty base path means the domain's root.
const ci = Boolean(process.env.SITE_ORIGIN)

export default defineConfig({
  site: ci ? process.env.SITE_ORIGIN : 'https://soundscraper.app',
  base: (ci && process.env.SITE_BASE_PATH) || '/',
  trailingSlash: 'ignore',
  vite: {
    // The site uses the app's artwork and screenshots straight from the
    // repo (assets/, docs/images/, skins/).
    server: { fs: { allow: ['..'] } },
  },
})
