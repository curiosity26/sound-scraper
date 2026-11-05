# Sound Scraper website

The official site, built with [Astro](https://astro.build) and published on
GitHub Pages by `.github/workflows/website.yml`.

- `src/pages/`: the home page, downloads page and docs routes.
- `src/content/docs/`: the docs, one Markdown file per page (frontmatter:
  `title`, `description`, `group`, `order`). "Making a skin" is read from
  `../docs/skins.md`.
- `src/lib/release.ts`: reads the latest release from the GitHub API at
  build time and sorts its assets into platforms, Linux packages and skins.
- `src/lib/skins.ts`: every skin in `../skins/`, matched to its `.sskin` in
  the latest release. The pictures come from `npm run previews`, which runs
  the app's skin renderer (needs Rust) into `src/generated/skins/`.
- Artwork and screenshots are used straight from `../assets/` and
  `../docs/images/`.

```sh
nvm use
npm ci
npm run previews   # skin pictures (optional; cards show a placeholder without)
npm run dev        # http://localhost:4321/sound-scraper/
npm run build      # dist/, plus the Pagefind search index
npm run check      # astro check (TypeScript)
npm run format     # Prettier
```

Docs search (Pagefind) only works on a build (`npm run build && npm run preview`).
The builds outside CI fall back to links to the releases page when the
GitHub API can't be reached; CI sets `REQUIRE_RELEASE=1` so a deploy always
has direct download links.
