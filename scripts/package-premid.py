"""Package the PreMiD source folder for the extension's manual source loader."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
source = root / "premid" / "OPwatch"
output = root / "watch" / "discord" / "opwatch-premid.zip"
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for name in ("metadata.json", "presence.ts", "iframe.ts", "README.md"):
        info = ZipInfo(f"OPwatch/{name}", date_time=(2026, 11, 5, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (source / name).read_bytes())
print(output)
