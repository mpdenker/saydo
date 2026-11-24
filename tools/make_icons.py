#!/usr/bin/env python3
"""Draw the app icon (speech bubble with a check) as PNGs, using only the standard library.

    python3 tools/make_icons.py

Writes icons/icon-180.png (apple-touch-icon), icon-192.png, icon-512.png and
icon-512-maskable.png. Change the colors below to restyle. Shapes are signed
distance functions, so edges are anti-aliased at any size.
"""
import math
import os
import struct
import zlib

TOP = (0x2A, 0x9B, 0xFF)      # background gradient, top
BOTTOM = (0x00, 0x5F, 0xE0)   # background gradient, bottom
BUBBLE = (0xFF, 0xFF, 0xFF)
CHECK = (0x00, 0x6E, 0xF0)


def rounded_rect(px, py, x0, y0, x1, y1, r):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
    dx, dy = abs(px - cx) - hx, abs(py - cy) - hy
    outside = math.hypot(max(dx, 0), max(dy, 0))
    return outside + min(max(dx, dy), 0) - r


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy, wx, wy = bx - ax, by - ay, px - ax, py - ay
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    return math.hypot(wx - t * vx, wy - t * vy)


def triangle(px, py, a, b, c):
    d = min(seg_dist(px, py, *a, *b), seg_dist(px, py, *b, *c), seg_dist(px, py, *c, *a))
    def side(p, q):
        return (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0])
    s1, s2, s3 = side(a, b), side(b, c), side(c, a)
    inside = (s1 >= 0 and s2 >= 0 and s3 >= 0) or (s1 <= 0 and s2 <= 0 and s3 <= 0)
    return -d if inside else d


def bubble(px, py, s):
    # s < 1 shrinks the artwork toward the center (for the maskable safe zone)
    px, py = 0.5 + (px - 0.5) / s, 0.5 + (py - 0.5) / s
    body = rounded_rect(px, py, 0.17, 0.20, 0.83, 0.68, 0.15)
    tail = triangle(px, py, (0.27, 0.60), (0.45, 0.62), (0.24, 0.83))
    return min(body, tail) * s


def check(px, py, s):
    px, py = 0.5 + (px - 0.5) / s, 0.5 + (py - 0.5) / s
    pts = [(0.335, 0.445), (0.45, 0.555), (0.665, 0.335)]
    d = min(seg_dist(px, py, *pts[0], *pts[1]), seg_dist(px, py, *pts[1], *pts[2]))
    return (d - 0.034) * s


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def render(size, scale=1.0):
    aa = 1.0 / size  # one pixel, in unit coordinates
    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter type 0
        for x in range(size):
            px, py = (x + 0.5) / size, (y + 0.5) / size
            color = mix(TOP, BOTTOM, py)
            cov = max(0.0, min(1.0, 0.5 - bubble(px, py, scale) / aa))
            color = mix(color, BUBBLE, cov)
            cov = max(0.0, min(1.0, 0.5 - check(px, py, scale) / aa))
            color = mix(color, CHECK, cov)
            row += bytes(int(round(c)) for c in color)
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))  # 8-bit RGB
    png += chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    for name, size, scale in [
        ('icon-180.png', 180, 1.0),
        ('icon-192.png', 192, 1.0),
        ('icon-512.png', 512, 1.0),
        ('icon-512-maskable.png', 512, 0.8),  # Android crops to a circle; keep art in the safe zone
    ]:
        write_png(os.path.join(out, name), size, render(size, scale))
        print('wrote', name)
