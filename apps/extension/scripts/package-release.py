
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
dist = root / "dist"
release = root / "release"

manifest_file = dist / "manifest.json"

if not manifest_file.is_file():
    raise SystemExit("Build the extension first.")

manifest = json.loads(
    manifest_file.read_text(encoding="utf-8")
)

version = manifest["version"]

required = [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.js",
    "popup.html",
    "popup.css",
]

for filename in required:
    if not (dist / filename).is_file():
        raise SystemExit(f"Missing file: {filename}")

files = sorted(
    path for path in dist.rglob("*")
    if path.is_file()
)

for file in files:
    if file.suffix == ".map":
        raise SystemExit("Source map found in release.")

release.mkdir(parents=True, exist_ok=True)

target = release / f"lumivox-focus-companion-{version}.zip"

with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for file in files:
        # Important: manifest.json must be at ZIP root.
        archive.write(
            file,
            arcname=file.relative_to(dist).as_posix(),
        )

digest = sha256(target.read_bytes()).hexdigest()

print("Release package:", target)
print("SHA256:", digest)

with ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise SystemExit("ZIP integrity check failed.")

    if "manifest.json" not in archive.namelist():
        raise SystemExit("Manifest missing from ZIP root.")

print("Chrome Web Store package verified.")
