#!/usr/bin/env python3
"""Draws the app icons (SVG) and rasterizes them with rsvg-convert."""
import math
import os
import subprocess

ROOT = os.path.join(os.path.dirname(__file__), '..', 'web', 'iconos')
ZONES = ['#57d18c', '#c4dd4f', '#ffc23d', '#ff7a1a', '#ff3d3d']
EDGES = [20, 55, 70, 85, 100, 130]


def angle(v):
    return 150 + 240 * (v - 20) / 110


def pt(r, a):
    rad = math.radians(a)
    return r * math.cos(rad), r * math.sin(rad)


def arc(r, a0, a1):
    x0, y0 = pt(r, a0)
    x1, y1 = pt(r, a1)
    large = 1 if a1 - a0 > 180 else 0
    return f'M{x0:.2f} {y0:.2f}A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}'


def gauge(scale):
    parts = []
    for i, color in enumerate(ZONES):
        a0 = angle(EDGES[i]) + (2.2 if i else 0)
        a1 = angle(EDGES[i + 1]) - (2.2 if i < 4 else 0)
        parts.append(f'<path d="{arc(150, a0, a1)}" stroke="{color}" stroke-width="40" fill="none"/>')
    nx, ny = pt(172, angle(92))
    parts.append(f'<line x1="0" y1="0" x2="{nx:.2f}" y2="{ny:.2f}" stroke="#f7f0e5" stroke-width="15" stroke-linecap="round"/>')
    parts.append('<circle r="26" fill="#ff7a1a"/><circle r="9" fill="#0f0e0c"/>')
    return f'<g transform="translate(256 292) scale({scale})">{"".join(parts)}</g>'


BG = ('<defs><radialGradient id="bg" cx="50%" cy="30%" r="80%">'
      '<stop offset="0" stop-color="#2b231b"/><stop offset="1" stop-color="#0f0e0c"/>'
      '</radialGradient></defs>')

icon = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{BG}'
        f'<rect width="512" height="512" rx="116" fill="url(#bg)"/>{gauge(1)}</svg>')
# Maskable: full bleed, drawing inside the central 80% so launcher masks never cut it.
maskable = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{BG}'
            f'<rect width="512" height="512" fill="url(#bg)"/>'
            f'<g transform="translate(256 256) scale(.74) translate(-256 -256)">{gauge(1)}</g></svg>')
og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">{BG}'
      f'<rect width="1200" height="630" fill="url(#bg)"/>'
      f'<g transform="translate(344 40) scale(1.1)">{gauge(1)}</g></svg>')

os.makedirs(ROOT, exist_ok=True)
for name, svg in [('icon.svg', icon), ('icon-maskable.svg', maskable), ('og.svg', og)]:
    with open(os.path.join(ROOT, name), 'w') as f:
        f.write(svg)


def render(src, out, w, h=None):
    subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h or w), '-o',
                    os.path.join(ROOT, out), os.path.join(ROOT, src)], check=True)


render('icon.svg', 'icon-192.png', 192)
render('icon.svg', 'icon-512.png', 512)
render('icon-maskable.svg', 'icon-maskable-512.png', 512)
render('icon-maskable.svg', 'apple-touch-icon.png', 180)
render('og.svg', 'og.png', 1200, 630)
os.remove(os.path.join(ROOT, 'og.svg'))
print('ok')
