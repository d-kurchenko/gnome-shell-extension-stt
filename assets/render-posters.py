"""Render self-contained SVG masters and 3840 × 2880 PNG posters with librsvg."""

import base64
from functools import cache
from html import escape
from pathlib import Path
import subprocess


ASSETS = Path(__file__).resolve().parent
PROJECT = ASSETS.parent
OUTPUT = ASSETS / 'branding'
INK = '#243541'
PAPER = '#f1f4f6'
ORANGE = '#f4773a'


@cache
def data_uri(path):
    mime = 'image/svg+xml' if path.suffix == '.svg' else 'image/png'
    return f'data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}'


def image(path, x, y, width, height):
    return (f'<image x="{x}" y="{y}" width="{width}" height="{height}" '
            f'xlink:href="{data_uri(path)}"/>')


def text(value, x, y, size, color=INK, weight=400):
    return (f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" '
            f'font-weight="{weight}">{escape(value)}</text>')


def brand(color=INK):
    return image(PROJECT / 'resources/icons/speech-to-text.svg', 64, 56, 64, 64) + text(
        'Speech to Text', 146, 101, 29, color, 700)


def crop(path, source, destination, source_height=440):
    x, y, width, height = destination
    return (f'<svg x="{x}" y="{y}" width="{width}" height="{height}" '
            f'viewBox="{source}">{image(path, 0, 0, 760, source_height)}</svg>')


def window_shadow(x, y, width, height, radius):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
            f'rx="{radius}" fill="#16242d" filter="url(#shadow)"/>')


def overview():
    header = image(PROJECT / 'resources/icons/speech-to-text.svg', 64, 56, 112, 112)
    header += text('Speech to Text', 208, 120, 58, weight=700)
    header += text('Dictation for GNOME Shell', 210, 165, 28, '#61717c')
    keys = ('<g transform="translate(1038 107)">'
            '<rect width="90" height="44" rx="10" fill="#e5ebef"/>'
            '<rect x="128" width="44" height="44" rx="10" fill="#e5ebef"/>')
    keys += text('Super', 17, 29, 21, weight=600)
    keys += text('+', 103, 29, 21, '#61717c')
    keys += text('Z', 142, 29, 21, weight=600) + '</g>'
    screen = window_shadow(140, 276, 1000, 579, 20)
    screen += '<g clip-path="url(#overview-window)">'
    screen += image(ASSETS / 'screenshots/preferences.png', 140, 276, 1000, 579)
    screen += '</g>'
    return header + keys + screen


def models():
    heading = brand(PAPER)
    heading += text('Choose your', 64, 294, 58, PAPER, 700)
    heading += text('speech model.', 64, 366, 58, PAPER, 700)
    heading += text('Speech recognition models', 66, 452, 25, '#cbd7df')
    heading += text('and LLMs with audio input.', 66, 488, 25, '#cbd7df')
    heading += text('Models from OpenRouter.', 66, 852, 22, '#b3c3cd')
    screen = window_shadow(600, 152, 616, 667.333, 24)
    screen += '<g clip-path="url(#models-dialog)">'
    screen += crop(ASSETS / 'screenshots/models.png', '80 100 600 650', (600, 152, 616, 667.333), source_height=850)
    screen += '</g>'
    return heading + screen


def language():
    heading = brand()
    heading += text('Speak in your language.', 64, 215, 58, weight=700)
    heading += text('Choose automatic detection or set the spoken language.', 66, 270, 27, '#493323')
    heading += text('Set another language', 100, 678, 28, '#493323')
    heading += text('with its two-letter code.', 100, 718, 28, '#493323')
    row = window_shadow(100, 386, 1080, 107.234, 20)
    row += '<g clip-path="url(#language-row)">'
    row += crop(ASSETS / 'screenshots/language.png', '98 249 564 56', (100, 386, 1080, 107.234))
    row += '</g>'
    # Popovers use a separate native surface. Position its snapshot over the row.
    row += image(ASSETS / 'screenshots/language-menu.png', 783, 453, 406, 478.774)
    return heading + row


def render(name, title, background, content):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="3840" height="2880" viewBox="0 0 1280 960">
  <title>{escape(title)}</title>
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="22"/>
      <feOffset dy="18"/>
      <feComponentTransfer><feFuncA type="linear" slope=".2"/></feComponentTransfer>
    </filter>
    <clipPath id="overview-window"><rect x="140" y="276" width="1000" height="579" rx="20"/></clipPath>
    <clipPath id="models-dialog"><rect x="600" y="152" width="616" height="667.333" rx="24"/></clipPath>
    <clipPath id="language-row"><rect x="100" y="386" width="1080" height="107.234" rx="20"/></clipPath>
  </defs>
  <rect width="1280" height="960" fill="{background}"/>
  <g font-family="Cantarell, sans-serif">{content}</g>
</svg>
'''
    source = OUTPUT / f'{name}.svg'
    source.write_text(svg)
    subprocess.run(['rsvg-convert', '-o', str(source.with_suffix('.png')), str(source)], check=True)
    print(f'{name}.png — 3840 × 2880')


if __name__ == '__main__':
    render('listing', 'Speech to Text — Dictation for GNOME Shell', PAPER, overview())
    render('poster-models', 'Speech to Text — Choose your speech model', INK, models())
    render('poster-language', 'Speech to Text — Speak in your language', ORANGE, language())
