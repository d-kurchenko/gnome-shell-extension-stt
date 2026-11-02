import type { APIRoute } from 'astro';
import { locales } from '../i18n/locales';
import { localeUrl } from '../i18n/routing';

export const GET: APIRoute = () =>
    new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locales.map((locale) => `<url><loc>${localeUrl(locale.code)}</loc></url>`).join('')}</urlset>`,
        { headers: { 'Content-Type': 'application/xml' } },
    );
