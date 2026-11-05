"""Compile and package an importable PreMiD activity ZIP (Node.js 22.13+)."""
import json
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
output = root / "watch" / "discord" / "opwatch-premid.zip"
files = json.loads(subprocess.check_output(
    ["node", str(root / "scripts" / "build-premid.cjs")], cwd=root, text=True,
))
assert set(files) == {"metadata.json", "presence.js", "iframe.js"}
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for name, content in files.items():
        # PreMiD's compiled loader expects these files at the ZIP root.
        info = ZipInfo(name, date_time=(2026, 11, 5, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, content.encode("utf-8"))
print(output)
