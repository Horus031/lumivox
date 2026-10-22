
from pathlib import Path
from PIL import Image, ImageOps

source = Path("apps/web/public/logo.png")
destination = Path("apps/extension/public/icons")
destination.mkdir(parents=True, exist_ok=True)

logo = Image.open(source).convert("RGBA")

canvas = Image.new(
    "RGBA",
    (128, 128),
    (0, 0, 0, 0),
)

artwork = ImageOps.contain(
    logo,
    (112, 112),
    Image.Resampling.LANCZOS,
)

canvas.alpha_composite(
    artwork,
    (
        (128 - artwork.width) // 2,
        (128 - artwork.height) // 2,
    ),
)

for size in (16, 32, 48, 128):
    resized = canvas.resize(
        (size, size),
        Image.Resampling.LANCZOS,
    )

    resized.save(
        destination / f"icon-{size}.png",
    )
