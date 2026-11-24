#!/usr/bin/env bash
# Sample helper shipped with a third-party skill. DevDigest NEVER runs this:
# the importer lists it as "executable — not imported" and never decompresses it.
set -euo pipefail
grep -rnE "sleep\(|setTimeout\(" "${1:-.}" --include='*.test.*' || true
