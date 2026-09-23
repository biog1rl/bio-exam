# Plan 002: Remove reachable dependency vulnerabilities

> **Drift check**: `git diff --stat 29563ff..HEAD -- package.json app/*/package.json yarn.lock package-lock.json app/web/components/tests/MdxRenderer.tsx app/web/components/editor/editor-hooks/use-debounce.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-project-operating-baseline.md`
- **Category**: security
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

The production graph contains reachable high-severity advisories in Next,
Multer, Sharp, Drizzle, TinyMCE, PostCSS, Lodash, and `next-mdx-remote`.
Keeping both npm and Yarn lockfiles also makes audits/deployments disagree.

## Current state

- Next 16.2.1 is below 16.2.11, the highest patched threshold reported by the
  current advisory set; `proxy.ts` participates in protected routing.
- Multer 2.0.2 and Sharp 0.34.5 process user-controlled uploads.
- Drizzle 0.45.1 is below the SQL-identifier escaping patch.
- TinyMCE 8.3.2, PostCSS 8.5.6, Lodash 4.17.23, and
  `next-mdx-remote` 5.0.0 have direct high advisories.
- `packageManager` is Yarn 4.12, yet tracked `package-lock.json` is stale.

## Scope

**In scope**: manifests, `yarn.lock`, exact compatibility edits/tests required
by upgrades, exact redundant `package-lock.json`.

**Out of scope**: unrelated framework migrations, feature redesign, suppressing
audit results without a documented reachability decision.

## Steps

1. Re-run Yarn/npm advisory data and verify patched versions from primary
   package/repository advisories at execution time.
2. Upgrade all direct affected packages to patched compatible releases. Remove
   Lodash by replacing its single debounce use if no patched release exists.
   Upgrade/adapt `next-mdx-remote` safely; keep untrusted MDX from executing.
3. Move the exact redundant `package-lock.json` to Trash using
   `/Users/kdvornichenko/.codex/bin/codex-trash`; add a CI guard against a
   second lockfile.
4. Test upload abort/limits/formats, proxy-protected routes, MDX rendering,
   editor content, and Drizzle queries.

## Verification

- `yarn install --immutable` → exit 0.
- `yarn verify` → exit 0.
- `yarn npm audit --all --recursive --severity high --json` → no direct
  production advisory remains; any transitive tooling advisory is listed with
  dependency path, reachability, and upstream status rather than ignored.
- `test ! -e package-lock.json` → exit 0.

## STOP conditions

- The only available release is a breaking major without a bounded adapter.
- MDX safety cannot be proved with a regression test.
- A native Sharp release does not install in the target runtime.

