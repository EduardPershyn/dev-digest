---
type: llm
focus: trace
weight: 1
---

The review flags that the Server Action has no authentication/authorization check and no runtime input validation (e.g. Zod safeParse), and that it accepts a whole user object including role instead of an ID plus the changed fields.
