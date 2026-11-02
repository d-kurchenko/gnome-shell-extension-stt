# Speech to Text website

The audience is GNOME users discovering dictation. The main task is to understand
the recording workflow, then install the extension and configure OpenRouter.

Palette: cloud #f1f4f6, paper #ffffff, ink #243541, orange #f4773a,
deep orange #a83e13, lavender #dcd9f2. Orange comes from the existing icon.
Manrope variable is the display and reading face for supported scripts. The
GNOME demonstration uses the system UI face. Fonts are self-hosted with optional
display; Arabic, Persian, Kannada and CJK use the installed system font stack.

The desktop is the defining visual: an interactive, explicitly illustrative
GNOME recording demonstration alongside a large headline aligned to the reading
direction. The
rest of the page stays quiet: a shortcut walkthrough, actual native model
settings, setup steps, and practical answers. Avoid generic feature-card grids,
decorative badges, simulated testimonials, and invented usage numbers.

    brand                 navigation / install
    large headline        interactive GNOME desktop
    install / demo        recording → pasted note
    supported GNOME / open source / OpenRouter requirement
    shortcut workflow     native model screenshot
    installation steps    requirements
    questions             source / issues

Review: keep the established orange rather than adding a fashionable neon
accent. Use a native desktop scene rather than an abstract audio illustration:
it explains why this is a GNOME extension. Loop the desktop demo automatically, with a visible pause control and time
to read the completed transcript. Pause hidden tabs, honor reduced-motion
preferences, and retain a static no-JS explanation.

Astro owns the static page; the demo is a Vue island hydrated when visible.
VueUse provides lifecycle-aware timers and the reduced-motion media preference.
