#!/usr/bin/env python3
"""
Generate Praxio app icon + DMG background.

Outputs:
  electron/build/icon.png            (1024x1024 master)
  electron/build/icon.iconset/*.png  (Apple multi-resolution set)
  electron/build/background.png      (540x380 DMG window backdrop)
  electron/build/background@2x.png   (1080x760 retina)

Icon design:
  - Rounded-rectangle squircle in Praxio brand gradient (#0D9488 -> #4338CA).
  - White "P" wordmark centered, geometric sans-serif weight.
  - Subtle inner highlight ring for depth.

DMG background:
  - Soft light-teal gradient with thin centered "PRAXIO" wordmark.
  - Hint arrow between drop target and /Applications shortcut.

Run from repo root:
  python3 scripts/generate-praxio-brand-assets.py
Then:
  iconutil -c icns electron/build/icon.iconset -o electron/build/icon.icns
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = REPO_ROOT / "electron" / "build"
ICONSET_DIR = BUILD_DIR / "icon.iconset"

PRIMARY = (13, 148, 136)      # #0D9488 teal
SECONDARY = (67, 56, 202)     # #4338CA indigo
WHITE = (255, 255, 255)


def _macos_font(size: int) -> ImageFont.FreeTypeFont:
    """Pick a system font that ships on macOS; falls back to default."""
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _diagonal_gradient(size: int) -> Image.Image:
    """Make a 135deg gradient from PRIMARY (top-left) to SECONDARY (bottom-right)."""
    img = Image.new("RGB", (size, size), PRIMARY)
    px = img.load()
    # Project each pixel onto the diagonal direction, normalize, lerp.
    max_d = (size - 1) * 2
    for y in range(size):
        for x in range(size):
            t = (x + y) / max_d
            r = int(PRIMARY[0] + (SECONDARY[0] - PRIMARY[0]) * t)
            g = int(PRIMARY[1] + (SECONDARY[1] - PRIMARY[1]) * t)
            b = int(PRIMARY[2] + (SECONDARY[2] - PRIMARY[2]) * t)
            px[x, y] = (r, g, b)
    return img


def _squircle_mask(size: int, corner: float) -> Image.Image:
    """Apple-style rounded-rectangle mask, alpha 0/255."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(corner), fill=255)
    return mask


def build_master_icon(size: int = 1024) -> Image.Image:
    gradient = _diagonal_gradient(size)
    # Apple's macOS icon corner radius is ~22.37% of the icon size.
    mask = _squircle_mask(size, size * 0.2237)
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(gradient, (0, 0), mask)

    # Subtle inner highlight ring (very faint, gives depth).
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    inset = int(size * 0.06)
    overlay_draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=int((size - 2 * inset) * 0.2237),
        outline=(255, 255, 255, 38),
        width=max(2, size // 256),
    )
    icon.alpha_composite(overlay)

    # "P" wordmark.
    font_size = int(size * 0.62)
    font = _macos_font(font_size)
    text_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    text_draw = ImageDraw.Draw(text_layer)
    bbox = text_draw.textbbox((0, 0), "P", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # textbbox can include left bearing; compensate so the glyph is visually centered.
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1] - int(size * 0.015)
    # Soft shadow for legibility on the gradient.
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((tx, ty + int(size * 0.01)), "P", font=font, fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.008))
    icon.alpha_composite(shadow)
    text_draw.text((tx, ty), "P", font=font, fill=WHITE)
    icon.alpha_composite(text_layer)

    return icon


def write_iconset(master: Image.Image) -> None:
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)
    # Apple-required sizes for iconutil.
    spec = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]
    for size, name in spec:
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(ICONSET_DIR / name, "PNG")


def build_dmg_background(width: int, height: int) -> Image.Image:
    # Soft horizontal gradient: very light teal -> very light indigo.
    img = Image.new("RGB", (width, height), (245, 250, 252))
    px = img.load()
    light_left = (235, 247, 246)   # near-white teal
    light_right = (240, 240, 252)  # near-white indigo
    for x in range(width):
        t = x / (width - 1)
        r = int(light_left[0] + (light_right[0] - light_left[0]) * t)
        g = int(light_left[1] + (light_right[1] - light_left[1]) * t)
        b = int(light_left[2] + (light_right[2] - light_left[2]) * t)
        for y in range(height):
            px[x, y] = (r, g, b)

    draw = ImageDraw.Draw(img)
    # Centered "PRAXIO" wordmark — thin, subtle, doesn't fight icons.
    wm_font = _macos_font(int(height * 0.085))
    wm_text = "PRAXIO"
    wm_bbox = draw.textbbox((0, 0), wm_text, font=wm_font)
    wm_w = wm_bbox[2] - wm_bbox[0]
    wm_h = wm_bbox[3] - wm_bbox[1]
    wm_x = (width - wm_w) // 2 - wm_bbox[0]
    wm_y = int(height * 0.10) - wm_bbox[1]
    draw.text((wm_x, wm_y), wm_text, font=wm_font, fill=(80, 88, 120))

    # Tagline.
    tag_font = _macos_font(int(height * 0.035))
    tag = "Drag to Applications to install"
    tag_bbox = draw.textbbox((0, 0), tag, font=tag_font)
    tag_w = tag_bbox[2] - tag_bbox[0]
    tag_x = (width - tag_w) // 2 - tag_bbox[0]
    tag_y = int(height * 0.22) - tag_bbox[1]
    draw.text((tag_x, tag_y), tag, font=tag_font, fill=(120, 128, 150))

    # Hint arrow centered between drop slots at y=220 (matches dmg.contents).
    # Slot x: 130 and 410 in 540-wide; scale by width/540.
    scale = width / 540.0
    arrow_y = int(220 * (height / 380.0))
    arrow_color = (160, 168, 190)
    line_start = int(190 * scale)
    line_end = int(350 * scale)
    line_thickness = max(2, int(3 * scale))
    draw.line(
        [(line_start, arrow_y), (line_end, arrow_y)],
        fill=arrow_color,
        width=line_thickness,
    )
    head = int(14 * scale)
    draw.polygon(
        [
            (line_end, arrow_y),
            (line_end - head, arrow_y - head // 2),
            (line_end - head, arrow_y + head // 2),
        ],
        fill=arrow_color,
    )
    return img


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    master = build_master_icon(1024)
    master.save(BUILD_DIR / "icon.png", "PNG")

    write_iconset(master)

    bg = build_dmg_background(540, 380)
    bg.save(BUILD_DIR / "background.png", "PNG")
    bg2 = build_dmg_background(1080, 760)
    bg2.save(BUILD_DIR / "background@2x.png", "PNG")

    print(f"Wrote master icon, iconset, and DMG backgrounds to {BUILD_DIR}")


if __name__ == "__main__":
    main()
