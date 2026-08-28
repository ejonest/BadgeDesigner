"""Build the wood-specific product photos used by the gavel choice cards.

The source photography lives in app/temp/gavelImages/ImagesToUse. This script
uses rembg for object isolation because two of the supplied photos have real
room/table backgrounds rather than a white studio sweep.

isnet-general-use rather than u2net: the standard gavel-and-block photo is lit
so warmly that the handle is nearly the same colour as the table behind it, and
u2net dissolved the lower half of the handle into the background.

One-time setup:
  python3.12 -m venv /tmp/gavel-rembg
  /tmp/gavel-rembg/bin/pip install rembg==2.0.67 --no-deps
  /tmp/gavel-rembg/bin/pip install onnxruntime pillow numpy==2.2.6 \
    opencv-python-headless pooch jsonschema scipy tqdm scikit-image
  /tmp/gavel-rembg/bin/pip install llvmlite==0.44.0 numba==0.61.2 \
    --only-binary=:all:
  /tmp/gavel-rembg/bin/pip install pymatting --no-deps

Build:
  /tmp/gavel-rembg/bin/python scripts/build-gavel-choice-images.py
"""

from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rembg import new_session, remove


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/temp/gavelImages/ImagesToUse"
OUTPUT = ROOT / "public/images/gavel/options"
MAX_SIZE = (900, 560)
MODEL = "isnet-general-use"

JOBS = {
    "WalnutGavel.jpg": "walnut-gavel.png",
    "WalnutWithBlock.jpg": "walnut-block.png",
    "WalnutPersonalBlock.jpg": "walnut-personalized-block.png",
    "StandardGavel.jpg": "rubberwood-gavel.png",
    "StandardGavelWithBlock.jpg": "rubberwood-block.png",
    "StandardGavelPersonalBlock.jpg": "rubberwood-personalized-block.png",
    "EbonyGavel.jpg": "ebony-gavel.png",
    "EbonyWithBlock.jpg": "ebony-block.png",
}


ENGRAVED_FILL = (26, 17, 12, 205)
ENGRAVED_STROKE = (72, 46, 31, 90)
NAME_LINE = "YOUR NAME"
AWARD_LINE = "AWARD OF EXCELLENCE"
# Share of the face width each line is allowed to cover.
NAME_WIDTH = 0.72
AWARD_WIDTH = 0.70
# The flat art is drawn oversized and shrunk by the perspective map.
SUPERSAMPLE = 2

# Corners of each block's flat engravable face, in reading order (start of the
# first line, end of the first line, end of the last line, start of the last
# line). Measured inside the border molding, in SOURCE photo pixels: the source
# never changes, so these survive a different cutout model or trim than the
# output-space coordinates they replaced.
ENGRAVING_FACES = {
    "WalnutPersonalBlock.jpg": ((948, 312), (1877, 933), (1241, 1844), (312, 1223)),
    "StandardGavelPersonalBlock.jpg": ((325, 580), (785, 578), (782, 878), (308, 880)),
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
        if bold
        else "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
    )
    try:
        return ImageFont.truetype(names, size=size)
    except OSError:
        return ImageFont.load_default(size=size)


def fit_font(
    draw: ImageDraw.ImageDraw, text: str, target: float, bold: bool
) -> ImageFont.FreeTypeFont:
    """Largest font size whose rendered line stays within target pixels wide."""
    chosen = font(6, bold)
    for size in range(6, 200):
        candidate = font(size, bold)
        left, _, right, _ = draw.textbbox((0, 0), text, font=candidate)
        if right - left > target:
            break
        chosen = candidate
    return chosen


def perspective_coeffs(
    destination: tuple[tuple[float, float], ...],
    source: tuple[tuple[float, float], ...],
) -> list[float]:
    """Coefficients for Image.transform, which samples source per output pixel."""
    rows = []
    values = []
    for (dx, dy), (sx, sy) in zip(destination, source):
        rows.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        rows.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        values.extend((sx, sy))
    return np.linalg.solve(np.array(rows, dtype=float), np.array(values)).tolist()


class SourceToOutput:
    """Maps a point in the source photo to the trimmed, resized output."""

    def __init__(self, left: int, top: int, scale: float) -> None:
        self.left = left
        self.top = top
        self.scale = scale

    def __call__(self, point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return ((x - self.left) * self.scale, (y - self.top) * self.scale)


def add_personalization(
    image: Image.Image, source_name: str, to_output: SourceToOutput
) -> Image.Image:
    """Lay a sample engraving flat onto the block's top face."""
    source_face = ENGRAVING_FACES.get(source_name)
    if source_face is None:
        return image

    face = tuple(to_output(corner) for corner in source_face)
    top_left, top_right, bottom_right, bottom_left = (
        np.array(corner, dtype=float) for corner in face
    )
    # Average the opposing edges so a slight perspective taper cannot skew the
    # flat canvas the text is laid out in.
    width = (
        np.linalg.norm(top_right - top_left)
        + np.linalg.norm(bottom_right - bottom_left)
    ) / 2
    height = (
        np.linalg.norm(bottom_left - top_left)
        + np.linalg.norm(bottom_right - top_right)
    ) / 2

    flat_w = round(width * SUPERSAMPLE)
    flat_h = round(height * SUPERSAMPLE)
    art = Image.new("RGBA", (flat_w, flat_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(art)

    name_font = fit_font(draw, NAME_LINE, flat_w * NAME_WIDTH, True)
    award_font = fit_font(draw, AWARD_LINE, flat_w * AWARD_WIDTH, False)
    name_box = draw.textbbox((0, 0), NAME_LINE, font=name_font)
    award_box = draw.textbbox((0, 0), AWARD_LINE, font=award_font)
    name_h = name_box[3] - name_box[1]
    award_h = award_box[3] - award_box[1]
    gap = award_h * 1.05
    top = (flat_h - (name_h + gap + award_h)) / 2

    for text, line_font, centre_y in (
        (NAME_LINE, name_font, top + name_h / 2),
        (AWARD_LINE, award_font, top + name_h + gap + award_h / 2),
    ):
        draw.text(
            (flat_w / 2, centre_y),
            text,
            font=line_font,
            fill=ENGRAVED_FILL,
            anchor="mm",
            stroke_width=SUPERSAMPLE,
            stroke_fill=ENGRAVED_STROKE,
        )

    coeffs = perspective_coeffs(
        face,
        ((0, 0), (flat_w, 0), (flat_w, flat_h), (0, flat_h)),
    )
    placed = art.transform(
        image.size,
        Image.Transform.PERSPECTIVE,
        coeffs,
        resample=Image.Resampling.BICUBIC,
    )
    image.alpha_composite(placed)
    return image


def trim_and_size(image: Image.Image) -> tuple[Image.Image, SourceToOutput]:
    alpha = image.getchannel("A")
    bounds = alpha.point(lambda a: 255 if a >= 12 else 0).getbbox()
    left, top = 0, 0
    if bounds:
        left, top, right, bottom = bounds
        pad = round(max(right - left, bottom - top) * 0.035)
        left = max(0, left - pad)
        top = max(0, top - pad)
        bounds = (
            left,
            top,
            min(image.width, right + pad),
            min(image.height, bottom + pad),
        )
        image = image.crop(bounds)
    cropped_width = image.width
    image.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
    return image, SourceToOutput(left, top, image.width / cropped_width)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    session = new_session(MODEL)
    for source_name, output_name in JOBS.items():
        source_path = SOURCE / source_name
        result = remove(source_path.read_bytes(), session=session)
        product = Image.open(BytesIO(result)).convert("RGBA")
        product, to_output = trim_and_size(product)
        product = add_personalization(product, source_name, to_output)
        destination = OUTPUT / output_name
        product.save(destination, "PNG", optimize=True)
        print(f"{source_name} -> {destination.relative_to(ROOT)} {product.size}")


if __name__ == "__main__":
    main()
