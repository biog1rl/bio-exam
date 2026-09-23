# Plan 008: Remove proven search, storage, editor, and export bottlenecks

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/server/src/services/search app/server/src/routes/tests app/server/src/services/storage app/web/components/editor`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 001, 002
- **Category**: perf
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

Four latency/memory problems are directly visible without production guesses:
global search serializes five independent queries; prompt hydration fans out
unbounded fallback downloads; editor entry imports roughly 70 plugins plus a
324 KB emoji list; ZIP export buffers the archive and serially downloads files.

## Current state

- `database-search.ts` loops allowed categories and awaits each query.
- public test prompt hydration uses unbounded `Promise.all`; each item can try
  five storage paths serially although storage has a bounded helper.
- `plugins.tsx` statically imports optional editor modules and emoji data through
  the markdown transformer path.
- test/topic export performs repeated sequential queries/downloads and buffers
  ZIP output under a 30 s/1 GB Vercel route.

## Scope

**In scope**: the four proven paths, benchmarks/metrics, their tests.

**Out of scope**: speculative indexes without `EXPLAIN ANALYZE`, pagination
without cardinality evidence, behavior/format changes.

## Steps

1. Run category searches concurrently while preserving deterministic category
   ordering and permission filtering.
2. Use bounded prompt download concurrency while preserving fallback order and
   per-question failure semantics.
3. Split editor profiles and lazy-load optional plugin groups/data; establish a
   measured bundle budget.
4. Fetch export data set-wise, bound storage downloads, and stream the archive
   with cancellation/backpressure.

## Verification

- Unit/integration tests prove result and ZIP equivalence.
- Benchmarks record before/after query count, concurrency ceiling, peak buffer,
  and editor chunk size.
- `yarn verify` and production build exit 0.

## STOP conditions

- Streaming is unsupported by the deployed adapter; report a bounded spill-to-
  disk/object-storage alternative.
- Lazy loading changes editor serialization or toolbar availability.

