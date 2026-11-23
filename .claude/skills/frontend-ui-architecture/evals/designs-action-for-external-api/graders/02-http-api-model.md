---
type: llm
focus: trace
weight: 1
---

The design calls the Fastify API from server-side code that forwards the user's session cookie (e.g. via cookies() from next/headers) and marks that module server-only or keeps the internal URL out of client code; it does not invent direct database access.
