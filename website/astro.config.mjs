import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import { site } from './src/shared/config/site.ts';

export default defineConfig({
    site: site.origin,
    base: site.base,
    trailingSlash: 'always',
    output: 'static',
    integrations: [vue()],
    devToolbar: { enabled: false },
});
