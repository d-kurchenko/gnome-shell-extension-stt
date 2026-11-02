# Visual assets

The mark combines an audio waveform with two lines of text. The main accent is
orange (`#f4773a`); ink (`#243541`) and pale gray (`#f1f4f6`) support it in the
listing artwork. The panel uses the symbolic version and follows the Shell's
foreground color, with orange for recording and amber for transcription.

Files for extensions.gnome.org:

- `branding/icon-128.png` — extension icon, transparent, 128 × 128.
- `branding/listing.png` — overview poster, 3840 × 2880.
- `branding/poster-models.png` — model catalog poster, 3840 × 2880.
- `branding/poster-language.png` — speech language poster, 3840 × 2880.

`branding/icon-512.png` is a larger export of the same icon. The editable icon
masters live in `resources/icons/`. Each poster has a self-contained SVG master
beside its PNG, with the icon and native screenshots embedded. Text and icon
artwork remain vector-based until export. All posters use Cantarell.

Native screenshots in `screenshots/` were rendered at four to six times their
logical size, with an empty API key and isolated settings. They are not enlarged from
the previous PNG exports. The orange accent applies only to the preview app;
the extension follows the user's GTK theme. The language popover uses a separate
native surface and is captured separately for the poster composition.

Regenerate the PNG exports from the repository root with librsvg installed:

```sh
rsvg-convert -w 128 -h 128 -o assets/branding/icon-128.png resources/icons/speech-to-text.svg
rsvg-convert -w 512 -h 512 -o assets/branding/icon-512.png resources/icons/speech-to-text.svg
python3 assets/render-posters.py
```

The website's icon and screenshot are uploaded separately from the extension
ZIP. The runtime bundle contains the two SVG icons, not the listing artwork.

`badges/` contains the README's install, GNOME compatibility, and license badges.
They use the same palette as the posters and link to their destinations from the
README. The supported Shell versions follow `metadata.json`; the license badge
links to `LICENSE`.
