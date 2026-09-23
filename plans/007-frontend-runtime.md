# Plan 007: Harden frontend API and editor runtime behavior

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/web/lib app/web/components app/web/app app/web/package.json`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 001, 002, 003
- **Category**: tech-debt, bug
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

Protected screens mix a refresh-aware client with blind fetchers that parse
401 bodies as successful JSON. React Doctor also found real render-time browser
global access, render-time ref mutation, repeated toolbar subscriptions, and
speech-recognition cleanup gaps.

## Current state

- `apiFetch` retries once after refresh; global and local SWR fetchers bypass it.
- `CodeActionMenuPlugin` defaults `anchorElem = document.body` during render.
- character counting uses `window.TextEncoder` from render-initial state.
- `useDebounce` assigns `ref.current` during render and does not expose cleanup.
- toolbar callbacks are fresh dependencies for two effects in ten plugins.
- speech recognition stops but retains listener/object state on cleanup.

## Scope

**In scope**: typed JSON/SWR adapter and protected callers; vetted React Doctor
errors in editor code; focused tests and lint warnings in touched files.

**Out of scope**: raw React Doctor false positives, unvetted cosmetic warnings,
editor redesign.

## Steps

1. Build one typed JSON/SWR adapter over `apiFetch`, including non-OK and
   malformed-JSON behavior. Migrate protected callers in bounded groups.
2. Remove render-time `document/window` access, update debounce callback refs in
   an effect/layout effect with cancel-on-unmount, stabilize toolbar listeners,
   and fully detach speech-recognition resources.
3. Add reduced-motion behavior to touched animated/editor controls.
4. Test refresh success/failure, non-401 errors, SSR render, listener cleanup,
   debounce cancellation, and toolbar subscription stability.

## Verification

- `yarn verify` → exit 0.
- `npx -y react-doctor@latest app/web --verbose --scope full --offline` → no
  confirmed error from this plan; remaining diagnostics documented with
  evidence/rationale.
- Web production build → exit 0.

## STOP conditions

- A caller intentionally handles 401 differently; keep it explicit and test it.
- Fixing a generated/vendor editor module requires a wholesale vendor update.

