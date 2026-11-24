---
name: api-contract-breaking-changes
description: Use when a PR changes an HTTP route, its handler's request or response, or a schema that describes them. Flag every change an existing client would notice without changing its own code.
type: rubric
---
# API contract breaking changes

Compare the old interface (`-` lines) with the new one (`+` lines). Each item below
is a breaking change for existing clients unless the diff also keeps the old form
working (an alias route, a versioned path, an optional field with the old default):

**Route**
- Path renamed, or a path parameter renamed (`/invoices/:id` → `/invoices/:invoiceId`
  breaks every handler, test and client that reads `params.id`, and any generated
  client or OpenAPI doc).
- HTTP method changed; route removed; route moved behind a new prefix.

**Request**
- A query parameter, header or body field becomes required, or a new required one is
  added.
- A field's type, format or allowed values narrow (string → enum, number → integer,
  max length lowered).
- Validation that used to accept a value now rejects it (status 400 / 422 where it
  was 200).

**Response**
- A field is renamed or removed (`amount` → `amount_cents`), or its type or unit
  changes.
- A field becomes nullable or optional where it was always present.
- Status codes change for the same situation (404 ↔ 200 with `null`, 201 → 200).
- Ordering, pagination or envelope shape changes (`[...]` → `{ items: [...] }`).

How to report:
- One finding per breaking change, citing the changed line. Say which callers break
  and how (old request now fails, or old parsing now reads `undefined`).
- CRITICAL when nothing in the diff versions, aliases or migrates it. Mention the
  non-breaking alternative: keep the old field next to the new one and deprecate it,
  or add `/v2`.
- Purely additive changes (new optional field, new route) are not breaking. Do not
  flag them.
