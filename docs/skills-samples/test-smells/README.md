# test-smells

A sample third-party skill used to demo DevDigest's skill import (M2).

It mimics a typical downloaded skill folder: `SKILL.md` with frontmatter that asks for
tools (`allowed-tools`, `hooks`), plus helper scripts. DevDigest imports only the text
of `SKILL.md`; it drops the tool/hook keys and never decompresses or runs the scripts.

Rebuild the archive from this folder with:

    cd docs/skills-samples && rm -f test-smells-skill.zip && zip -r test-smells-skill.zip test-smells
