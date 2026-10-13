# Codebase Concerns

**Analysis Date:** 2026-07-27

## Tech Debt

**No repository verification baseline:**
- Issue: The root exposes `build`, `lint`, and `typecheck`, but no `test` or aggregate `verify` command. `turbo.json` has no test task, and the server and RBAC packages expose neither test nor lint scripts. The 11 committed `*.test.ts` files are top-level `node:assert` programs with no configured repository runner.
- Files: `package.json`, `turbo.json`, `app/server/package.json`, `app/web/package.json`, `packages/rbac/package.json`, `app/server/src/lib/tests/question-type-resolver.test.ts`
- Impact: Security and concurrency changes have no repeatable merge gate; committed tests can silently stop running.
- Fix approach: Implement the scripts, Turbo task, and CI workflow specified by `plans/001-project-operating-baseline.md`; make immutable install plus `yarn verify` the required gate.

**Conflicting package-manager state:**
- Issue: `package.json` declares Yarn 4.12.0 while both `yarn.lock` and `package-lock.json` are committed.
- Files: `package.json`, `yarn.lock`, `package-lock.json`
- Impact: npm and Yarn resolve different dependency graphs, so local audits and deployment builds can report or ship different versions.
- Fix approach: Keep Yarn as the single package manager, remove the redundant lockfile through the repository's recoverable deletion policy, and add a CI guard as specified by `plans/002-dependency-security.md`.

**God modules in critical test flows:**
- Issue: `app/server/src/routes/tests/index.ts` is 2,723 lines and owns topics, tests, scoring, questions, assets, import/export, dashboard, attempts, and route composition. `app/web/components/tests/TestRunner.tsx` is 1,057 lines and owns answer state, persistence, timers, telemetry, submission, retakes, dialogs, and presentation.
- Files: `app/server/src/routes/tests/index.ts`, `app/web/components/tests/TestRunner.tsx`, `plans/010-module-decomposition.md`
- Impact: Route precedence and React effect timing make small changes high-risk; unrelated features share state and review surface.
- Fix approach: Add characterization tests first, then split the router by domain and extract TestRunner persistence, telemetry, and submission hooks without changing public paths or props.

**Duplicate authorization boundary:**
- Issue: Express computes the canonical session and permission model, while Next independently verifies JWTs, creates a second PostgreSQL pool, queries users/roles/grants, and computes permissions.
- Files: `app/server/src/middleware/auth/session.ts`, `app/server/src/routes/auth/me.ts`, `app/web/lib/auth/server/getMeData.ts`, `app/server/src/db/index.ts`
- Impact: Policy fixes must be duplicated; the two implementations can disagree about role revocation, DB overrides, pool limits, or response shape.
- Fix approach: Make Express `/api/auth/me` authoritative and reduce `app/web/lib/auth/server/getMeData.ts` to an adapter, following `plans/003-auth-session-security.md`.

**Fragmented frontend request behavior:**
- Issue: `apiFetch` retries once after a 401, while the global SWR fetcher calls `fetch` directly and parses every response as JSON without checking `response.ok`.
- Files: `app/web/lib/api-fetch.ts`, `app/web/lib/fetcher.ts`, `app/web/lib/swr-config.ts`
- Impact: Protected screens can treat 401 or error bodies as successful data, bypass refresh handling, and surface inconsistent failures.
- Fix approach: Build one typed JSON/SWR adapter over `apiFetch`, define non-OK and malformed-JSON behavior, and migrate protected callers in bounded groups as specified by `plans/007-frontend-runtime.md`.

**Drizzle metadata discontinuity:**
- Issue: The migration journal includes `0016` through `0020`, but the latest snapshot is `app/server/drizzle/meta/0015_snapshot.json`. Objects added by later SQL, including `question_search_documents`, are absent from that snapshot.
- Files: `app/server/drizzle/meta/_journal.json`, `app/server/drizzle/meta/0015_snapshot.json`, `app/server/drizzle/0017_question_search_documents.sql`, `app/server/drizzle/0019_session_draft_telemetry.sql`, `app/server/drizzle/0020_short_answer_variants.sql`, `app/server/src/db/schema.ts`
- Impact: Future Drizzle generation can re-emit existing objects or propose destructive schema changes.
- Fix approach: Reconcile the chain against a disposable PostgreSQL database using supported Drizzle tooling; preserve applied SQL and add a clean-generation drift check per `plans/009-drizzle-metadata.md`.

**Editor lifecycle debt:**
- Issue: Editor utilities mutate refs during render, access browser globals in render/default parameters, and retain speech-recognition listener/object state after cleanup.
- Files: `app/web/components/editor/editor-hooks/use-debounce.ts`, `app/web/components/editor/plugins/code-action-menu-plugin.tsx`, `app/web/components/editor/plugins/actions/counter-character-plugin.tsx`, `app/web/components/editor/plugins/actions/speech-to-text-plugin.tsx`
- Impact: SSR can fail, debounced work can run after unmount, and repeated enable/disable cycles can accumulate listeners or stale closures.
- Fix approach: Move browser access and ref synchronization into effects, expose debounce cancellation, and detach speech resources completely under focused lifecycle tests.

## Known Bugs

**Answer write-ahead log loses rapid cross-question edits:**
- Symptoms: One shared 600 ms debouncer performs both the localStorage WAL write and server PATCH. Editing another question inside the window cancels the earlier callback before either persistence layer records it.
- Files: `app/web/components/tests/TestRunner.tsx`, `app/web/lib/tests/api.ts`
- Trigger: Change question A, navigate immediately, and change question B within 600 ms; reload before another successful save.
- Workaround: Pause at least 600 ms after every answer change. The durable fix is synchronous per-mutation WAL plus debounced, flushable network synchronization from `plans/005-client-draft-durability.md`.

**Question-editor autosave drops the latest draft on navigation:**
- Symptoms: Draft changes are scheduled on a 700 ms timer; unmount cleanup clears the timer, while back navigation immediately calls `router.push`.
- Files: `app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx`
- Trigger: Edit a draft and navigate back or away before the autosave delay expires.
- Workaround: Wait for autosave before navigation. The fix is to track pending writes, flush before controlled navigation, and warn only while a write is unsaved.

**Timed tests can be submitted without a session:**
- Symptoms: Submit looks up the latest session by user/test and explicitly accepts a timed submission when no session exists.
- Files: `app/server/src/routes/tests/public.ts`, `app/web/lib/tests/api.ts`
- Trigger: Call `POST /api/tests/public/tests/:id/submit` for a published timed test without calling `/start`.
- Workaround: None enforced server-side. Require the exact open `sessionId` in the submit contract and reject absent, closed, foreign, or mismatched sessions.

**Attempt start and submit are non-atomic:**
- Symptoms: Start performs a read-then-insert with no unique open-session constraint. Submit inserts an attempt and closes matching open sessions in separate operations. `clientAttemptId` is optional server-side and regenerated for every client submit call.
- Files: `app/server/src/routes/tests/public.ts`, `app/server/src/db/schema.ts`, `app/web/lib/tests/api.ts`
- Trigger: Send concurrent start requests, concurrent submits, or retry submission after a response loss.
- Workaround: Client-side button disabling reduces ordinary duplicates but does not prevent concurrent requests. Add session constraints and claim/insert/close in one transaction with a stable retry-cycle ID.

**Concurrent draft PATCH requests lose fields:**
- Symptoms: Answer and telemetry PATCHes read the same session JSON, merge in memory, and overwrite the row without a lock or version predicate.
- Files: `app/server/src/routes/tests/public.ts`, `app/web/components/tests/TestRunner.tsx`
- Trigger: An answer save and telemetry save overlap for the same session.
- Workaround: Avoid parallel PATCHes. The fix is a row lock/version or atomic JSONB update that preserves independent fields.

## Security Considerations

**Revoked roles remain authorized through JWT claims:**
- Risk: Production session middleware unions DB roles with roles embedded in the JWT. Removing a DB role does not remove the claim, and the default access-token lifetime is the 30-day session lifetime.
- Files: `app/server/src/middleware/auth/session.ts`, `app/server/src/routes/auth/login.ts`, `app/server/src/config/auth.ts`, `app/server/src/lib/constants.ts`, `app/web/lib/auth/server/getMeData.ts`
- Current mitigation: Production checks that the user exists and is active; JWT signatures and expiry are verified.
- Recommendations: Treat current DB roles as authoritative, use short-lived access tokens bound to a revocable server-side session family/version, and test role removal immediately after token issue.

**Logout does not revoke access tokens:**
- Risk: Logout revokes only the refresh token and clears browser cookies. A copied access token remains valid until JWT expiry, which defaults to 30 days.
- Files: `app/server/src/routes/auth/logout.ts`, `app/server/src/routes/auth/login.ts`, `app/server/src/lib/constants.ts`
- Current mitigation: The browser cookie is cleared and the refresh token row is marked revoked.
- Recommendations: Bind access tokens to a revocable server session and revoke the session family on logout, password reset, and administrative action.

**Refresh rotation is replayable under concurrency:**
- Risk: Refresh-token validation occurs before the transaction; the revoke update is unconditional; the access cookie is set before rotation commits. Two concurrent requests can validate the same token and create multiple successors, and a transaction failure can still leave a new access cookie on the response.
- Files: `app/server/src/routes/auth/refresh.ts`, `app/server/src/db/schema.ts`
- Current mitigation: Refresh tokens are hashed at rest, expire, and are marked revoked during normal rotation.
- Recommendations: Atomically claim a single-use token inside the transaction, detect family replay, commit before emitting cookies, and test two concurrent refreshes plus forced transaction failure.

**Account lockout enables user-targeted denial of service:**
- Risk: Five failed passwords set a 30-minute account lock. An attacker who knows a login can repeatedly lock that user.
- Files: `app/server/src/routes/auth/login.ts`, `app/server/src/middleware/rateLimiter.ts`, `app/server/src/db/schema.ts`
- Current mitigation: Login uses bcrypt timing protection and an in-memory login+IP limiter.
- Recommendations: Replace hard per-account lockout with shared progressive account+IP throttling and provide an operational recovery path.

**Attempt mutation authorization is incomplete:**
- Risk: Test read routes enforce assignment, but start, draft-save, and submit routes check only authentication/session ownership. An authenticated user who knows a published test UUID can start and submit an unassigned test.
- Files: `app/server/src/routes/tests/public.ts`, `app/server/src/db/schema.ts`
- Current mitigation: Topic/test read endpoints query `testAssignments`; draft PATCH verifies that the session belongs to the user.
- Recommendations: Centralize an assigned-or-currently-privileged check and apply it to read, start, draft, and submit using current DB permissions.

**Shared asset mutation is over-authorized and path containment is incomplete:**
- Risk: Any authenticated user can list, upload, proxy, and delete shared assets. Delete checks only the textual `images/` prefix, then joins the unchecked suffix; `images/../...` can resolve outside the image directory in local fallback.
- Files: `app/server/src/routes/docs/assets.ts`, `packages/rbac/src/domains.ts`
- Current mitigation: Uploads have size, MIME, magic-byte, resize, and generated-filename controls. The proxy path uses resolved-path containment, but delete does not.
- Recommendations: Require a content-management permission, accept only normalized generated object names, and prove the resolved local delete target remains under `LOCAL_UPLOAD_DIR`.

**Ordinary users can enumerate sensitive directory fields:**
- Risk: The default `user` role receives `users.read`; that permission exposes up to 500 records with login, account state/timestamps, roles, birthdate, Telegram, phone, and email.
- Files: `packages/rbac/src/roles.ts`, `packages/rbac/src/domains.ts`, `app/server/src/routes/users/index.ts`
- Current mitigation: The route requires a signed-in session and `users.read`.
- Recommendations: Split minimal directory lookup from administrative inspection, remove broad read from the default role, and return sensitive fields only behind an admin-specific permission.

**Audited dependency graph contains high/critical advisories:**
- Risk: `yarn npm audit --all --recursive --severity high --json` reports 79 high and 2 critical advisory records. Direct workspace dependencies reported include Next, Multer, Sharp, Drizzle ORM, Lodash, PostCSS, TinyMCE, and `next-mdx-remote`.
- Files: `app/server/package.json`, `app/web/package.json`, `yarn.lock`
- Current mitigation: Upload routes limit file size and validate content; MDX normalization/sanitization helpers exist, but the affected packages remain in the resolved graph.
- Recommendations: Upgrade direct affected packages to patched compatible releases, prove upload/proxy/MDX/editor behavior with regression tests, and document reachability for unresolved transitive tooling advisories.

## Performance Bottlenecks

**Global search serializes independent categories:**
- Problem: An `all` search awaits tests, questions, users, groups, and attempts one after another.
- Files: `app/server/src/services/search/database-search.ts`
- Cause: `searchDatabase` uses a `for...of` loop with an awaited query per allowed scope.
- Improvement path: Execute allowed category searches concurrently and reassemble results in deterministic category order; preserve permission filtering and per-category limits.

**Question prompt hydration has unbounded fan-out:**
- Problem: Public test reads use `Promise.all` across every question; each question can serially try up to five storage paths.
- Files: `app/server/src/routes/tests/public.ts`, `app/server/src/services/storage/storage.ts`
- Cause: Route-local hydration bypasses the existing bounded `readFilesParallel(paths, concurrency = 5)` helper.
- Improvement path: Add bounded per-question concurrency while preserving candidate fallback order and per-question failure semantics.

**Editor entry eagerly imports optional features and emoji data:**
- Problem: `plugins.tsx` statically imports roughly 70 editor plugins and the markdown emoji transformer; the transformer statically imports a 317 KB, 16,602-line emoji list.
- Files: `app/web/components/editor/plugins.tsx`, `app/web/components/editor/transformers/markdown-emoji-transformer.ts`, `app/web/components/editor/utils/emoji-list.ts`
- Cause: Runtime `isPluginEnabled` checks happen after modules enter the bundle, so disabled features still contribute to the entry graph.
- Improvement path: Split editor profiles and lazy-load optional plugin groups and emoji data; enforce a measured editor chunk budget.

**ZIP export is serial and fully buffered:**
- Problem: Export queries answers per test, downloads storage files sequentially, converts every file to a Buffer, and concatenates the entire archive before `res.send`.
- Files: `app/server/src/routes/tests/index.ts`, `app/server/src/services/storage/storage.ts`, `app/server/vercel.json`
- Cause: `createZip` collects archive chunks and loops downloads one by one; the route runs under a 30-second, 1,024 MB function limit.
- Improvement path: Fetch export metadata set-wise, bound downloads, stream the archive with cancellation/backpressure, and record query count, concurrency, and peak memory.

## Fragile Areas

**Authentication and RBAC:**
- Files: `app/server/src/middleware/auth/session.ts`, `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/refresh.ts`, `app/server/src/routes/auth/logout.ts`, `app/server/src/services/rbac/rbac.ts`, `app/web/lib/auth/server/getMeData.ts`
- Why fragile: Roles exist in DB and JWTs, permission overrides are cached for five minutes, two runtimes compute authorization, and refresh cookies/rows must change atomically.
- Safe modification: Run GitNexus impact for each changed symbol, add DB-backed auth integration tests, and change the canonical Express boundary before removing the duplicate Next policy.
- Test coverage: Existing auth tests cover cookie-name and redirect helpers only; no committed test covers role revocation, logout invalidation, refresh replay, lockout, or `/auth/me` parity.

**Public attempt/session workflow:**
- Files: `app/server/src/routes/tests/public.ts`, `app/server/src/db/schema.ts`, `app/web/components/tests/TestRunner.tsx`, `app/web/lib/tests/api.ts`
- Why fragile: Authorization, timing, draft persistence, telemetry, scoring, idempotency, and session closure cross DB and browser state without one transaction-level contract.
- Safe modification: Define the exact session/attempt invariants first, add constraints through migrations, then update the server and client contract together.
- Test coverage: Scoring and telemetry helpers have assertion tests, but start/draft/submit routes and TestRunner concurrency/retry behavior have no route or component integration coverage.

**Drizzle migration history:**
- Files: `app/server/drizzle/meta/_journal.json`, `app/server/drizzle/meta/0015_snapshot.json`, `app/server/drizzle/0016_session_draft_answers.sql`, `app/server/drizzle/0020_short_answer_variants.sql`
- Why fragile: Applied SQL, journal entries, schema definitions, and snapshots do not represent one continuous generation history.
- Safe modification: Use a disposable DB, never edit applied migration SQL, and stop if reconciliation proposes drops/recreates or needs live production state.
- Test coverage: No CI job applies migrations from zero and verifies that a subsequent generation is empty.

**Editor runtime:**
- Files: `app/web/components/editor/plugins.tsx`, `app/web/components/editor/editor-hooks/use-debounce.ts`, `app/web/components/editor/plugins/actions/speech-to-text-plugin.tsx`, `app/web/components/editor/utils/emoji-list.ts`
- Why fragile: A large static plugin graph mixes browser-only APIs, Lexical subscriptions, debounced callbacks, and copied/vendor-like modules.
- Safe modification: Change one lifecycle concern at a time, retain serialization behavior, and verify SSR plus listener/debounce cleanup.
- Test coverage: No editor lifecycle or SSR tests cover the identified browser-global, ref, debounce, or speech cleanup paths.

**Asset storage fallback:**
- Files: `app/server/src/routes/docs/assets.ts`, `app/server/src/routes/users/avatar.ts`, `app/server/src/services/storage/storage.ts`, `app/server/src/app.ts`
- Why fragile: Supabase and local filesystem paths have separate control flow and synchronous filesystem operations; containment validation is inconsistent between proxy, delete, avatars, and test assets.
- Safe modification: Normalize object names at the boundary, centralize resolved-root checks, and test both configured-storage and local-fallback modes.
- Test coverage: No route tests cover traversal, permission matrices, MIME cleanup, legacy paths, or local/Supabase parity.

## Scaling Limits

**Authentication rate limiting:**
- Current capacity: Five login attempts per minute per login+IP key and ten refresh attempts per minute per IP in one process.
- Limit: The module-level `Map` is not shared across Vercel/server instances and resets on process restart, so aggregate limits multiply with instance count.
- Scaling path: Use a shared TTL store with atomic increments and preserve the same response headers and account+IP semantics.
- Files: `app/server/src/middleware/rateLimiter.ts`, `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/refresh.ts`

**Database connections:**
- Current capacity: Express defaults to 20 production pool connections; the duplicate Next auth pool defaults to 5 more per runtime instance.
- Limit: Horizontal/serverless scaling multiplies both pools per instance and can exhaust PostgreSQL connection limits.
- Scaling path: Remove the Next DB pool, size the canonical pool to the deployment model, and use a provider pooler for serverless concurrency.
- Files: `app/server/src/db/index.ts`, `app/web/lib/auth/server/getMeData.ts`

**ZIP export:**
- Current capacity: One export must fit a 30-second, 1,024 MB Vercel function while holding downloaded file buffers plus the completed archive.
- Limit: Archive size and duration scale with total topic assets; memory is proportional to input plus ZIP output.
- Scaling path: Stream with backpressure or use bounded object-storage/spill-to-disk generation when the adapter cannot stream.
- Files: `app/server/src/services/storage/storage.ts`, `app/server/src/routes/tests/index.ts`, `app/server/vercel.json`

**RBAC cache consistency:**
- Current capacity: Per-process role and user permission caches live for five minutes.
- Limit: Invalidation clears only the current process; multiple instances can retain different permission snapshots until TTL expiry.
- Scaling path: Prefer versioned/shared invalidation or shorter authoritative lookups for security-sensitive changes.
- Files: `app/server/src/services/rbac/rbac.ts`, `app/server/src/routes/users/index.ts`, `app/server/src/routes/rbac/index.ts`

## Dependencies at Risk

**Direct production dependencies with audit findings:**
- Risk: The resolved graph reports high-severity findings for `next`, `multer`, `sharp`, `drizzle-orm`, `lodash`, `postcss`, `tinymce`, and `next-mdx-remote`; several process attacker-controlled requests, uploads, identifiers, CSS/MDX, or editor content.
- Impact: Depending on reachability, risks include authorization proxy bypass, denial of service, SQL identifier injection, file disclosure, XSS, and server-side MDX code execution.
- Migration plan: Upgrade to patched compatible releases, remove the single Lodash debounce dependency if practical, and use `plans/002-dependency-security.md` as the compatibility/test checklist.
- Files: `app/server/package.json`, `app/web/package.json`, `yarn.lock`, `app/server/src/routes/docs/assets.ts`, `app/web/proxy.ts`, `app/web/components/tests/MdxRenderer.tsx`

**Transitive audit volume:**
- Risk: The audit also reports transitive high/critical advisories in build/deployment packages such as `basic-ftp`, `minimatch`, `tar`, `undici`, and `ws`; not every path is production-reachable.
- Impact: Blind suppression hides reachable tooling/deployment risks, while blind upgrades can destabilize the build.
- Migration plan: Record dependency path, runtime reachability, patched upstream version, and owner for every unresolved high/critical advisory.
- Files: `yarn.lock`, `package.json`, `app/server/package.json`, `app/web/package.json`

**Mismatched Tiptap major versions:**
- Risk: `packages/rbac/package.json` depends on Tiptap 3 while `app/web/package.json` depends on Tiptap 2, despite RBAC being a shared authorization package.
- Impact: The shared package pulls editor runtime dependencies into unrelated consumers and duplicates major versions in the workspace graph.
- Migration plan: Remove editor dependencies from RBAC if unused; otherwise move editor-specific code to a dedicated package and align versions deliberately.
- Files: `packages/rbac/package.json`, `packages/rbac/src/index.ts`, `app/web/package.json`

## Missing Critical Features

**Continuous integration gate:**
- Problem: No `.github/workflows/**` pipeline runs immutable install, tests, lint, typecheck, build, or migration drift checks.
- Blocks: Security remediation and module decomposition cannot rely on repeatable pre-merge verification.
- Files: `package.json`, `turbo.json`, `plans/001-project-operating-baseline.md`

**Revocable session model:**
- Problem: Refresh-token rows are revocable, but access JWTs have no session-family/version binding and remain independently valid.
- Blocks: Immediate logout, password-reset revocation, administrator-forced logout, and reliable replay detection.
- Files: `app/server/src/db/schema.ts`, `app/server/src/routes/auth/login.ts`, `app/server/src/middleware/auth/session.ts`

**Atomic attempt contract:**
- Problem: There is no required session ID on submit, no one-open-session constraint, and no one-attempt-per-session constraint.
- Blocks: Enforced time limits, race-safe start/submit, and deterministic idempotent recovery after response loss.
- Files: `app/server/src/routes/tests/public.ts`, `app/server/src/db/schema.ts`, `app/web/lib/tests/api.ts`

## Test Coverage Gaps

**Auth and RBAC integration:**
- What's not tested: DB role removal after token issue, access invalidation on logout, refresh replay/concurrency, transaction failure before cookies, lockout abuse, shared-cache invalidation, and Express/Next auth parity.
- Files: `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/refresh.ts`, `app/server/src/routes/auth/logout.ts`, `app/server/src/middleware/auth/session.ts`, `app/web/lib/auth/server/getMeData.ts`
- Risk: Authorization regressions can ship while helper-level tests remain green.
- Priority: High

**Attempt authorization and concurrency:**
- What's not tested: Unassigned start/draft/submit, timed submit without exact session, concurrent starts, concurrent/retried submits, and overlapping answer/telemetry PATCHes.
- Files: `app/server/src/routes/tests/public.ts`, `app/server/src/db/schema.ts`, `app/web/lib/tests/api.ts`
- Risk: Unauthorized attempts, duplicated sessions/attempts, bypassed timers, and lost draft data.
- Priority: High

**Client persistence lifecycle:**
- What's not tested: Rapid changes across questions, reload/unmount inside the debounce window, failed retry, stable submission ID, immediate editor navigation, and autosave flush.
- Files: `app/web/components/tests/TestRunner.tsx`, `app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx`
- Risk: Latest student answers or author drafts disappear without a visible error.
- Priority: High

**Asset authorization and privacy:**
- What's not tested: `../` and encoded traversal, absolute/foreign storage paths, upload/delete permission matrices, user-directory field redaction, and local/Supabase parity.
- Files: `app/server/src/routes/docs/assets.ts`, `app/server/src/routes/users/index.ts`, `packages/rbac/src/roles.ts`
- Risk: Shared-file deletion and sensitive user metadata exposure remain undetected.
- Priority: High

**Migration continuity:**
- What's not tested: Applying every migration from zero and verifying an empty/expected subsequent Drizzle generation.
- Files: `app/server/drizzle/meta/_journal.json`, `app/server/drizzle/meta/0015_snapshot.json`, `app/server/drizzle.config.ts`
- Risk: A generated migration can duplicate or drop production objects.
- Priority: High

**Performance equivalence and budgets:**
- What's not tested: Search category concurrency/order, bounded prompt fallback behavior, ZIP byte/content equivalence and peak memory, and editor chunk size.
- Files: `app/server/src/services/search/database-search.ts`, `app/server/src/routes/tests/public.ts`, `app/server/src/services/storage/storage.ts`, `app/web/components/editor/plugins.tsx`
- Risk: Optimizations can change results/archives or replace one bottleneck with another.
- Priority: Medium

---

*Concerns audit: 2026-07-27*
