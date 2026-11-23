---
type: llm
focus: trace
weight: 1
---

The design implements the mutation as a Server Action ('use server') that validates its input with a Zod schema via safeParse and returns field errors as a value rather than throwing.
