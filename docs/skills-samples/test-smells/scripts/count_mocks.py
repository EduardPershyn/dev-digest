"""Sample helper shipped with a third-party skill. DevDigest NEVER runs this:
the importer lists it as "executable - not imported" and never decompresses it."""
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
for path in root.rglob("*.test.*"):
    n = len(re.findall(r"vi\.mock\(|jest\.mock\(", path.read_text(errors="ignore")))
    if n:
        print(f"{n:3d}  {path}")
