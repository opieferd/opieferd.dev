"""Compile and package an importable PreMiD activity ZIP (run npm ci --prefix premid first)."""
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

# Source-only contribution archive; copy this tree into a PreMiD fork.
source = root / "premid" / "websites" / "O" / "OPwatch"
source_output = root / "watch" / "discord" / "opwatch-premid-source.zip"
with ZipFile(source_output, "w", compression=ZIP_DEFLATED) as archive:
    for name in ("metadata.json", "presence.ts", "iframe.ts", "presence.test.ts", "tsconfig.json"):
        info = ZipInfo(f"websites/O/OPwatch/{name}", date_time=(2026, 11, 5, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (source / name).read_bytes())
print(source_output)
