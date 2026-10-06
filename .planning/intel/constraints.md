# Constraints (from SPEC sources)

Synthesized from 13 SPEC-classified documents (plans 001-011 and beget-migration). Manifest precedence: plan 011 = 1, beget-migration = 2, plans 001-010 = 3. All are lower precedence than the ADRs in `decisions.md`; where they contradict an ADR the ADR wins (see `/Users/kdvornichenko/bio-exam/.planning/INGEST-CONFLICTS.md`, INFO bucket). All plans have status TODO / not executed. Content is kept close to source text.

## Tooling context (recorded, not a conflict)
- source: orchestrator note for this ingest; /Users/kdvornichenko/bio-exam/plans/README.md; /Users/kdvornichenko/bio-exam/plans/001-project-operating-baseline.md
- type: protocol
- content:
  - GitNexus was removed from the repository on 2026-10-02. CodeGraph (`.codegraph/`) is the code-intelligence tool; plan gates use `codegraph impact` (before editing symbols) and `codegraph affected` (over the diff). `codegraph node` is used for extraction-target inspection (plan 010).
  - `codex-trash` was removed from the plans in favour of plain deletion.
  - The VPS migration target is Beget (4 vCPU / 6 GB RAM / 80 GB NVMe, Saint Petersburg), per plans/beget-migration.md. Server not yet ordered.
  - Historical GitNexus command evidence inside plans/beget-migration.md sections 2 and 12 (dated 2026-09-26) is evidence of past review, not a current tool requirement.

## Plan 001: Establish the project operating baseline
- source: /Users/kdvornichenko/bio-exam/plans/001-project-operating-baseline.md
- type: nfr
- content:
  - Priority P1, effort M, risk LOW, depends on: none. Planned at commit `29563ff`, 2026-07-27.
  - Scope in: root/workspace manifests, `turbo.json`, `.github/workflows/**`, `README.md`, `AGENTS.md`, `CLAUDE.md`, env examples, server README, `.agents/skills/bio-exam-{web,api,data}/**`. Out: application behavior, deployment, secrets, wholesale copies from lifemy-doc.
  - Steps: (1) package-level test/lint commands plus root `test` and `verify`, using existing top-level assertion tests without changing semantics; `yarn test` exits 0 and runs all 11 existing test files. (2) CI workflow with Corepack, Yarn 4 immutable install, `yarn verify`; no deployment or write step. (3) root onboarding, correct server route/access docs, value-free web/server env examples, allowlisted env-contract check. (4) project commands/scope/routing in `AGENTS.md`; `CLAUDE.md` keeps importing `AGENTS.md`. (5) three thin project skills `bio-exam-web`, `bio-exam-api`, `bio-exam-data` validated with `quick_validate.py`.
  - Done criteria: `yarn verify` exits 0 and executes every committed test; CI runs immutable install and `yarn verify`; env templates contain keys/placeholders only; three skills validate and routing is documented; server/root docs match current routes and dynamic question types.
  - STOP: any proposed test runner requires rewriting the existing test corpus; a required env key cannot be classified without reading a secret value.

## Plan 002: Remove reachable dependency vulnerabilities
- source: /Users/kdvornichenko/bio-exam/plans/002-dependency-security.md
- type: nfr
- content:
  - Priority P1, effort M, risk MED, depends on: plan 001.
  - Upgrade direct affected packages: Next (16.2.1 -> at least 16.2.11 per advisory set), Multer 2.0.2, Sharp 0.34.5, Drizzle 0.45.1 (SQL-identifier escaping patch), TinyMCE 8.3.2, PostCSS 8.5.6, Lodash 4.17.23 (remove by replacing its single debounce use if no patched release), `next-mdx-remote` 5.0.0 (keep untrusted MDX from executing).
  - Delete redundant `package-lock.json`; add a CI guard against a second lockfile.
  - Verification: `yarn install --immutable` exit 0; `yarn verify` exit 0; `yarn npm audit --all --recursive --severity high --json` shows no direct production advisory (transitive ones listed with path, reachability, upstream status); `test ! -e package-lock.json` exit 0.
  - STOP: only a breaking major without a bounded adapter; MDX safety cannot be proved with a regression test; native Sharp release does not install in the target runtime.

## Plan 003: Make authentication revocable and race-safe
- source: /Users/kdvornichenko/bio-exam/plans/003-auth-session-security.md
- type: protocol
- content:
  - Priority P1, effort L, risk HIGH, depends on: plans 001, 002.
  - Steps: run `codegraph impact` on every edited auth/RBAC symbol; make current DB roles authoritative whenever DB enforcement is active (currently `session.ts` unions DB and JWT roles); short-lived access tokens bound to a revocable server session family/version, revoked on logout and on password/admin revocation; atomically claim single-use refresh tokens, create successors, commit, then set cookies, detect replay at family level; replace hard account lockout (five failures = 30-minute lock) with shared progressive account+IP throttling and an operational recovery path; make Express `/auth/me` the one authorization boundary and remove the duplicate Next DB pool/policy after parity tests.
  - Test plan: role removed after token issue; logout invalidates access; two concurrent refreshes yield exactly one successor; transaction failure sends no access cookie; throttling cannot cheaply lock a victim out; `/auth/me` parity for role/user overrides; `yarn verify` exit 0; `codegraph affected` shows only auth/RBAC tests plus docs.
  - STOP: deployment cannot supply the required shared throttle/session store; a compatibility path would preserve 30-day bearer-token access; Next/Express auth responses cannot be made contract-compatible without a separately approved migration.

## Plan 004: Enforce assignment and atomic attempt sessions
- source: /Users/kdvornichenko/bio-exam/plans/004-attempt-session-integrity.md
- type: schema
- content:
  - Priority P1, effort L, risk HIGH, depends on: plans 001, 003.
  - Centralize `assigned-or-currently-privileged` authorization and apply it to read/start/draft/submit using current DB permissions. Require explicit `sessionId` on submit and validate test/user/open state. Add one-open-session-per-user/test and one-attempt-per-session constraints (with migrations). Persist one client attempt ID for the full retry cycle; in one transaction claim the exact session, insert/get the attempt, close the session, clear its draft; preserve idempotent response-loss retry behavior. Make draft answer/telemetry merges atomic (row lock/versioning or atomic JSONB operations). Add DB-backed concurrency/authorization/time-limit integration tests.
  - Out of scope: scoring rules, attempt-review presentation, assignment feature expansion.
  - Done criteria: unassigned users receive 403 on every attempt mutation; timed submission without the exact open session is rejected; concurrent starts produce one open session; concurrent/retried submits produce one attempt and stable response; concurrent answer+telemetry PATCHes preserve all fields; `yarn verify` passes; `codegraph affected` over the diff lists only expected tests.
  - STOP: existing production duplicate/open-session data cannot be migrated deterministically (report counts, propose cleanup policy); atomicity requires changing scoring semantics.

## Plan 005: Make answer and editor drafts durable
- source: /Users/kdvornichenko/bio-exam/plans/005-client-draft-durability.md
- type: nfr
- content:
  - Priority P1, effort M, risk MED, depends on: plans 001, 004.
  - Write the answer WAL synchronously per answer mutation; debounce only network synchronization and make pending saves flushable. Flush question-draft changes before controlled navigation, show pending/error state, use `beforeunload` only while an unsaved write exists. Cover rapid changes across questions, reload/unmount inside debounce, failed retry, immediate back/cancel, no duplicate save after flush.
  - Out of scope: scoring, editor visual redesign, server session contract from plan 004.
  - Verification: targeted fake-timer tests pass; `yarn verify` exit 0; manual browser check with network throttling.
  - STOP: flush cannot be awaited by the current router flow without changing public navigation semantics; a fix would store answer content outside the existing scoped WAL key.

## Plan 006: Secure assets and user-directory privacy
- source: /Users/kdvornichenko/bio-exam/plans/006-assets-user-privacy.md
- type: api-contract
- content:
  - Priority P1, effort M, risk MED, depends on: plans 001, 003.
  - Require explicit content-management permission for asset upload/delete. Normalize object names to `images/<generated-name>` and prove resolved local targets remain inside the image root before deletion. Split minimal directory lookup from administrative inspection: remove sensitive fields (login, birthdate, phone, email, Telegram, roles, state) and the broad `users.read` list permission from ordinary users; migrate legitimate selectors to the minimal DTO; admin screens keep details through an admin permission. Tests: path traversal, permission matrix, field-level response, legacy path compatibility.
  - Out of scope: media-library redesign, storage-provider migration, public profile feature work.
  - Done criteria: `../`, encoded traversal, absolute paths, foreign storage prefixes cannot delete a file; ordinary directory response contains only approved minimal fields; admin screens retain required details; `yarn verify` exit 0.
  - STOP: a production legacy path lies outside the normalized image namespace; a student workflow truly requires a sensitive field (report the exact caller rather than expanding the minimal DTO).

## Plan 007: Harden frontend API and editor runtime behavior
- source: /Users/kdvornichenko/bio-exam/plans/007-frontend-runtime.md
- type: api-contract
- content:
  - Priority P2, effort L, risk MED, depends on: plans 001, 002, 003.
  - Build one typed JSON/SWR adapter over `apiFetch` including non-OK and malformed-JSON behavior; migrate protected callers in bounded groups. Remove render-time `document/window` access (`CodeActionMenuPlugin`, `window.TextEncoder` counting), update debounce callback refs in an effect/layout effect with cancel-on-unmount, stabilize toolbar listeners (ten plugins), fully detach speech-recognition resources. Reduced-motion behavior on touched animated/editor controls. Tests: refresh success/failure, non-401 errors, SSR render, listener cleanup, debounce cancellation, toolbar subscription stability.
  - Verification: `yarn verify` exit 0; `npx -y react-doctor@latest app/web --verbose --scope full --offline` shows no confirmed error from this plan; web production build exit 0.
  - STOP: a caller intentionally handles 401 differently (keep it explicit and test it); fixing a generated/vendor editor module requires a wholesale vendor update.

## Plan 008: Remove proven search, storage, editor, and export bottlenecks
- source: /Users/kdvornichenko/bio-exam/plans/008-proven-performance.md
- type: nfr
- content:
  - Priority P2, effort L, risk MED, depends on: plans 001, 002.
  - Run category searches concurrently, preserving deterministic category ordering and permission filtering. Bounded prompt-download concurrency preserving fallback order and per-question failure semantics. Split editor profiles and lazy-load optional plugin groups/data (about 70 plugins plus a 324 KB emoji list) with a measured bundle budget. Fetch export data set-wise, bound storage downloads, stream the ZIP archive with cancellation/backpressure (currently buffered under a 30 s / 1 GB Vercel route).
  - Out of scope: speculative indexes without `EXPLAIN ANALYZE`, pagination without cardinality evidence, behavior/format changes.
  - Verification: unit/integration tests prove result and ZIP equivalence; benchmarks record before/after query count, concurrency ceiling, peak buffer, editor chunk size; `yarn verify` and production build exit 0.
  - STOP: streaming unsupported by the deployed adapter (report a bounded spill-to-disk/object-storage alternative); lazy loading changes editor serialization or toolbar availability.

## Plan 009: Restore Drizzle migration metadata continuity
- source: /Users/kdvornichenko/bio-exam/plans/009-drizzle-metadata.md
- type: schema
- content:
  - Priority P1, effort M, risk HIGH, depends on (as written in the plan): plans 001, 002. Classification confidence: medium.
  - `_journal.json` reaches 0020; latest committed snapshot is `0015` (lacks search-document and draft-telemetry schema state; SQL migrations 0017 and 0019 add objects absent from it). Apply the full chain to a disposable PostgreSQL database and compare with `schema.ts`; restore snapshot continuity with supported Drizzle tooling without editing applied SQL history and review the generated diff for destructive statements; add a CI check that applies migrations from zero and confirms a subsequent generation has no unexpected diff.
  - Out of scope: modifying production schema by hand, rewriting applied migrations, using production credentials.
  - Done criteria: fresh disposable DB reaches the current schema; second schema-diff generation is empty/expected; existing SQL migration checksums/order unchanged; `yarn verify` exit 0.
  - STOP: live schema state required to resolve ambiguity; tooling proposes drop/recreate or changes an applied migration; no disposable PostgreSQL environment.

## Plan 010: Decompose the auth and test-domain god modules
- source: /Users/kdvornichenko/bio-exam/plans/010-module-decomposition.md
- type: protocol
- content:
  - Priority P2, effort L, risk HIGH, depends on: plans 003-009. Classification confidence: medium. Step 3 is superseded by ADR-0005.
  - Steps: `codegraph node`/`codegraph impact` for each extraction target, with characterization tests for route registration/order and TestRunner state transitions first; split the admin router (`routes/tests/index.ts`, stated as 2,723 lines) by existing domain boundary keeping a small composition entrypoint and exact middleware/path order; (superseded) extract TestRunner (847 lines) persistence/telemetry/answer state/submit into four hooks; confirm no caller uses the old Next auth DB/policy code, then delete only the exact obsolete files.
  - Out of scope: API redesign, UI redesign, schema changes, behavior changes.
  - Verification: public route inventory before/after byte-for-byte equivalent; TestRunner behavior and props compatible under characterization tests; `codegraph affected` lists only expected test/auth files; `yarn verify` and production build exit 0.
  - STOP: Express route order changes or a route is ambiguous; extracted hooks require changed timing/submission semantics; an obsolete auth file still has a live caller.

## Plan 011 (summary): architecture review, defects D1-D8
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: nfr
- content:
  - Priority P1, effort L, depends on (README): 001. Date 2026-10-02, code `ebf9e65`. Status TODO. Line numbers in the review must be re-verified before phase planning.
  - Defects found: D1 admin attempt review substitutes the current answer key into an old attempt (verified); D2 sequences scored by two different metrics (server counts adjacent swap as one error; review shows "Совпало позиций: 2/4" for `1234` vs `1243`) (verified); D3 `AuthProvider` mounted twice, extra `/api/auth/me` and bare-fetch refresh on every load (verified); D4 `['admin','teacher']` check passes only `admin` because `teacher` is not in `ROLE_REGISTRY` (verified); D5 question editor page likely cannot save `short_text` with multiple variants (by code, not reproduced); D6 PATCH question deletes the old prompt before writing the new one (per report); D7 user outside the first 100 opens from search with 404 (per report); D8 server rendering does not refresh the session (hidden only because the access token lives 30 days).
  - Open questions section 3: legacy `TestScoringRules` (`scoring.ts:12-70`, `/scoring-rules` routes) looks like a pass-through module, check `ScoringSettingsPageClient` before deleting; server session issuance (`readCookie` defined three times, Set-Cookie merging three times, refresh drops claim `login`) to be handled inside plan 003.

## Plan 011 C1: Exam question-template module shared by web and server
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: api-contract
- content: Strong candidate -> ADR-0002. Behaviour of a question template is described in about 11 places in two apps and the copies have diverged (D2, D5). Solution: package `packages/exam-core` with one adapter per template responsible for key shape, answer shape, "answered?", normalization, errors and scores, per-part verdicts. Tests through the interface: a table per template (key, answer) -> score and verdicts, plus invariant "all parts correct <=> errors 0". Overlaps: none; plan 004 explicitly excludes scoring.

## Plan 011 C2: Scored attempt and its view per viewer
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: schema
- content: Strong candidate -> ADR-0005. Attempt stores a trimmed student view while the admin review reconstructs it from the current key and questions (D1); key-hiding rule guessed by web in four places; result type declared six times, not schema-checked at read (`unknown[]` with casts); question status computed in two places and disagrees at `points === 0`. Solution: at submit persist scoring facts (the key used, errors, per-part verdicts); build the view for student-with-key, student-without-key and admin at read time in one module. Tests: a key corrected after submission does not change the review; three views of one attempt. Overlap: executes together with plan 004 because it changes what the submit transaction writes; data for old attempts needs a separate migration (to be decided at planning).

## Plan 011 C3: Question content on the server
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: api-contract
- content: Strong candidate -> ADR-0005. A question has five parts (DB row, key versions, prompt/explanation files, search document, slug path) and each of about 9 handlers in `routes/tests/index.ts` / `public.ts` assembles them itself; paths are moved in three different ways (topic slug PATCH moves none); question order maintained in four ways; two admin read blocks are byte-identical; `settings.json` is written and never read; GET export with `withAnswers` writes `answer_keys.json` to storage. Solution: one module owns create/edit/move/delete/read including DB-file consistency and contiguous order. Tests: real DB plus in-memory storage adapter; slug rename and file-write failure. Overlaps: plan 010 (router slicing after this module), plan 008 (bounded prompt download in one place).

## Plan 011 C4: Storage seam with two adapters
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: api-contract
- content: Strong candidate -> ADR-0004. Supabase-vs-local fork lives in routes; failure modes differ (without Supabase `readFile` returns `''`, writes throw); web parses Supabase URLs with a regex; prompt images live in shared `images/`, so test ZIP omits them and the media library can delete an in-use image. Solution: one storage interface, Supabase and local-volume adapters, key normalization and containment inside the module. Tests: one contract suite on both adapters plus traversal tests. Overlaps: plan 006, plan 008 (ZIP), plans/beget-migration.md section 3.2.

## Plan 011 C5: Effective-permission policy
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: api-contract
- content: Strong candidate -> ADR-0001. Roles expand by three different algorithms (package version honours `inherits`, server version does not); within one Express request role-string checks see DB+JWT roles while `requirePerm` sees DB only; D4; `AuthGuard` lets admin bypass any permission plus four manual `isAdmin` checks; `/admin/**` UI is gated by `rbac.*` while Express admits `tests.*`. Solution: one server module, roles + overrides -> effective permissions, with a grants-loading seam (Drizzle and in-memory adapters); all Express checks and `/auth/me` go through it. Tests: role removed after token issue; DB deny overlaid on admin; `inherits`; `/auth/me` and `requirePerm` agree. Overlaps: plan 003 (steps 2, 6), plan 010 (step 4).

## Plan 011 C6: Web session module
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: api-contract
- content: Strong candidate -> ADR-0001. Double `AuthProvider` (D3); refresh-and-retry implemented twice with different conditions (`apiFetch` on 401, `fetchAuthMe` on 200 with `ok:false`); login redirect built three ways; no refresh in server rendering (D8); `API_ORIGIN` both sets build-time routing and selects the runtime adapter. Solution: one web module owning who the current user is (SSR and client), the 401 -> refresh -> retry chain, and login redirect with callback; adapters: HTTP to Express and a test fake; the `pg` adapter is deleted. Tests: SSR with expired access and live refresh token; several concurrent 401s yield one refresh; failed refresh redirects to login with callback. Overlaps: plans 003, 010, beget-migration section 3.4.

## Plan 011 C7: Attempt lifecycle on the client
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: protocol
- content: Worth exploring -> ADR-0005. `TestRunner` has 15 `useState`, 5 `useRef`, 8 `useEffect`, 17 localStorage accesses; phase computed in three places; retake needs manual reset of 5 refs, 9 setters, 3 keys (what commit `29563ff` fixed); tests cover reducers while both telemetry bugs were in effects; telemetry merge copied between web and server. Solution: split by lifecycle (phases x events); module owns draft format, telemetry and reset; seams: storage, API, clock, tab visibility. Tests: event sequences with a fake clock (retake; hidden tab does not accumulate time; answer to Q2 inside the debounce window does not lose Q1 - the plan 005 bug). This is how to execute plan 005 (steps 1, 3) and plan 010 (step 3, replaced by ADR-0005), not separate work.

## Plan 011 C8: Typed requests per domain and user directory
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: api-contract
- content: Worth exploring. 17 local fetchers of about five shapes, some not checking `ok` or sending credentials; `swrConfig`/`swrOptions` imported nowhere; `apiFetch` returns raw `Response`; no user-lookup interface (D7); server pages reach Express two ways (`API_ORIGIN` and self-call `absoluteUrl`). Solution: repeat the shape of `lib/tests/api.ts` for users and groups on top of one request module handling 401, error responses, malformed JSON; add an Express user lookup by id or login. Overlap: plan 007 step 1 (client part only).

## Plan 011 section 4: Recommended phase order
- source: /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md
- type: protocol
- content:
  - Milestone 1 (reliable foundation): Phase 1 checks: plan 001, plan 009, one lockfile (ADR-0003), depends on none. Phase 2 vulnerable dependencies: plan 002, depends on 1. Phase 3 `exam-core`: C1, fix D2 and D5; package table tests become the reference point; depends on 1. Phase 4 auth: plan 003 + C5 + C6, fix D3, D4, D8; depends on 1, 2. Phase 5 attempt integrity: plan 004 + C2, fix D1; depends on 3, 4. Phase 6 drafts: plan 005 via C7; depends on 5. Phase 7 storage and question content: C4 + C3 + plan 006, fix D6; depends on 1, 4. Phase 8 client requests: plan 007 + C8, fix D7; then plan 008 and the remainder of plan 010; depends on 4, 7.
  - Milestone 2 (VPS migration): executed per `plans/beget-migration.md`; start after phases 4 and 7 of milestone 1, which close its requirements 3.2 and 3.4.

## Beget migration: result, scope, assumptions, acceptance criteria
- source: /Users/kdvornichenko/bio-exam/plans/beget-migration.md
- type: nfr
- content:
  - Result: web, API, PostgreSQL and all application files run on one VPS via Docker Compose; GitHub Actions checks code, builds Docker images and deploys reproducibly; verified rollback for release and initial transfer. Chosen tariff Beget 4 vCPU / 6 GB RAM / 80 GB NVMe (73 RUB/day with IPv4; 2190 RUB for 30 days); Timeweb Cloud-50 was the comparison variant. Server not ordered. Status: preparation plan; infrastructure and production unchanged.
  - In scope: hosting dependencies, DB and migrations, Storage, authorization, containers, CI/CD, DNS/TLS, backups, observability, transfer verification. Out of scope: exam business logic changes, new design, full code-quality audit, third-party YouTube/Twitter embeds, homework photo intake (future photos counted in disk sizing).
  - Assumptions: A1 full removal of Vercel and Supabase at runtime; A2 start scheme is one VPS with web, API, PostgreSQL and local files; A3 env connections point at one remote DB and one Supabase project (not verified against Vercel production env).
  - Acceptance criteria: C1 no application calls to Vercel/Supabase; C2 data and application files fully transferred (tables, keys, relations, sequences, migration history, object manifest with SHA-256); C3 core user scenarios preserved (E2E over HTTPS with real API, PostgreSQL, persistent file storage); C4 release reproducible and rollback-able (image digests, deployment journal, trial rollback); C5 data restorable after failure (PostgreSQL and files).
  - Measured baseline (2026-09-26, Supabase): 31 users, 63 tests, 1834 questions, 264 attempts; DB 31.52 MB; Storage 2691 objects 37.06 MB; DB plus files about 68.58 MB; PostgreSQL 17.6; 21 SQL migrations 0000-0020; 25 tables.

## Beget migration: PostgreSQL and migrations
- source: /Users/kdvornichenko/bio-exam/plans/beget-migration.md
- type: schema
- content:
  - Read-only production inventory first (version, size, tables, schemas, extensions, owners, roles, policies, functions, triggers, sequences, extra jobs). `public.__drizzle_migrations` must be transferred (runner sets `migrationsSchema: 'public'`); do not replay all migrations over a restored schema.
  - Restore Drizzle metadata continuity on a verification DB (journal to 0020, last snapshot 0015, snapshots exist only for 0000, 0001, 0015); do not rewrite applied SQL; plan 009 confirms the risk but its status/commands are not proof of a fix. Test migrations from zero and the upgrade of a restored DB separately.
  - On PostgreSQL 17 prepare `pg_trgm` in schema `extensions` (0017 creates the extension and GIN index; 0018 moves it); verify extension owner role, `extensions.similarity` calls, index restore.
  - Separate owner/migrator and API roles; API role gets DML, sequences and functions but no DDL; bootstrap roles before restore; never run the API as a PostgreSQL admin role. Reconcile RLS: 0018 enables RLS with policy `deny_direct_access` (`USING(false)` / `WITH CHECK(false)`); preferred fix is explicit policies for the API server role; no superuser to bypass errors.
  - API and migration runner connect over the internal Docker network; DB port is not published; remove dependence of connection parameters on the Supabase hostname; TLS for external connections verified with the source CA. Recompute connection budget (sum of `PG_POOL_MAX` for API, possible web pool, migration jobs, ops reserve).

## Beget migration: Storage and file references
- source: /Users/kdvornichenko/bio-exam/plans/beget-migration.md
- type: api-contract
- content:
  - Keep the external service/API contract; replace Supabase calls with a local file provider module (read text and Buffer, write/upsert with MIME and Cache-Control, list, recursive walk, metadata, access-checked links, copy/move prefix, delete via the existing user API, ZIP export). Data in a persistent volume outside container images.
  - Full manifest of all 2691 objects needed (current `listFilesRecursive` does not prove backup completeness); keep media-library contract (pagination, order, MIME, metadata); migration copy is non-destructive and the plan itself does not authorize deleting source data; never rewrite the hostname inside an already signed URL, convert existing links to key/application URL; signed-URL client cache is 50 minutes and must be aligned with new TTLs; ETag is not a universal SHA-256.
  - Prompt/explanation content, `answer_keys.json` and future homework photos stay private, access issued by the API with permission checks; no static serving of the whole directory; verify keys cannot escape the storage root via path traversal or symlink.
  - Inventory links in `users.avatar`, `users.avatar_cropped`, questions, markdown/MDX, editor JSON, `question_drafts.payload`; map old Supabase URL to key/new application URL for known fields only (no global text replace); keep a transformation manifest for rollback; migrate original and cropped avatars. S3/MinIO is not needed for the initial placement.

## Beget migration: Authorization and web/API boundary
- source: /Users/kdvornichenko/bio-exam/plans/beget-migration.md
- type: protocol
- content:
  - Preserve users, password hashes, invitations, roles, grants and refresh tokens; do not auto-run seed or bootstrap-admin over the transferred DB. Sessions survive only if domain and `AUTH_JWT_SECRET` are kept (not yet proven).
  - `getServerMe` already calls `API_ORIGIN` but has a direct-DB fallback; Next still has `/api/auth/me` with `getMeData` and its own `pg` pool. Reduce production authorization to the Express API; web starts without `DATABASE_URL` and the JWT signing secret; "old files may be kept without connecting to production".
  - Keep `/api/*` routes, cookie names, HttpOnly, Secure, SameSite; prefer one public origin for site and API. Verify `app.set('trust proxy', 1)` for the real proxy chain; the proxy must overwrite forwarded headers.

## Beget migration: Runtime, Docker, CI/CD
- source: /Users/kdvornichenko/bio-exam/plans/beget-migration.md
- type: protocol
- content:
  - Runtime: API runs `node --enable-source-maps dist/index.js` without the serverless adapter; fix graceful shutdown (await `server.close()` before `pgPool.end()`, finite timeout, aligned `stop_grace_period`); separate liveness and readiness (`/healthz/db` currently exposes connection details); explicit storage root in a persistent volume; bounded writable `/tmp`; ZIP export currently buffers in memory - measure the largest real export and set limits, "streaming add only if necessity is confirmed"; in-memory rate limiter needs a shared store only for multiple replicas; no worker, cron, Realtime, Edge Functions or SMTP found in the API.
  - Target scheme: reverse proxy for one domain (`/api/*` to API, pages and Next static to web); only 80/443 and managed SSH public; web/API/DB ports not exposed; PostgreSQL 17 and files in volumes; recreate-style release (short downtime accepted) with healthchecks and rollback to the previous digest; backups outside the VPS. Deployment variant: Docker Compose + GitHub Actions + registry (Kamal/Coolify as alternatives, Kubernetes and Timeweb App Platform not chosen).
  - Docker: multi-stage Dockerfiles for web and API on pinned Node 24, non-root, native modules (`sharp`) checked on Linux; `yarn install --immutable`; "primary lockfile `yarn.lock`; keep `package-lock.json` but do not mix package managers"; build `@bio-exam/rbac` first; web `output: 'standalone'`; separate migration target/job (current command uses `tsx` from devDependencies and cwd-dependent migrations dir); never `turbo start` in runtime; exclude `.env*`, `.git`, local uploads, build cache from the Docker context (dotenv uses `override: true`); separate build/runtime env so one digest works in staging and production; verify `next/font/google` network need at build; healthchecks, memory limits, restart policy, log rotation.
  - CI on PR: immutable install, RBAC build, typecheck, web lint, build web/API, E2E on synthetic data, migrations from zero and upgrade compatibility, Docker build/secret checks; keep existing tests; "do not invent root `yarn verify` without implementation". CD after merge to `master`: build images once, publish to GHCR with SHA/OCI labels, scan and keep SBOM/provenance, verify digest on CI stand, promote the same artifact; production tied to a GitHub Environment (manual promotion recommended during migration); serialize deploys with a server lock; compatible expand-contract migration as a separate job; no automatic DB downgrade; restricted SSH or CD-agent, narrow wrapper account, read-only GHCR token on the VPS; secrets separate from image and repo, BuildKit secrets for build secrets.

## Beget migration: Data transfer, rollback, observability, end-to-end verification
- source: /Users/kdvornichenko/bio-exam/plans/beget-migration.md
- type: nfr
- content:
  - Before window: full DB and bucket inventory (key, bytes, MIME, metadata, SHA-256); selective logical dump (not Supabase `auth`, `storage`, `realtime` schemas blindly); `pg_dump` custom format and `pg_restore --no-owner --no-privileges --exit-on-error` after checking ownership and extensions; no major version upgrade combined with the move; first non-destructive file copy; full trial restore with measured timings; new stack on a separate hostname; lower DNS TTL early.
  - Window: close new exam sessions, maintenance on old and new entry with writes forbidden; freeze point, release manifest and restorable source backup; final dump and object manifest; restore and transform links; verify row counts, UUIDs, fingerprints, FK, sequences, history, indexes, policies; verify all objects by key, bytes, SHA-256; switch DNS and run HTTPS/readiness/login/test/attempt/Storage/export checks; allow writes only on target; keep source backup and infrastructure until restore is verified.
  - Rollback: normal release returns previous web/API digest and proxy config on a compatible schema; initial move before new writes returns the old entry; after new writes DNS rollback alone is insufficient (reverse transfer must be verified before first writes, otherwise forward recovery only).
  - Observability and backups: HTTPS availability, readiness, 5xx rate, API latency, CPU/RAM/disk, DB connections, failed migrations, storage errors; Pino/stdout first; log redaction of cookies, tokens, DB credentials, exam answers; daily `pg_dump` plus file copy to restricted external storage (disk snapshots or copying live PGDATA do not replace backups); PITR only on separate requirement; verified restore with recorded date, rows, object hashes, status, repeat command.
  - E2E journeys (real API/DB/file volume): login/SSR profile/refresh/logout; admin/student roles; old question with markdown/MDX and image; image and avatar upload; question create/move/ZIP export; exam with reload and submit/resubmit; text and fuzzy search (`pg_trgm`); release with open exam and rollback; DB/file outage and recovery. Static commands: `yarn install --immutable`, `yarn workspace @bio-exam/rbac build`, `yarn typecheck`, `yarn workspace @bio-exam/web lint`, `yarn build`; "a missing command is not a gate".
  - Implementation stages 0-7 (production inventory; DB and migrations; local storage and links; web/API runtime; containers; CI/CD; end-to-end checks; rehearsal and cutover). Existing Vercel files, `package-lock.json`, old tests and legacy files are not to be deleted during preparation; minimize changes to large route modules by keeping storage signatures; apply `simplify` to own diff before declaring ready.
  - Open questions before implementation: production domains/DNS, whether the checked project equals the Vercel production env, maximum ZIP, peak CPU/RAM and concurrent exams, future photo size/frequency/retention, acceptable write-freeze window and RPO/RTO, VPS and external backup access, GitHub settings (private/public repo, Environment rules, GHCR rights), production promotion policy and operations owner.
