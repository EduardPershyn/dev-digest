---
name: branch-coverage-gaps
description: Use when a PR adds or changes production code with conditional logic. Map every new branch to a test that reaches it and flag each branch no test in the diff exercises.
type: rubric
---
# Branch coverage gaps

Coverage percentages hide the problem; branches show it. For each production
function the PR adds or changes:

1. **List the branches.** Every `if` / `else`, ternary, `switch` case, `??` / `||`
   fallback, early `return`, `throw`, `catch` block, loop that can run zero times, and
   guard clause (`if (!x) return`).
2. **Find the test that reaches each branch.** A test "reaches" a branch only if its
   input makes that branch run AND it asserts the branch's observable result (return
   value, thrown error, side effect). Calling the function on the happy path does not
   cover its error branches.
3. **Flag every unreached branch** as its own finding, citing the production line of
   the branch. Name the input that would reach it, e.g. "no test calls
   `applyDiscount` with an unknown code, so the `throw` on line 14 is untested".

Rules:
- A happy-path-only test for a function with error handling is a gap, not "basic
  coverage". Say which branches it leaves out.
- An error branch that is tested only with `expect(...).toThrow()` and no message or
  type check is weak: a different error would also pass. WARNING at most.
- Branches whose only effect is logging are SUGGESTION at most.
- If the PR changes a branch condition (`>` → `>=`), the test must pin the value at
  the boundary; otherwise flag it.
