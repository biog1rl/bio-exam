# bio-exam

## What This Is

A biology exam-preparation platform. Teachers and admins author topics, tests and questions (five question templates: `single_choice`, `multi_choice`, `matching`, `short_text`, `sequence_digits`); students take timed tests; attempts are scored and reviewed. It is a Yarn 4 + Turbo monorepo on Node 24: a Next.js 16 / React 19 web app (`app/web`), an Express 4 + Drizzle + PostgreSQL API (`app/server`) and shared packages `@bio-exam/rbac` (permission dictionary) and `@bio-exam/exam-core` (question-template logic for web and server). Teachers work inside responsibility zones (assigned topics, own groups). Since 2026-10-05 it runs in production on its own Beget VPS (Docker Compose: Caddy, web, API, PostgreSQL 17, local file storage) with live data.

## Core Value

A student's timed test attempt is scored correctly, exactly once, and stays reviewable exactly as it was scored.

## Current Milestone: v3.0 Открытые задания с фото и ручной проверкой

**Goal:** Teachers add open questions; students answer with text and/or photos (from the phone through a QR link), teachers grade them by hand on a 0–3 scale, and students see the result in their cabinet.

**Target features:**
- Open question template: text and/or up to 5 photos (no PDF), mixed with auto-scored questions in one test
- QR code next to an open question on the desktop: the phone opens an upload page for exactly that question of that attempt without signing in (link scoped to the attempt and question, add/remove photos only, expires at the end of the upload window); photos appear on the desktop at once
- Timed tests: text answers freeze at the timer; photos for open questions can still be uploaded during an upload window set by the test author; the reviewer sees each photo's upload time
- Test status "на проверке" until every open answer is graded; the percentage appears after grading
- Review: photo viewer (zoom, rotate), score 0–3, comment, "вернуть на исправление" up to 3 times; the final score is the last review, history visible
- Review queue "ждут проверки" with section and group filters; graded by the teacher of the zone or an admin
- Cabinet notifications through a general notification-event journal (reused by v4.0 chats and v5.0 push)
- Photos kept for one year
- Tech-debt phase from the v1.0 deferred items (mobile menu button excluded: done in the UX navigation work)
- Last phase, not before 2026-10-12: remove Supabase and Vercel from the code and a server runbook for the final copy to backup and deletion at the old providers (v2.0 remainder)

## Requirements

### Validated

<!-- Shipped in production. Inferred from the 2026-07-27 codebase map, the plans and the ADRs; not re-verified in this ingest. -->

- ✓ Teachers/admins author topics, tests and questions in five templates with a rich-text (Lexical) editor, answer-key versions and prompt/explanation files — existing
- ✓ Students take timed tests assigned to them; attempts are scored on submit and reviewed — existing
- ✓ Role/permission model with per-user overrides (`packages/rbac`), custom JWT access + refresh-token sessions — existing
- ✓ Global search (PostgreSQL `pg_trgm`), media-library asset upload, avatars, ZIP export of tests/topics — existing
- ✓ One trustworthy verification gate: Vitest in every workspace, root `yarn verify` (8 steps, own disposable PostgreSQL 17), isolated `yarn e2e`, information-only CI on every PR, `yarn.lock` as the only lockfile, Drizzle snapshot 0020 and migration manifest — v1.0
- ✓ No directly reachable high-severity dependency advisories — v1.0
- ✓ Question-template logic lives once, in `packages/exam-core`; D2 and D5 fixed — v1.0
- ✓ Access decided in one place (Express) from current DB state; revocable short-lived sessions; one web-session module; D3, D4, D8 fixed — v1.0
- ✓ Assigned-only, atomic, idempotent attempts and a stored scored-attempt view; D1 fixed — v1.0
- ✓ Durable answer and editor drafts through a client attempt-lifecycle module — v1.0
- ✓ One storage module with two adapters, one question-content module, secure assets and user-directory privacy; D6 fixed — v1.0
- ✓ Teacher role with responsibility zones (topics, groups, students) through one access-policy seam — v1.0 (Phase 07.1)
- ✓ Typed client requests, clean editor runtime, measured bottlenecks removed, admin test router decomposed; D7 fixed — v1.0
- ✓ Attempt result = auto facts + projection computed by one `exam-core` function and written by one writer; every reader shows «на проверке» without percent; answers validated by shape and size (422/400 `ANSWERS_INVALID`); `open` type seeded inactive; user-deletion rule ADR-0007 with catalogue test — v3.0 Phase 9 (not deployed: migration 0026 waits for the user's one-batch release)
- ✓ General notification journal (`notification_events` + `notification_deliveries`, migration 0027) written in the cause's transaction, «test assigned» on assignment or on publication (D-18), header bell with «9+», tab-title count, deep links that re-check access — v3.0 Phase 10 (not deployed: 0027 waits for the release together with 0026)

### Active

<!-- Milestone v3.0. Requirement IDs in REQUIREMENTS.md. -->

- [ ] Open questions with text and/or photo answers, QR upload from the phone, upload window after the timer
- [ ] Manual review 0–3 with comment, return for correction up to 3 times, review history, review queue with filters
- [ ] Test "на проверке" status and cabinet notifications through a general notification journal
- [ ] Tech debt from v1.0 deferred items
- [ ] Decommission Supabase and Vercel (code removal and server runbook), not before 2026-10-12

Later milestones: v4.0 teacher-student chats (`.planning/research/chat/SUMMARY.md`), v5.0 PWA and push notifications.

### Out of Scope

- Moving the API into Next route handlers or server actions — rejected by ADR-0001 (103 Express handlers, no gain).
- A second permission-computation algorithm in `packages/rbac` or in `app/web` — ADR-0001: rbac stays a dictionary.
- Splitting `TestRunner` into four hooks (plan 010 step 3) — superseded by ADR-0005 (client attempt-lifecycle module instead).
- Slicing the admin router by route before the question-content and scored-attempt modules exist — ADR-0005.
- Scoring-rule changes other than unifying the sequence metric (D2); external identity providers; unrelated RBAC changes; UI/editor visual redesign; media-library redesign; public profile features — outside plans 003-008 scope.
- Speculative indexes without `EXPLAIN ANALYZE`, pagination without cardinality evidence — plan 008 scope guard.
- Hand-editing the production schema, rewriting applied migrations, using production credentials in tests — plan 009 scope guard.
- Product directions deferred as feature options (ZIP import/restore, assignment lifecycle, cohort analytics) — not defects.
- Rejected findings: `SearchDialog` `dangerouslySetInnerHTML` (source text is escaped before controlled `<mark>` tags), Mentions-toolbar JSX-key warning (React Doctor false positive), lifemy-doc `its-doc-*`/Bitrix/native/Vite skills (incompatible with this repo).

## Context

- **Origin of this scope.** Planning is built from an ingest of 19 documents: ADR-0001...0005 (`docs/adr/`), plans 001-011 and `plans/beget-migration.md` (`plans/`). Synthesized intel: `.planning/intel/`; conflicts (12 INFO, 0 blockers): `.planning/INGEST-CONFLICTS.md`. No PRD exists, so requirement IDs are derived from the plans' steps/done-criteria and the plan 011 defects/candidates.
- **Current state (v1.0 shipped 2026-10-06).** Production on the Beget VPS since 2026-10-05: 26 SQL migrations (0000-0025), PostgreSQL 17, local storage volume; 31 users, 63 tests, 1834 questions, 265 attempts at the move; question images are files in `images/` (base64 moved out 2026-10-05). Tests: `yarn verify` (server ~1700, web ~1200 unit tests after the 2026-10-06 cleanup, exam-core ~600, guard scripts) and 236 e2e scenarios. Tech debt and deferred items: `milestones/v1.0-MILESTONE-AUDIT.md`, phase `deferred-items.md`, STATE.md Deferred Items. Local development uses a PostgreSQL 17 dev database on the home server with a production copy of the question bank only.
- **Codebase map** `.planning/codebase/` was taken 2026-07-27 at commit `29563ff` and is still broadly valid; code moved on to `ebf9e65` and later. Line numbers quoted in plan 011 must be re-verified at the start of each phase's planning.
- **Defects to close (plan 011 section 1).** D1 admin review substitutes the current answer key into an old attempt (verified). D2 sequences scored by two metrics (verified). D3 `AuthProvider` mounted twice (verified). D4 `['admin','teacher']` check passes only `admin` (verified). D5 editor cannot save `short_text` with several variants (by code, not reproduced). D6 PATCH question deletes the old prompt before writing the new one (per report). D7 user outside the first 100 opens from search with 404 (per report). D8 SSR does not refresh the session (per report).
- **Open questions carried into planning.** (a) Legacy `TestScoringRules` (`scoring.ts:12-70`, `/scoring-rules` routes) looks like a pass-through module; check `ScoringSettingsPageClient` before deleting — decide in Phase 3 or Phase 5 planning. (b) Which sequence metric survives D2 (stored historical scores are the constraint) — Phase 3 discussion. (c) Whether prompt-image handling in test ZIP / media-library delete (STOR-05) is fully in scope — Phase 7 discussion. (d) Old-attempt migration policy for stored scoring facts (SCORE-05) — Phase 5 planning.
- **Tooling.** Code intelligence is CodeGraph (`codegraph explore`, `codegraph node`, `codegraph impact` before editing a symbol, `codegraph affected` over a diff). GitNexus was removed 2026-10-02. `codex-trash` was replaced by plain deletion.

## Constraints

- **Tech stack**: Node 24, Yarn 4 (Corepack), Next 16 / React 19, Express 4, Drizzle + PostgreSQL, Turbo — no package-manager mixing; `yarn.lock` is the only lockfile (ADR-0003).
- **Verification first**: from Phase 1 on, `yarn verify` green is the precondition for closing every phase; refactoring of ADR modules starts with characterization tests that go through the module interface (ADR-0003).
- **Data safety**: production data is live. Drizzle metadata is restored before any new migration; applied SQL migrations are never edited; a migration that proposes drop/recreate is a STOP.
- **Security**: no 30-day bearer-token compatibility path; authorization uses current DB state (plans 003, 004, 006).
- **Runtime**: one Beget VPS with Docker Compose (Caddy, web, API, PostgreSQL 17, local storage), autodeploy from `master` after green CI, hourly encrypted backups to S3; Supabase and Vercel are being decommissioned.
- **Working agreements**: the main session commits to `dev` and `gsd/*` per plan (marker `claude-commits.allow`), the user pushes; Claude-only, no Codex cross-review; no agent teams (parallel subagents instead); `.env` files may be read (local/test data only); responses to the user in Russian, plan/ADR identifiers kept as-is.
- **STOP conditions** from plans 001-010 remain valid gates unless an ADR overrides them (see `<decisions>` below and `.planning/INGEST-CONFLICTS.md`).

<decisions>

Locked by accepted ADRs (2026-10-02). Do not re-open without a new ADR.

- **D-01 [locked]: ADR-0001 Express owns the database and access policy, Next only renders UI.** Source: docs/adr/0001-express-owns-data-and-access-policy.md
  - The database, JWT issuing and verification, and effective-permission computation live only in app/server. Effective permissions are computed by one module from roles and overrides; every Express check and /api/auth/me goes through it.
  - app/web gets the current user and permissions over HTTP from /api/auth/me and only checks the ready list. No pg, jsonwebtoken, DATABASE_URL or AUTH_JWT_SECRET in app/web.
  - packages/rbac stays a dictionary (registry of roles, domains, actions); no second permission algorithm next to the server one.
  - Consequences: delete getMeData, app/web/app/api/auth/me/route.ts and the Next pg pool. One web-session module owns the current user, 401 then refresh then retry, and the login redirect. Server rendering must be able to refresh the session. UI route gates use the same permissions Express checks, with no isAdmin bypasses or role-string checks in React.
  - Rejected: moving the API into Next route handlers or server actions.
- **D-02 [locked]: ADR-0002 Exam domain logic lives in the shared packages/exam-core package.** Source: docs/adr/0002-shared-exam-core-package.md
  - Pure TypeScript, only dependency zod, built like @bio-exam/rbac. No React, Lexical, Drizzle or Tiptap.
  - One adapter per template (single_choice, multi_choice, matching, short_text, sequence_digits) owning key shape and authoring validation, answer shape, answered-or-not, normalization, error count and per-part verdicts.
  - The attempt-result format (zod schema) and telemetry merge are declared in the package. Everything crossing HTTP between app/web and app/server is declared there and imported, not copied.
  - The question editor, test runner, attempt review and the server (validation on save, scoring on submit) all use it. Tests are tables of key, answer to score and per-part verdicts, plus the invariant all parts correct if and only if errors are 0.
- **D-03 [locked]: ADR-0003 Verification comes before refactoring.** Source: docs/adr/0003-verification-before-refactoring.md
  - Vitest in all workspaces, root yarn verify (lint, typecheck, test) and CI on every pull request.
  - One package manager: Yarn 4 stays and package-lock.json is deleted.
  - Drizzle metadata is restored before any new migration.
  - Changing modules from ADR-0001, 0002, 0004 and 0005 starts with characterization tests that go through the module interface, not around it. Plans 001 and 009 form the first phase; later phases depend on yarn verify.
- **D-04 [locked]: ADR-0004 File storage is one interface with two adapters.** Source: docs/adr/0004-storage-port-two-adapters.md
  - The storage module is the only place that touches files. Adapters: Supabase (now) and local volume (for the VPS), plus an in-memory adapter for tests.
  - Key normalization, containment (a path cannot leave the root), the key-to-URL rule and uniform failure modes live inside the module. Routes never touch fs or compute paths. Web gets ready URLs from the API.
  - One contract test suite runs on both adapters. Containment (plan 006) and streaming ZIP (plan 008) are implemented once, inside the module.
- **D-05 [locked]: ADR-0005 Decompose by concept, not by route or data type.** Source: docs/adr/0005-decompose-by-concept.md
  - Deep modules first, router slicing after. Question content (server): DB row, answer-key versions, prompt and explanation files, search document, slug paths, contiguous order; create, edit, move, delete, read.
  - Scored attempt (server): at submit store the scoring facts (the key used, errors, per-part verdicts). The view for student-with-key, student-without-key and admin is computed at read time. Substituting the current key into an old attempt is forbidden.
  - Attempt lifecycle (client): phases and events (start, answer, navigate, tab hidden or visible, timer tick, submit, retake); owns the local draft format, telemetry and reset on retake.
  - Replaces plan 010 step 3: TestRunner is not split into four hooks. The router split from plan 010 runs after the question-content and scored-attempt modules. The scored-attempt module is built together with plan 004 because it changes what the submit transaction writes.

Sequencing and scope decisions resolved during ingest (all 12 conflicts auto-resolved in favour of ADRs or higher-precedence specs).

- **D-06 [resolved]: Plan 009 runs in Phase 1 ahead of plan 002.** ADR-0003 and plan 011 section 4 override the 001/002 dependency written in plan 009 and plans/README.md.
- **D-07 [resolved]: package-lock.json is deleted in Phase 1 with a CI guard against a second lockfile.** ADR-0003 wins over plan 002 step 3 placement and over the keep-it wording in plans/beget-migration.md.
- **D-08 [resolved]: Vitest and root yarn verify are mandatory and there are 12 test files.** Plan 001 says wrap the 11 assertion scripts and STOP if a runner needs rewriting the corpus; ADR-0003 voids that. Port the scripts to Vitest.
- **D-09 [resolved]: Next auth and DB files are deleted in Phase 4.** getMeData, the Next /api/auth/me route and the pg pool go in Phase 4 after parity tests, not kept per beget-migration 3.4 and not deferred to plan 010 step 4.
- **D-10 [resolved]: The scored-attempt module ships with plan 004 in Phase 5.** The plan 004 scoring-rules-out-of-scope line means scoring semantics stay unchanged, not that submit stops storing scoring facts. Old attempts get a separate migration.
- **D-11 [resolved]: Plan 005 is executed through the client attempt-lifecycle module in Phase 6.** Plan 005 steps 1 and 3 run via C7. The plan 005 STOP about storing answers outside the scoped WAL key is re-checked when the module defines the draft format.
- **D-12 [resolved]: Path containment from plan 006 is implemented once inside the storage module in Phase 7.** Both adapters exist behind one interface; Milestone 2 only enables the local adapter.
- **D-13 [resolved]: Streaming ZIP export from plan 008 stays in scope.** It is implemented inside the storage module in Phase 8 despite the only-if-necessary wording in beget-migration 3.5.
- **D-14 [resolved]: Phase order follows plan 011 section 4 and eight phases are kept.** This overrides the README order and the standard-granularity range of 4-6 phases. Hard Depends-on prerequisites that no ADR overrides remain valid.

</decisions>

## Key Decisions

<!-- Human-readable log. Machine-readable locked decisions are in the <decisions> block above. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express owns DB and access policy; Next renders UI (ADR-0001) | Access policy was computed in three places across two apps with two DB pools | ✓ v1.0 (Phases 4, 07.1, 8) |
| Shared `packages/exam-core` for template logic (ADR-0002) | Template behaviour lived in ~11 places in two apps and the copies diverged (D2, D5) | ✓ v1.0 (Phase 3) |
| Verification before refactoring (ADR-0003) | No runner, no `verify`, no CI, two lockfiles, stale Drizzle snapshot: refactors were unchecked | ✓ Phase 1: `yarn verify` and CI green (runs 37114466556, 37120717677) |
| One storage interface, two adapters (ADR-0004) | Supabase-vs-local fork lived in routes with diverging failure modes; VPS needs the second adapter | ✓ v1.0 (Phase 7); local adapter in production since the move |
| Decompose by concept (ADR-0005) | Slicing by route or hook count would keep the duplicated concepts (question content, scored attempt, lifecycle) | ✓ v1.0 (Phases 5, 6, 7, 8) |
| Eight phases despite `granularity: standard` | The user-mandated order from plan 011 section 4 follows hard dependencies; folding would merge unrelated risk areas | ✓ v1.0 (plus inserted 07.1) |
| Milestone 2 (Beget VPS) excluded from this roadmap | Starts after Phases 4 and 7; keeps Milestone 1 about reliability | ✓ Move done outside GSD 2026-10-05; decommission left |
| Database-touching tooling runs only against a disposable local `test_*` database (`assertTestDatabaseUrl`, `BIO_EXAM_ISOLATED_ENV=1`) | The developer `.env` may point at live Supabase data | ✓ Phase 1 |
| CI is information-only: no deploy, no `secrets`, triggers `pull_request` + push to master (`check-ci-workflow`) | CI must never be a path to production | ✓ Phase 1 |
| Repository reformat with oxfmt in its own commit, listed in `.git-blame-ignore-revs` | Keeps blame useful and behaviour diffs readable | ✓ Phase 1 (`2b59334`) |
| Known defects D1, D2, D5 pinned in e2e with `test.fail()`, not skipped | The fixing phase flips them to passing tests | ✓ Phase 1; flip in Phases 3 and 5 |
| VER-08 moved to Phase 6 | Belongs with the client attempt-lifecycle module | ✓ Phase 1 planning |
| Tests stay lean: new checks as server integration and e2e; unit tests only for logic with many cases; no brittle structural guards | Unit tests that repeated the request layer and constants cost CI time and upkeep (web 1470 → 1208) | ✓ v1.0 close |
| Base64 images in question text are moved to `images/<sha256>.webp` on save and by `assets:inline-images` | Inline images made pages 5.8 MB and slow on the VPS | ✓ hotfix 212ae74 |
| Result projection on `test_attempts` with facts frozen by a trigger; no image-only rollback after 0026 | Readers need one place for «на проверке»; old code cannot write the new NOT NULL columns | ✓ Phase 9; release rule in the server profile |
| Answer shape and size checked by the template adapter's `answerSchema` for every template | Length limits on strings alone let arrays/records and choice answers through | ✓ Phase 9 review fix 3be6c16 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions (and to the `<decisions>` block if it constrains later phases).
5. "What This Is" still accurate? Update if drifted.

**After each milestone:**
1. Full review of all sections.
2. Core Value check: still the right priority?
3. Audit Out of Scope: reasons still valid?
4. Update Context with current state (users, feedback, metrics).

---
*Last updated: 2026-10-06 after Phase 10*
