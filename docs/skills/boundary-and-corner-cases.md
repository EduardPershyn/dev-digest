---
name: boundary-and-corner-cases
description: Use when a PR adds tests for code that takes numbers, strings, collections, dates or optional values. Check that the tests pin the boundaries and corner cases where that code typically breaks.
type: rubric
---
# Boundary and corner cases

For each input of the code under test, check the tests in the diff for the values
below. Flag the missing ones that the production code actually treats differently
(name the input and what would go wrong). Do not demand cases the code cannot
receive.

| Input kind | Values a test should pin |
|---|---|
| Numbers | `0`, `-1` / negatives, the exact limit and limit ± 1 (`100`, `101` for a percentage), `NaN`, very large values, non-integers where integers are assumed |
| Money / rounding | values that round differently (`0.005`), totals that go below zero, currency with no minor unit |
| Strings | `''`, whitespace only, mixed case when matching is case-sensitive, Unicode / emoji, very long input |
| Collections | empty, one element, duplicates, unsorted input when order matters |
| Optional / nullable | `undefined` vs `null` vs missing key, and the default that applies |
| Dates / time | month and year ends, leap day, DST change, time zones other than UTC |
| Async / I/O | the call rejects, times out, or resolves empty |

Rules:
- One finding per function, listing its missing boundaries, not one finding per
  missing value.
- A boundary the production code explicitly handles (a clamp, a guard, a special
  case) but no test pins is WARNING. A boundary the code does not handle and that
  can occur in production is a bug: flag it and say what the code does today.
- Table-driven tests (`it.each`) are the preferred fix; suggest one.
