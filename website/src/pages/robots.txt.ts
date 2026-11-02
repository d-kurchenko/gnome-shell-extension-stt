import type { APIRoute } from 'astro';
import { site } from '../shared/config/site';

export const GET: APIRoute = () =>
    new Response(
        `User-agent: *\nAllow: /\n\nSitemap: ${new URL(`${site.base}/sitemap.xml`, site.origin).href}\n`,
        { headers: { 'Content-Type': 'text/plain' } },
    );
