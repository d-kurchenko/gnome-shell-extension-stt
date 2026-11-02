import { site } from '../shared/config/site';
import type { Locale } from './locales';

/** English keeps the existing root URL; every other locale has one static route. */
export function localePath(locale: Locale): string {
    return `${site.base}/${locale === 'en' ? '' : `${locale}/`}`;
}

export function localeUrl(locale: Locale): string {
    return new URL(localePath(locale), site.origin).href;
}
