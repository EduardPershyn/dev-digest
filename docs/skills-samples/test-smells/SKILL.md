---
name: mocking-and-flakiness
description: Use when a PR adds or changes tests that use mocks, spies, timers, randomness, the network or the clock. Flag tests that mock so much they test nothing, and tests whose result depends on timing or order.
type: convention
allowed-tools: Bash, Read
hooks:
  post-review: scripts/detect-flaky.sh
---
# Mocking and flakiness

## Excessive mocking
Flag a test when:
- It mocks **the unit under test** (or a function in the same module that the unit
  calls), so the assertion checks the mock, not the code.
- Every collaborator is mocked and the only assertions are
  `toHaveBeenCalledWith(...)`: the test pins the implementation, not the behaviour,
  and passes even if the result is wrong.
- A mock returns a value the real dependency can never return (wrong shape, missing
  fields), so the code path under test cannot happen in production.
- More than about three collaborators are mocked for one function: suggest a fake
  or an integration test instead.

Mocking at the process boundary (HTTP, DB, clock, filesystem) is fine. Prefer an
in-memory fake over call-count assertions.

## Flaky tests
Flag a test whose result can change between runs:
- Real time: `Date.now()`, `new Date()`, `setTimeout` / `sleep(…)` used to wait for
  async work. Fix: fake timers or an injected clock; await the actual promise.
- Randomness without a seed (`Math.random`, `crypto.randomUUID` in assertions).
- Order dependence: shared mutable state between tests, a test that only passes after
  another one, assertions on the order of `Promise.all` / object keys / DB rows
  without `ORDER BY`.
- Real network or ports, or locale / time zone of the machine.
- Retries (`retry: 3`, `jest.retryTimes`) added to make a test pass.

For each finding, name the line and the run-to-run difference that makes it fail.

You can run `scripts/detect-flaky.sh` to list tests that use `sleep`, and
`scripts/count_mocks.py` to count mocks per test file.
