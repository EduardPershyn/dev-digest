# Intent layer: classify + review flow

How a PR's intent is derived and then used by a review (M3). This page explains the flow;
routes, caps, link policy, `missing_context` reasons, logging fields and defaults are in
[`../README.md`](../README.md#intent-layer-m3), and the prompt/scope mechanics in
[`../../reviewer-core/README.md`](../../reviewer-core/README.md).

One `IntentService` instance (`Container.intentService`) serves both the intent routes
(`modules/intent/routes.ts`) and the review pre-work (through the reviews module's
`IntentProvider` port). Concurrent classifications of one PR share one in-flight promise.

```mermaid
sequenceDiagram
  participant UI as client (IntentCard / PR page)
  participant IR as modules/intent/routes.ts
  participant RR as modules/reviews/routes.ts
  participant EX as ReviewRunExecutor
  participant IS as IntentService
  participant GH as GitHub (getIssue / getFileContent)
  participant LLM as review_intent model (OpenRouter)
  participant DB as pr_intent table
  participant RC as reviewer-core reviewPullRequest

  UI->>IR: POST /pulls/:id/intent/classify
  IR->>IS: classify(trigger manual)
  IS->>GH: same-repo linked docs (max 10, sequential)
  IS->>LLM: completeStructured (title, body, docs, paths + hunk headers)
  IS->>DB: upsert intent (head sha + input hash)
  IR-->>UI: PrIntentRecord (stale computed on read)

  UI->>RR: POST /pulls/:id/review
  RR->>EX: execute (fire-and-forget)
  EX->>IS: forReview(pull, repo, diff)
  alt stored intent ok and not stale
    IS->>DB: read (reused)
  else missing, stale or failed
    IS->>GH: linked docs
    IS->>LLM: completeStructured
    IS->>DB: upsert (classified)
  end
  Note over IS,EX: any error returns status failed, never throws
  IS-->>EX: intent block or null
  loop each agent run
    EX->>RC: review (intent block when present)
    RC->>RC: ground findings, then applyIntentScope
    RC-->>EX: findings, scope (hidden, collapsedCount)
    EX->>DB: save findings + trace (intent, scope_filter)
  end
```

Rendering of the diagram was not checked locally.

## Design notes

- **Failure never blocks a review.** `forReview` converts every error into
  `{ status: 'failed', reason }`; each agent then runs with no intent, so the prompt and
  findings equal the pre-M3 ones. The manual route surfaces the same failure as a 502.
- **Scope never waives a critical defect.** Out-of-scope CRITICAL findings are collapsed
  into one `scope_notice` instead of being hidden, because the intent is derived from
  untrusted author text.
- **Known gap.** Staleness covers the PR's own head sha, title, body and base only. Edits to
  linked issues or docs after classification are not detected.
- **Not yet exercised.** The e2e flow `e2e/specs/10-intent.flow.json` exists but has not
  been run.
