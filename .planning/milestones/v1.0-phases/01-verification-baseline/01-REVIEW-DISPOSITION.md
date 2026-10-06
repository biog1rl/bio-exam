---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Wrapper death leaks a running trust-auth cluster; the orphan sweep can never reclaim it"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Migration manifest does not pin journal `when`"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "CI policy check fails open for secret references"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "In local storage mode upload routes write into the working tree"
  - id: WR-05
    severity: warning
    disposition: deferred
    title: "verify.test.mjs zero-tests case asserts on function source text"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "Signal handling in verify.mjs and with-test-db"
  - id: IN-01
    severity: info
    disposition: deferred
    title: "loadDotenv() in seed.ts / bootstrap-admin.ts runs after db is built"
  - id: IN-02
    severity: info
    disposition: deferred
    title: "Schema fingerprint ignores functions, triggers, sequences, views, column collation"
  - id: IN-03
    severity: info
    disposition: deferred
    title: "migrationsStatus() cannot detect further edits to an already-dirty migration file"
  - id: IN-04
    severity: info
    disposition: deferred
    title: "getServerMe.test.ts counts getMeData calls instead of module loads"
  - id: IN-05
    severity: info
    disposition: deferred
    title: "test.fail bodies still contain steps whose failure counts as the expected defect"
  - id: IN-06
    severity: info
    disposition: deferred
    title: "Scratch database prefixes longer than 48 characters get truncated"
  - id: IN-07
    severity: info
    disposition: deferred
    title: "check-env-contract sees only process.env.X / process.env['X']"
open: 0
total: 13
recorded: 2026-10-03T00:00:00.000Z
---

# Phase 01: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | gsd-code-fixer: verified-postmaster sweep (command line must be `postgres -D <dir>/data`, never pg_ctl on an unverified pid), SIGHUP in `withTestDatabase`, self-test rewritten on real clusters incl. a live non-postgres pid that must survive; main session added SIGHUP→SIGTERM forwarding in `with-test-db.mjs` and `e2e.mjs` (manual `kill -HUP` left no child, cluster or dir) |
| WR-02 | warning | fixed | gsd-code-fixer: manifest pins `when` and `breakpoints` for 0000–0020; stage fails on changed values and non-increasing `when`; 4 new node:test cases; SQL/journal/snapshots byte-identical |
| WR-03 | warning | fixed | gsd-code-fixer: `/\bsecrets\b/i` over the whole file; `on:` allowlist `pull_request` + `push` (also closes H-2); 7 new tests; real ci.yml passes |
| WR-04 | warning | fixed | gsd-code-fixer: fail-closed part only — `assertLegacyUploadsAllowed()` throws in isolated mode at every legacy `web/public/uploads` write/delete; production path unchanged. Re-routing uploads to the local driver deferred to Phase 7 (ADR-0004) |
| WR-05 | warning | deferred | devils-advocate: optional polish (needs exporting `collectScriptTests`); the non-empty case is covered |
| WR-06 | warning | fixed | gsd-code-fixer: `verify.mjs` forwards SIGINT/SIGTERM/SIGHUP to the running step (manual proof: exit 143/129, no leftovers). The with-test-db child-wait part deferred (devils-advocate: exit 130/143 matches the documented contract) |
| IN-01 | info | deferred | informational: no effect on DB resolution |
| IN-02 | info | deferred | DRZ-01 scope is tables/columns/indexes/constraints/RLS/policies; extend if functions/triggers enter schema.ts |
| IN-03 | info | deferred | manifest sha256 stage already catches any byte change to applied SQL |
| IN-04 | info | deferred | equivalent today |
| IN-05 | info | deferred | revisit when D5 is fixed (Phase 7) |
| IN-06 | info | deferred | current prefixes are short |
| IN-07 | info | deferred | no destructured `process.env` reads exist today |

Also fixed in the same pass (from 01-SECURITY.md hardening notes): H-1 (guard rejects any query string or fragment), H-2 (trigger allowlist, with WR-03), H-3 (`SUPABASE_*` and libpq `PG[A-Z]+` stripped by pattern, `PG_*` kept).

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
