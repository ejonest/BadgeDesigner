#!/usr/bin/env python3
"""
Composite a generative L-outpaint corner into a plate-bleed PNG.

Only writable pixels (bleed pad + exterior crescents outside the rounded die)
receive generative art. The rounded-die face interior stays byte-identical to
the plate-bleed base.

Usage:
  .venv-bleed/bin/python scripts/composite-bleed-outpaint.py \\
    --base public/badge-custom-backgrounds/Coffee-Shop-Café-Badges-Chill-(1x3)-bleed.png \\
    --gen path/to/L-outpaint.png \\
    --src-l "app/temp/Color Custom Badges/bleed-outpaint-qa/_chill-L-outpaint-src.png" \\
    --out "app/temp/Color Custom Badges/bleed-outpaint-qa/Coffee-Shop-Café-Badges-Chill-(1x3)-bleed.png" \\
    --pad 22 --radius 72 --face-crop 180 --margin 48 --plate 71,57,54
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def parse_rgb(s: str) -> np.ndarray:
    parts = [int(x.strip()) for x in s.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("plate must be R,G,B")
    return np.array(parts, dtype=np.float64)


def rounded_inside(face_h: int, face_w: int, radius: int) -> np.ndarray:
    yy, xx = np.mgrid[0:face_h, 0:face_w]
    r = min(radius, min(face_w, face_h) // 2)
    inside = np.ones((face_h, face_w), dtype=bool)
    corners = [
        ((xx < r) & (yy < r), r, r),
        ((xx >= face_w - r) & (yy < r), face_w - 1 - r, r),
        ((xx < r) & (yy >= face_h - r), r, face_h - 1 - r),
        ((xx >= face_w - r) & (yy >= face_h - r), face_w - 1 - r, face_h - 1 - r),
    ]
    for cond, cx, cy in corners:
        inside[cond] = (xx[cond] - cx) ** 2 + (yy[cond] - cy) ** 2 <= r * r
    return inside


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, type=Path)
    ap.add_argument("--gen", required=True, type=Path)
    ap.add_argument("--src-l", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--also-public", type=Path, default=None)
    ap.add_argument("--pad", type=int, default=22)
    ap.add_argument("--radius", type=int, default=72)
    ap.add_argument("--face-crop", type=int, default=180)
    ap.add_argument("--margin", type=int, default=48)
    ap.add_argument("--plate", type=parse_rgb, default=parse_rgb("71,57,54"))
    ap.add_argument("--art-dist", type=float, default=28.0)
    args = ap.parse_args()

    base = np.array(Image.open(args.base).convert("RGBA"))
    gen = np.array(Image.open(args.gen).convert("RGBA"))
    src_l = np.array(Image.open(args.src_l).convert("RGBA"))
    h, w = base.shape[:2]
    pad = args.pad
    face_crop = args.face_crop
    margin = args.margin
    plate = args.plate

    face_w, face_h = w - 2 * pad, h - 2 * pad
    inside = rounded_inside(face_h, face_w, args.radius)

    writable = np.zeros((h, w), dtype=bool)
    writable[:pad, :] = True
    writable[h - pad :, :] = True
    writable[:, :pad] = True
    writable[:, w - pad :] = True
    writable[pad : h - pad, pad : w - pad] |= ~inside

    ch, cw = src_l.shape[:2]
    aligned = np.array(
        Image.fromarray(gen).resize((cw, ch), Image.Resampling.LANCZOS)
    )

    x_face0 = w - pad - face_crop
    y_face0 = pad
    out = base.copy()
    art_n = 0
    for ly in range(ch):
        for lx in range(cw):
            ay = y_face0 + (ly - margin)
            ax = x_face0 + lx
            if ax < 0 or ay < 0 or ax >= w or ay >= h:
                continue
            if not writable[ay, ax]:
                continue
            pix = aligned[ly, lx]
            if np.linalg.norm(pix[:3].astype(float) - plate) >= args.art_dist:
                out[ay, ax] = pix
                art_n += 1

    face_keep = np.zeros((h, w), dtype=bool)
    face_keep[pad : h - pad, pad : w - pad] = inside
    out[face_keep] = base[face_keep]
    identical = not np.any(out[face_keep] != base[face_keep])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out).save(args.out)
    if args.also_public:
        args.also_public.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(out).save(args.also_public)

    top_art = (
        np.linalg.norm(out[:pad, w - 120 : w, :3].astype(float) - plate, axis=2)
        >= args.art_dist
    ).sum()
    right_art = (
        np.linalg.norm(out[:120, w - pad :, :3].astype(float) - plate, axis=2)
        >= args.art_dist
    ).sum()
    print(
        f"OK {args.out.name}: art_pasted={art_n}, face_identical={identical}, "
        f"top_pad_art={top_art}, right_pad_art={right_art}"
    )


if __name__ == "__main__":
    main()
