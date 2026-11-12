import type { APIRoute } from 'astro'

// Built per deploy so the sitemap URL follows the Pages origin and base path.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(
    'sitemap-index.xml',
    new URL(import.meta.env.BASE_URL, site ?? 'https://soundscraper.app'),
  )
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
