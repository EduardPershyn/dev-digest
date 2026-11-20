# docs/ — cross-module documentation

Documentation that spans more than one package. Package-specific docs live in
`<package>/README.md` (entry point) and `<package>/docs/` (deeper material).

| Doc | Read when |
|-----|-----------|
| [`architecture.md`](architecture.md) | changing how packages interact, or the end-to-end review flow |
| [`agent-prompts/`](agent-prompts/README.md) | writing or changing a reviewer agent's system prompt |

Related: [`../README.md`](../README.md) (overview, quick start) ·
[`../TESTING.md`](../TESTING.md) (test strategy) · [`../specs/`](../specs/README.md) (planned work).

**Rule:** docs describe how things *are*. Planned or in-progress work belongs in `specs/`.
