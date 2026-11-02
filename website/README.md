# Speech to Text website

The public landing page for the GNOME Shell extension, built with Astro, Vue 3,
VueUse, TypeScript, and native CSS. Astro generates static HTML. The interactive
desktop demo is a Vue island hydrated when visible. It loops automatically;
visitors can pause or resume it. Hidden tabs suspend playback. Reduced-motion
preferences disable autoplay and allow a short, manually triggered demonstration.
VueUse manages timers, document visibility, and motion preferences. It never records audio or calls a transcription
API. Fonts are served locally, with no analytics or third-party embeds.

## Local development

From the repository root:

```sh
cd website
bun install --frozen-lockfile
bun run dev
```

Open the printed local URL, including `/gnome-shell-extension-stt/`.
Node.js 24 and Bun 1.4.4 are used in CI.
When running inside an agent session, use `bun run dev --ignore-lock` to keep
the preview in the foreground rather than Astro's automatic background mode.

```sh
bun run check       # Astro diagnostics and Vue/TypeScript checking
bun run build       # Static output in website/dist/
bun run preview     # Serve the production build locally
```

The website has its own dependencies and lockfile. It does not change the GJS
extension build or ship website files in the extension ZIP.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` checks pull requests and builds
and deploys changes on `main`. In the repository's **Settings → Pages → Build
and deployment**, select **GitHub Actions** as the source before the first
deployment. Push these changes to `main`, or run the Website workflow manually
after merging.

Expected URL after deployment:
https://d-kurchenko.github.io/gnome-shell-extension-stt/

`src/shared/config/site.ts` owns the origin, base path, product links and
supported GNOME versions. Astro reads this configuration too. Update it if
moving the website. The canonical URL, social image URL, sitemap, and robots
file are generated from this configuration. GitHub Pages serves robots.txt
under the project path; a root-level robots.txt, if needed, belongs in the
account's `d-kurchenko.github.io` repository.

## Content and design

The thin route `src/pages/[...locale].astro` composes the landing page from
`src/sections/`. The illustration and its state machine live in
`src/features/dictation-demo/`. Shared UI primitives live in `src/shared/ui/`.
CSS is split into foundation, layout, components, feature styles, responsive
rules, and international typography. `DESIGN.md` explains the visual direction;
`ARCHITECTURE.md` documents module boundaries and contribution rules.

## Localization

There are 26 complete dictionaries in `src/i18n/messages/`: English and all 25
languages present in the extension's `locale/` directory. English stays at the
project root; other languages have their own static routes, such as `/uk/`,
`/ar/`, and `/pt-BR/` beneath the project base path. `locales.ts` explicitly maps
gettext names (`fr_FR`, `pt_BR`, `zh_CN`) to web language tags. Arabic and Persian
use RTL layout. The switcher is native HTML and works without JavaScript.

Edit the named fields in a locale's JSON. English defines the TypeScript
contract; every dictionary must satisfy it. Keep the locale registry aligned
with the extension’s translations and preserve placeholders. To add a language, add its
dictionary, locale entry, and explicit dictionary import. Missing translations
fail checks rather than publishing a mixed-language fallback page. Keep
`{versions}` intact; values are inserted from extension metadata.

Translations cover page content, accessible labels, demo controls, and SEO.
The native screenshot is English and is labeled as such. The translations
have not been reviewed by native speakers; language contributions are welcome.

## Search and loading behavior

Localized titles and descriptions target GNOME Shell dictation and Linux voice
typing, including Wayland/X11 and the OpenRouter requirement. Each route is
self-canonical, lists every alternate plus `x-default`, and appears in the
sitemap. Open Graph, Twitter cards, and SoftwareApplication JSON-LD use the
same content and URLs. No fabricated ratings or keyword-stuffing metadata.
Indexing and ranking depend on search engines and links after deployment.

Pages render all text and layout as static HTML. Only the demo hydrates. Its
controls are present before hydration (temporarily disabled), every button
label has reserved space, and recording hides text without removing its space.
Image dimensions and the desktop aspect ratio are reserved. Fonts use local
subsets with `font-display: optional`; the primary subset is preloaded on
supported scripts. Arabic, Persian, Kannada and CJK use system fonts. There is
no browser-language redirect or post-load replacement of page text.

For browser QA, test cold-cache reloads on English, German, Ukrainian, Arabic
and Kannada pages at 320, 390, 768 and 1280 CSS pixels. Check language-menu
keyboard navigation, RTL, long labels, no-JavaScript content, autoplay, pause/resume and
reduced motion. Record reloads in DevTools Performance and inspect Layout Shift
events; a successful build does not establish a measured CLS score.

The icon and model screenshot reuse the repository's original assets. Astro
optimizes the screenshot to WebP. Supported GNOME versions are read from the
root `metadata.json` at build time, and changes to those assets trigger the
website workflow. Keep product claims aligned with the root README.
