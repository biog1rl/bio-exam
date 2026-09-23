# Plan 005: Make answer and editor drafts durable

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/web/components/tests/TestRunner.tsx app/web/app/'(internal)'/'(protected)'/admin/tests app/web/lib/tests`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 001, 004
- **Category**: bug, tests
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

The answer WAL is written inside one shared 600 ms debouncer, so an edit to a
different question cancels the previous local and network save. Question-editor
autosave similarly clears its 700 ms timer on navigation and drops the latest
draft.

## Current state

- `TestRunner.tsx` updates React state, then invokes one debounced callback that
  first writes localStorage and then PATCHes the server.
- `QuestionEditorPageClient.tsx` clears its pending autosave timer on unmount;
  back navigation pushes immediately.

## Scope

**In scope**: TestRunner persistence helpers, question draft autosave/navigation,
focused fake-timer/component tests.

**Out of scope**: scoring, editor visual redesign, server session contract from
plan 004.

## Steps

1. Write answer WAL synchronously per answer mutation; debounce only the
   network synchronization and make pending saves flushable.
2. Flush question draft changes before controlled navigation and show a
   pending/error state. Use `beforeunload` only while an unsaved write exists.
3. Cover rapid changes across questions, reload/unmount inside debounce,
   failed retry, immediate back/cancel, and no duplicate save after flush.

## Verification

- Targeted fake-timer tests → all pass.
- `yarn verify` → exit 0.
- Manual browser check with network throttling → latest answer/draft survives
  reload and immediate navigation.

## STOP conditions

- Flush cannot be awaited by the current router flow without changing public
  navigation semantics.
- A fix would store answer content outside the existing scoped WAL key.

