import { defineConfig } from 'astro/config'

// GitHub Pages serves the site from https://<owner>.github.io/<repo>/ until
// it has a custom domain. The Pages workflow passes the real origin and
// base path from actions/configure-pages, so a custom domain needs no
// change here.
export default defineConfig({
  site: process.env.SITE_ORIGIN || 'https://curiosity26.github.io',
  base: process.env.SITE_BASE_PATH || '/sound-scraper',
  trailingSlash: 'ignore',
  vite: {
    // The site uses the app's artwork and screenshots straight from the
    // repo (assets/, docs/images/, skins/).
    server: { fs: { allow: ['..'] } },
  },
})
