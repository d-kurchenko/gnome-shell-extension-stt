# Architecture

The website uses feature-based modules on Astro's islands architecture. Most
of the page is generated HTML. Vue is used where there is interactive state;
VueUse owns lifecycle-aware browser effects. No global client store or router
is needed for a static product site. The single Vue component is the working
desktop demonstration, not starter scaffolding. Static sections stay in Astro;
replacing that island with a browser script would also be possible but would
remove the Vue/VueUse boundary chosen for this project.

## Responsibilities

- `src/pages/` contains route adapters: one localized landing-page route,
  robots.txt, and the sitemap. Routes assemble modules and generate URLs.
- `src/layouts/` owns the document, header, footer, and page-level composition.
- `src/sections/` owns the product story. Sections receive typed copy; repeated
  steps, features, and answers render from data rather than repeated markup.
- `src/features/` owns interactive behavior and its presentation. The
  dictation demo separates Vue rendering from `useDictationDemo`, its explicit
  idle → recording → transcribing → complete → recording loop. Playback
  starts after hydration and suspends in hidden tabs. A user pause survives tab
  visibility changes. Reduced motion disables autoplay but allows one explicit play. The language
  switcher uses HTML links and disclosure, so it does not need a Vue island.
- `src/shared/` holds reusable UI, site configuration, and SEO metadata.
- `src/i18n/` owns the locale registry, URL functions, message contract, and
  complete JSON dictionaries. Import message types with `import type` in client
  code: the catalog must stay out of the browser bundle.
- `src/styles/` defines cascade layers in one place. Feature styles stay beside
  their feature. Responsive rules are explicit; RTL overrides and script
  typography live in `international.css`.

Sections may use features and shared UI. Features may use shared code and
message types; shared UI does not import sections or feature behavior. Keep
build-time product data and dictionaries out of client runtime imports.

## One source of truth

`shared/config/site.ts` reads the product identity and supported versions from
the extension metadata, then supplies public URLs to Astro, SEO, links, and
the sitemap. `i18n/routing.ts` owns locale paths; do not concatenate locale paths
in components. English uses the existing root URL to avoid a redundant `/en/`.

`messages/en.json` defines the message contract. Each dictionary is checked by
TypeScript. No translated markup is inserted as HTML: values are
escaped normally by Astro and Vue. Placeholder substitution is explicit and
limited to supported GNOME versions.

## Stable first render

Server HTML and Vue's initial state agree. Controls are always rendered and
only their disabled state changes at mount. Transcripts retain their geometry
while recording. A grid reserves the largest translated button label. The
desktop and screenshot have reserved dimensions. Local fonts are preloaded
when applicable and never swap in late. Language selection is explicit URL
navigation rather than a post-hydration locale switch.

## Contributions and checks

Run commands from `website/`. Follow the repository’s four-space indentation
and keep functions separated by blank lines. No formatter is required.

```sh
bun run check
bun run build
```

CI checks Astro/Vue/TypeScript diagnostics and builds every language before
publishing. When changing translations, keep all dictionaries complete and
preserve placeholders. Browser checks remain useful for visual layout, actual
CLS, keyboard interaction, and reduced-motion behavior.

The website package and build output remain isolated from the extension's GJS
runtime. Do not import website dependencies into extension source files.
