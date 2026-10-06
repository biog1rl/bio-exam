# Roadmap: bio-exam

## Milestones

- ✅ **v1.0 Надёжная основа** — Phases 1–8 and 07.1 (shipped 2026-10-06). Archive: `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`, `milestones/v1.0-MILESTONE-AUDIT.md`
- 🚧 **v2.0 Переезд на VPS (Beget)** — the move ran outside GSD on 2026-10-05 (`plans/beget-migration.md`, server profile `~/.claude/servers/bio-exam.md`); the site, API, database and files are on the VPS. The remainder (code removal of Supabase and Vercel, and the server runbook for the final copy and deletion at the old providers) is Phase 19 of v3.0
- 🚧 **v3.0 Открытые задания с фото и ручной проверкой** — Phases 9–19 (in progress, roadmap created 2026-10-06)
- 📋 **v4.0 Чаты учителя и ученика** — after v3.0, see note below
- 📋 **v5.0 PWA и push-уведомления** — last, see note below

## Phases

<details>
<summary>✅ v1.0 Надёжная основа (Phases 1–8, 07.1) — SHIPPED 2026-10-06</summary>

- [x] Phase 1: Verification baseline (16/16 plans) — completed 2026-10-03
- [x] Phase 2: Dependency security (9/9 plans) — completed 2026-10-05
- [x] Phase 3: Exam core (13/13 plans) — completed 2026-10-05
- [x] Phase 4: Authentication and web session (14/14 plans) — completed 2026-10-05
- [x] Phase 5: Attempt integrity (11/11 plans) — completed 2026-10-05
- [x] Phase 6: Draft durability (11/11 plans) — completed 2026-10-05
- [x] Phase 7: Storage and question content (17/17 plans) — completed 2026-10-05
- [x] Phase 07.1: Teachers and responsibility zones (21/21 plans, INSERTED) — completed 2026-10-05
- [x] Phase 8: Client requests, runtime and decomposition (28/28 plans + review fixes) — completed 2026-10-06

</details>

### 🚧 v3.0 Открытые задания с фото и ручной проверкой (In Progress)

**Milestone Goal:** Teachers add open questions; students answer with text and/or photos (from the phone through a QR link), teachers grade them by hand on a 0–3 scale, and students see the result in their cabinet. Then the technical debt of v1.0 is closed and Supabase and Vercel are removed.

**Why eleven phases despite `granularity: standard` (4-6).** The order follows hard dependencies: result projection and readers before any attempt can be "на проверке"; the notification journal before review; server-side deadline finalisation before the upload window, the window before photos, photos before the QR link, QR before open-question submit, submit before review; retention after the photo schema; the decommission last and not before 2026-10-12. Folding phases would merge unrelated risk areas (database projection, client lifecycle, image processing, public token links, review concurrency). Same reasoning as v1.0: do not collapse them in a later review. Tech-debt items that touch a module built in this milestone are done in that module's phase; the rest is Phase 18.

**Sources:** requirements `REQUIREMENTS.md` (74 v1 requirements); research `research/SUMMARY.md` (phase structure, research flags, early measurements and spikes); client answers 12–19 in `milestones/v1.0-phases/07.1-teachers-and-responsibility-zones/07.1-CLIENT-ANSWERS.md`.

**Rules for the whole milestone:**
- The `open` question type is seeded inactive (`is_active = false`). Until Phase 17 production authors cannot create open questions, so success criteria of Phases 9-16 are verified in tests, seeded databases and dev/e2e runs where the seed activates the type, not as production behaviour.
- `yarn verify` green is the precondition for closing every phase (ADR-0003). Changes to the modules `scored-attempt`, `attempt-sessions`, `storage`, `question-content`, `exam-core` and the client `attempt-lifecycle` start with characterization tests through the module interface.
- Code intelligence is CodeGraph (`codegraph impact` before editing a symbol, `codegraph affected` over the diff). Agents never commit; the user pushes. Agents have no access to the server or to real devices, so steps marked "User steps" are done by the user from the written runbook or instruction.
- Line numbers in `research/*.md` date from commit `1962edd`; re-verify them when planning each phase.
- Phases 9 and 10 can run in parallel; Phases 16 and 18 can run in parallel; everything else runs in numeric order (11 before 12 is fixed). Readers (Phase 9) are strictly done before attempts "на проверке" can exist (Phase 14).

**Phase Numbering:** continues from v1.0 (last phase 8, inserted 07.1). Decimal phases (9.1, 9.2) are urgent insertions.

- [x] **Phase 9: Result foundation and readers** - Stored result = immutable auto facts + appended reviews; one shared function; every reader handles "на проверке" (completed 2026-10-06)
- [x] **Phase 10: Notification journal and bell** - General notification-event journal, header bell with unread count and deep links, first real producer (completed 2026-10-06)
- [ ] **Phase 11: Deadline finalisation, upload window and background jobs** - Server closes a timed attempt at the deadline without losing text; one rule for the photo window; background jobs, clean shutdown, one refresh per browser (research phase)
- [ ] **Phase 12: Photos on session authentication** - Up to 5 processed photos per open answer from the computer, private delivery, bounded memory (research phase)
- [ ] **Phase 13: Token, QR and phone page** - Sign-in-free phone upload page through a scoped link and a QR code in the runner (research phase)
- [ ] **Phase 14: Authoring and submitting open questions** - Open question editor, text and photo answers, "на проверке" after submit
- [ ] **Phase 15: Review** - Queue, review screen, score 0–3, return for correction, history, final result, notifications (research phase)
- [ ] **Phase 16: Retention and cleanup** - One-year photo retention that keeps review records, orphan cleanup, honest wording
- [ ] **Phase 17: Enabling and acceptance** - e2e of the full loop, real-phone acceptance, deploy protection for open windows, then the type is offered to authors
- [ ] **Phase 18: Remaining v1.0 tech debt** - Deferred v1.0 findings not folded into earlier phases are fixed or closed with a reason
- [ ] **Phase 19: Decommission of Supabase and Vercel** - Code without Supabase and Vercel, ADR-0004 amended, user runbook for the final copy and deletion (not before 2026-10-12, research phase)

## Phase Details

### Phase 9: Result foundation and readers

**Goal**: A stored test result is the auto-scored facts of the attempt plus appended manual reviews, one shared function computes the final result, and every reader of a result already handles an attempt "на проверке", before any such attempt can exist.
**Depends on**: Nothing (first v3.0 phase; builds on v1.0 Phases 3 and 5). Can run in parallel with Phase 10.
**Requirements**: RES-01, RES-02, RES-03, RES-04, RES-05, OPEN-02, PLAT-05
**Success Criteria** (what must be TRUE):
  1. After the migration every existing attempt shows the same score, percentage and passed mark in every reader as before; a table test proves that the stored projection (review status, final points, percentage, passed) equals one `exam-core` recomputation (auto facts plus the last review of each open answer, scored 0–3) for every attempt state, including seeded attempts with open answers.
  2. With the seed, an attempt under review shows "на проверке" with no percentage and no passed/failed mark in the admin attempts list and detail, dashboards, charts, "my attempts", user profile, test landing page, attempt review and global search (ZIP export carries no results); it is left out of averages and appears on charts only after grading, at its submission date. One behavioural test walks every reader.
  3. The admin attempts list can be filtered by review state (all, на проверке, проверено) and the existing user-status filter behaves as before.
  4. Submit rejects answers for questions that are not in the test and text answers over the length limit with a readable 4xx, and never rewrites the stored auto facts of an attempt.
  5. Tables added by this milestone follow one recorded user-deletion rule (owned data of the deleted user goes with them, files first; authored reviews stay with the author cleared), checked by a catalogue test that later phases keep green.

**Folded-in work**: `DashboardClient` unused variables (one part of DEBT-02, which is mapped to Phase 13). Also in scope without a requirement ID: the `open` type is seeded inactive; question payloads sent to students never carry reference answer or criteria text; an unknown question type from an old browser tab gets a 4xx instead of 500. The first plan records the rule for how new tables relate to user deletion (research open question 1) before Phase 10 writes its migration.
**User steps (outside the repository)**: release of migrations 0026+ (projection columns, back-fill of the existing attempts, CHECK) to production through the usual deploy; confirm a fresh backup exists before it and check the back-filled attempts afterwards (the plan supplies the query).
**Plans**: 19/19 plans complete in 11 waves
Plans:
**Wave 1**
- [x] 09-01-PLAN.md — user-deletion rule: ADR-0007, foreign-key catalogue test, AGENTS.md and data skill (wave 1)
- [x] 09-02-PLAN.md — characterization of all eight result readers and submit replay before changes (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 09-03-PLAN.md — exam-core `open` template, `manual` metric, `AUTO_SCORED_TEMPLATES`, meta-tests (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 09-04-PLAN.md — exam-core `computeAttemptOutcome`/`projectionOf`, answer limits, `ANSWERS_INVALID`, `pending` question status (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 09-05-PLAN.md — migration 0026 (projection, back-fill, CHECK, facts trigger, inactive `open`), projection written at submit, attempt fixtures (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 09-06-PLAN.md — scored-attempt: `attemptResultColumns`, `materializeAttemptOutcome`, `reconcileOutcomes`, view with review status (wave 5)
- [x] 09-08-PLAN.md — `open` in admin settings: server guards and admin pages (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 09-07-PLAN.md — submit and draft input check (422/400), unknown type 4xx, `studentQuestionView` (wave 6)
- [x] 09-09-PLAN.md — staff readers: attempts list, `review` filter, `pendingTotal`, dashboard (wave 6)
- [x] 09-11-PLAN.md — web `answers-invalid` submit rejection and short-answer `maxLength` (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 09-10-PLAN.md — my attempts, chart data, profile, search readers; behavioural test (wave 7)
- [x] 09-12-PLAN.md — web result view, labels, attempts list, review filter and tile (wave 7)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 09-13-PLAN.md — web student screens: runner result, my attempts, test page, progress chart (wave 8)
- [x] 09-14-PLAN.md — web attempt review header and pending questions (wave 8)
- [x] 09-15-PLAN.md — web student profile (wave 8)
- [x] 09-16-PLAN.md — web dashboards and `DashboardClient` unused variables (wave 8)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 09-17-PLAN.md — `number | null` result contract and the eight-reader behavioural test (wave 9)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 09-18-PLAN.md — e2e seed and spec on desktop and mobile (wave 10)

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 09-19-PLAN.md — skills and README, phase gates: `yarn verify`, full `yarn e2e` (wave 11)

**UI hint**: yes

### Phase 10: Notification journal and bell

**Goal**: Signed-in users have a general notification journal (reused later by chats and push) with a bell in the header, an unread count and deep links that re-check access.
**Depends on**: Nothing hard (can run in parallel with Phase 9); its migration follows the user-deletion rule recorded in Phase 9's first plan (PLAT-05).
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-05, NOTIF-06
**Success Criteria** (what must be TRUE):
  1. A teacher assigns a test to a student (directly or through a group); the student sees the header bell with an unread count ("9+" above nine), opens the list, follows the item's link to the test and the item becomes read; "прочитать все" clears the count.
  2. The browser tab title shows the unread count, and the count updates after sign-in, on tab focus and periodically without a reload.
  3. A deep link opened after the right to the object is gone (assignment revoked, test unpublished, topic disabled or test deleted; leaving a group keeps the per-student assignment and its access, user decision 2026-10-06) leads to a clear "no access" message and reveals nothing about the object.
  4. An event is written in the same transaction as its cause: a rolled-back cause leaves no event, and a retried request or repeated cause produces exactly one event per recipient and object (server test).
  5. The journal stores and lists an event of a kind the code does not know, delivery rows carry retry and lease fields, and events carry a collapse key, so chats (v4.0) and push (v5.0) add kinds and channels without changing existing rows.

**Folded-in work**: the producer "a test is assigned to the student, directly or through a group" (part of NOTIF-03, which is mapped to Phase 15 where its other events land) is built here as the first real producer so the bell works end to end. If the assignment routes make it heavy, it moves to Phase 15 without changing any mapping.
**User steps (outside the repository)**: none beyond the usual release of the migration.
**Plans**: 9/9 plans complete in 7 waves
Plans:
**Wave 1**
- [x] 10-01-PLAN.md — journal tables and migration 0027, `recordNotifications` in the cause transaction, `inbox` channel, user-deletion cases (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 10-02-PLAN.md — `test.assigned` producer: `addAssignments` transaction in the three assignment routes, rollback both ways (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 10-03-PLAN.md — read API: list by cursor, unread count, read, read-all, kind texts (wave 3)
- [x] 10-09-PLAN.md — publication events: `recordTestPublished` in both branches of `updateTestSettings`, rollback, race with assignment (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 10-04-PLAN.md — `GET /api/notifications/:id/open` with access re-check and `NO_ACCESS` (wave 4)
- [x] 10-05-PLAN.md — header bell with count, tab title prefix, e2e seed and first spec (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 10-06-PLAN.md — popover list: rows, "Показать ещё", "Прочитать все", states, widths and contrast (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 10-07-PLAN.md — `/notifications/[id]` page: open, "Нет доступа к материалу", errors, crumbs (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 10-08-PLAN.md — e2e of success criteria 1–3 on a live assignment, skills and README, phase gates (wave 7)

**UI hint**: yes

### Phase 11: Deadline finalisation, upload window and background jobs

**Goal**: A timed attempt is closed by the server at its deadline without losing the student's typed text, the photo upload window after it is decided by one server rule, and the API can run periodic jobs, shut down cleanly and share one session refresh per browser.
**Depends on**: Phase 9, Phase 10
**Requirements**: TIME-01, TIME-02, TIME-03, TIME-04, TIME-06, PLAT-01, PLAT-02, PLAT-03, PLAT-04
**Research**: needs `/gsd-plan-phase 11 --research-phase` (UI after the deadline, race between the background finalisation and the lazy one, draft handling on "already submitted", autodeploy and open windows). Characterization of `lifecycle-submit` and `lifecycle-time` first.
**Success Criteria** (what must be TRUE):
  1. A student whose connection drops before the timer ends and who never comes back: after the deadline plus the existing grace period the server has finalised the attempt itself with the last saved answers (source "deadline"); text typed offline before the deadline and synced within grace is kept; the finalisation on read and the background finalisation produce exactly one result (server test of the race).
  2. After the deadline the answer text is read-only; the upload window ends at the earlier of submit and timer end plus the test's minutes (untimed tests: from submit), decided by one server function on database time that accepts a photo inside the window and refuses it afterwards with a clear message; the page shows until when photos can be added, counted from server time.
  3. When the server finalised the attempt before the student's own submit arrives, the page says "ответ принят, фото можно добавить до ЧЧ:ММ" (or just that the answer was accepted when there is no window) instead of "ответы не засчитаны", and unsent local text is kept until it is compared with what the server stored.
  4. Periodic jobs start only from the server entry point; two API instances overlapping during a deploy never run one job twice; a command runs a named job once; on a stop signal the API waits for in-flight requests and jobs and only then closes the database pool.
  5. Several tabs of one browser cause one session refresh and no refresh-token replay; logging out removes that user's attempt draft keys from the browser.

**Folded-in work**: CR-03 (bfcache) and CR-05 (repeated start without a session) from the v1.0 deferred findings, because they touch the client attempt-lifecycle module changed here (part of DEBT-08, which is mapped to Phase 18). PLAT-04 is v1.0 SEC-02, a release precondition.
**User steps (outside the repository)**: confirm on the server that the container stop timeout (Compose `stop_grace_period`; the Compose file is on the server) is at least the API's drain time; release this phase when no timed attempt is running (existing deploy protection).
**Plans**: 5/18 plans executed in 10 waves
Plans:
**Wave 1**
- [x] 11-01-PLAN.md — exam-core contract: `serverNow`, optional `uploadClosesAt`/`submitSource`, 409 body, `SessionFateSchema`, upload-window codes; `serverNow` on `/start` (wave 1)
- [x] 11-02-PLAN.md — characterization of the attempt lifecycle before changes: failed auto-submit offline, 409 on auto-submit (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-03-PLAN.md — migration 0030 (`photo_upload_window_minutes`, `upload_closes_at`), window at submit, view fields, settings API (wave 2)
- [x] 11-11-PLAN.md — server clock in the lifecycle, read-only text after the deadline, «Время вышло» panel, auto-retry (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 11-04-PLAN.md — `finalizeSessionByDeadline`: draft finalisation with source `deadline`, D-04, idempotency (wave 3)
- [x] 11-05-PLAN.md — one upload-window rule on database time with refusal body (wave 3)
- [ ] 11-10-PLAN.md — upload-window field in the test settings editor (wave 3)
- [ ] 11-12-PLAN.md — «Ответ принят» outcome, upload-window line with server-time countdown, fallback panel, focus (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 11-06-PLAN.md — lazy finalisation in `/start`, PATCH and `/submit`, extended 409 (wave 4)
- [ ] 11-13-PLAN.md — WAL reconciliation (D-14), unsent-text note, D-04 dialog note (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 11-07-PLAN.md — `GET …/sessions/:sessionId` session fate with lazy finalisation, route inventory (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 11-08-PLAN.md — background-jobs module, `finalize-deadlines`, `reconcile-outcomes`, three-path race test (wave 6)
- [ ] 11-14-PLAN.md — session fate before `/start` in the lifecycle (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 11-09-PLAN.md — clean shutdown, entry-point wiring, `jobs:run` (wave 7)
- [ ] 11-15-PLAN.md — CR-03 (drain with a request in flight, bfcache) and CR-05 (repeated start without a session) (wave 7)

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 11-16-PLAN.md — one session refresh per browser with Web Locks (wave 8)

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 11-17-PLAN.md — logout clears the user's draft keys (wave 9)

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 11-18-PLAN.md — e2e of criteria 1–3, docs and skills, user steps, phase gates (wave 10)

**UI hint**: yes

### Phase 12: Photos on session authentication

**Goal**: A signed-in student can attach up to 5 processed photos to an open answer from the computer, only the owner and permitted reviewers can see them, and uploads cannot exhaust the API container's memory.
**Depends on**: Phase 9, Phase 11
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04, PHOTO-05, PHOTO-06, DEBT-01, DEBT-07
**Research**: needs `/gsd-plan-phase 12 --research-phase`. The first plan is the measurement spike: peak memory of `sharp` at 12 and 48 MP (Orientation 6 and 8, concurrency 1 and 2), legibility of a notebook page at 2560 px, a file up to 10 MB through the Next rewrites in `yarn dev`, the HEIC decision.
**Success Criteria** (what must be TRUE):
  1. In the runner (seeded open question) a student picks photos with a file picker; they are downscaled in the browser, sent one at a time with retries and shown with the counter "N из 5"; a photo can be removed while the window is open; a retried upload never creates a duplicate; a sixth photo is refused with a clear message.
  2. JPEG, PNG, WebP and an iPhone photo with rotation data are accepted; the stored image is a WebP, upright, without any metadata including GPS, with a thumbnail; a file with the wrong signature, too large or of an unsupported type gets 413/415/400 with a readable message, and avatar and media-library uploads return the same 4xx instead of 500.
  3. A photo is served only to its owner and to reviewers allowed by the access policy, with `Cache-Control: private, no-store`; anyone else gets the same response as for a missing file; the shared question-image route never serves answer photos; ADR-0004 records who may read `images/` (any signed-in user, by design) and `answers/` (owner and reviewers only).
  4. A photo that arrives after the upload window has closed is refused by the Phase 11 rule with a clear message and is not stored.
  5. Photos of 12 and 48 MP uploaded several at a time keep the API under the measured memory limit; the pixel cap, concurrency and no-cache settings are recorded with the measurement.

**Folded-in work**: the shared photo component also offers "Сделать фото" (camera) and "Выбрать из галереи" for the phone page of Phase 13; real-device behaviour is checked in Phases 13 and 17. The runner shows the photo block for a seeded open question here; authoring, text answer and submit come in Phase 14.
**User steps (outside the repository)**: supply real iPhone and Android photo samples (large JPEG, HEIC) for the spike; decide the API container memory limit from the measurement; check that the Caddy request-body limit (20 MB in the server profile) stays above the upload limit.
**Plans**: TBD
**UI hint**: yes

### Phase 13: Token, QR and phone page

**Goal**: A student can add photos to an open answer from a phone by scanning a QR code, without signing in, through a link that can do nothing else.
**Depends on**: Phase 12
**Requirements**: QR-01, QR-02, QR-03, QR-04, QR-05, DEBT-02
**Research**: needs `/gsd-plan-phase 13 --research-phase`. A device spike comes before the page is designed: iPhone Safari, Android Chrome, Samsung browser, Yandex Browser, in-app viewers of messengers (camera and gallery, orientation, whether the tab reloads); Caddy log and headers for the new paths.
**Success Criteria** (what must be TRUE):
  1. Each open question in the runner (seeded) shows a QR code and a copyable link; scanning it on a phone opens the page of exactly that question of that attempt with no sign-in, with the states ready, uploading, 5 of 5, window closed, link invalid and offline; photos added on the phone appear on the computer within a few seconds (e2e in two browser contexts).
  2. The link can only add and remove photos of its question (no other question, attempt or full-size photo is reachable with it); it stops working when the upload window closes, after submit or "Готово", when the assignment is revoked or the user is blocked, and every invalid case shows the same "ссылка недействительна".
  3. The token appears in no server log, no Referer header and no search index, and phone-page requests are limited per token so many phones behind one school router are not throttled together.
  4. Reloading the test page on the computer does not break a phone page that is already open, and the QR code is the same after the reload.
  5. The 404 page shows its image, and the protected area shows one toast at a time.

**Folded-in work**: DEBT-02 is closed here: the 404 page shows its image and the protected area has one toaster (the `DashboardClient` part was done in Phase 9). The phone page reuses the Phase 12 photo component.
**User steps (outside the repository)**: run the device spike on real phones; check the Caddy access log and headers for `/photo-upload/*` and `/api/upload/*` (no token in the log, request-body limit above the upload limit). Final device acceptance is Phase 17.
**Plans**: TBD
**UI hint**: yes

### Phase 14: Authoring and submitting open questions

**Goal**: Authors can create open questions and students can answer and submit them with text and photos (from the computer or by QR); an attempt with open answers then waits "на проверке".
**Depends on**: Phase 12, Phase 13 (and Phase 9, which must be finished before attempts "на проверке" exist)
**Requirements**: OPEN-01, OPEN-03, OPEN-04, OPEN-05, OPEN-06, OPEN-07, OPEN-08, OPEN-09
**Research**: standard patterns, no research phase.
**Success Criteria** (what must be TRUE):
  1. An admin, or a teacher in their zone, creates and edits an open question (prompt, explanation, reference answer with grading criteria), mixes it with other templates in one test, sets the photo upload window in minutes in the test settings, and finds it in the ZIP export; once students have answered, the question type cannot be changed.
  2. A student answers with text (autosaved, survives a reload) and/or up to 5 photos added from the computer or through the QR panel; an answer with neither text nor photos cannot be submitted.
  3. After submitting, the student sees a preliminary "X из Y" for the auto-scored part without a percentage, the review of the auto-scored questions at once and "на проверке" for the open answers, sees until when photos can be added, and can end the window early with "Готово, фото загружены".
  4. A student can start a new attempt of the same test while the earlier one is under review, and the earlier attempt shows as "на проверке" in every reader.

**Folded-in work**: none. The type stays inactive in production; the seed and e2e activate it (Phase 17 enables it).
**User steps (outside the repository)**: none.
**Plans**: TBD
**UI hint**: yes

### Phase 15: Review

**Goal**: Teachers in their zone and admins grade open answers on a 0–3 scale, can return an answer for correction up to 3 times, and students see the final result and get notified.
**Depends on**: Phase 10, Phase 12, Phase 14
**Requirements**: REV-01, REV-02, REV-03, REV-04, REV-05, REV-06, REV-07, REV-08, REV-09, REV-10, REV-11, REV-12, NOTIF-03, NOTIF-04, TIME-05
**Research**: needs `/gsd-plan-phase 15 --research-phase` (gestures and rotation of `react-zoom-pan-pinch` 4.x with React 19.2 and Next 16.3.8; the review transaction and its concurrency).
**Success Criteria** (what must be TRUE):
  1. A teacher sees the queue "Ждут проверки" only for their zone (an admin sees all) with section and group filters; an answer enters the queue when its upload window closes; the teacher's dashboard shows a "Ждут проверки" tile with the count and a link to the queue; a reviewer cannot review their own attempt.
  2. The review screen shows the student's text, the photos with zoom and rotation, each photo's upload time with the marks "после окончания времени" and "с телефона по ссылке", and the reference answer with criteria; the reviewer sets 0–3 and a comment, saves and goes to the next answer; an unsaved comment survives a reload; two saves based on the same version cannot both win (the second gets a conflict message).
  3. The reviewer returns an answer for correction with a required comment and no score, up to 3 times; the student resubmits only that answer (text and photos, from the computer or by QR) and it returns to the queue; "Оценить без исправления" grades a returned answer without waiting; after the attempt has its final result an answer cannot be returned, only re-graded with a new review record; every version and review stays visible to the student and the reviewer, and the final score is the last review.
  4. An open answer still empty when its window closes gets an automatic 0 marked "нет ответа", stays out of the queue and can be re-graded; when the last open answer is graded the attempt shows its final percentage and passed mark everywhere, and only then does the student see the reference answer and criteria.
  5. The student is notified when an answer is returned, graded or re-graded and when the whole test is graded; the teacher is notified when an attempt with open answers is waiting and when a corrected answer is resubmitted.

**Folded-in work**: the "test assigned" event of NOTIF-03 may already exist from Phase 10; this phase adds the review events (returned, graded, re-graded, fully graded) and the teacher events of NOTIF-04. Keyboard shortcuts, comment templates and the grouped teacher event stay in Future Requirements.
**User steps (outside the repository)**: try zoom and rotate with fingers on a real phone or tablet; final device acceptance is Phase 17.
**Plans**: TBD
**UI hint**: yes

### Phase 16: Retention and cleanup

**Goal**: Answer photos are kept on the site for one year without losing the review record, never deleted before grading, orphans are cleaned, and students are told the real retention rule.
**Depends on**: Phase 12 (photo storage and slots), Phase 15 (review states used by the "not graded yet" rule). Can run in parallel with Phase 18.
**Requirements**: RET-01, RET-02, RET-03, RET-04
**Research**: standard patterns, no research phase.
**Success Criteria** (what must be TRUE):
  1. A job deletes answer photo files one year after upload; the review record (score, comment, upload times) stays and shows "фото удалены по сроку хранения" in place of the photos; photos of answers not yet graded are never deleted by it.
  2. Photos never attached to a submitted attempt are deleted after 24 hours; deleting a test or a user deletes their answer files, and a reconcile run finds no orphan files or rows.
  3. Running the retention job twice in a row changes nothing the second time, and the job can be run once by command.
  4. The runner and the phone page tell the student how long photos are kept, with the documented rule "на сайте год, в зашифрованных резервных копиях до 12 месяцев после удаления".

**Folded-in work**: none.
**User steps (outside the repository)**: none required; the restic backup policy is unchanged by decision (2026-10-06), and the legal side of keeping minors' photos stays the user's and the client's call.
**Plans**: TBD

### Phase 17: Enabling and acceptance

**Goal**: The open question type is offered to authors only after the full loop is proven by e2e and on real phones, and a deploy cannot cut an open upload window.
**Depends on**: Phase 15, Phase 16 (and Phases 9-14)
**Requirements**: ROLL-01, ROLL-02, ROLL-03
**Research**: none (acceptance).
**Success Criteria** (what must be TRUE):
  1. e2e covers the computer-plus-phone upload in two browser contexts (the phone context without stored sign-in) and the full review loop (submit, queue, return, resubmit, grade, final result with notification); `yarn verify` ends `OK` and `yarn e2e` is green.
  2. Manual acceptance on a real iPhone and a real Android phone passes (camera, gallery, orientation, slow network) and is recorded.
  3. The server runbook extends deploy protection to attempts whose upload window is still open, and the user confirms it works.
  4. Only after 1–3 is the `open` type activated: an admin or a teacher can pick it in the question editor in production, and one real end-to-end attempt (answer, photos, review, result) works.

**Folded-in work**: the early measurements and spikes of Phases 12 and 13 must be closed before this phase starts.
**User steps (outside the repository)**: manual acceptance on a real iPhone and a real Android phone (camera, gallery, orientation, slow network); change of the server deploy protection (the runbook step; today it looks at open test sessions only); the decision to enable the type and a smoke check in production. Agents cannot do these.
**Plans**: TBD

### Phase 18: Remaining v1.0 tech debt

**Goal**: The deferred v1.0 findings that were not folded into the module phases are fixed or explicitly closed with a reason.
**Depends on**: Phase 15 (ordered after it so the question payload work sees its final shape). Can run in parallel with Phase 16.
**Requirements**: DEBT-03, DEBT-04, DEBT-05, DEBT-06, DEBT-08, DEBT-09
**Research**: standard patterns, no research phase.
**Success Criteria** (what must be TRUE):
  1. A teacher can invite students; inviting an inactive account is refused at invite time; the invite screen uses the typed request layer, shows clear texts for 400, 404 and 409, and blocks a double submit.
  2. Admin test reading returns correct answers only to users allowed to see them, and the user directory endpoint is limited to users who need it.
  3. The speech button has its label, focus returns correctly after a topic reload retry, the MDX table conversion is idempotent, and answer keys made of digits are stored as strings.
  4. The login-throttle and answer-keys JSONB (`57P01`) tests pass reliably (a series of consecutive `yarn verify` runs without a flaky failure).
  5. Every remaining deferred review finding of v1.0 phases 06-08 (CR-03, CR-05, CR-09…CR-19, NQ-*) is fixed or listed as closed with a reason in one disposition file.

**Folded-in work**: CR-03 and CR-05 were fixed in Phase 11 and are only recorded here (part of DEBT-08); the mobile sidebar button is excluded (done in the UX navigation work). DEBT-01 and DEBT-07 were closed in Phase 12 and DEBT-02 in Phases 9 and 13.
**User steps (outside the repository)**: none.
**Plans**: TBD
**UI hint**: yes

### Phase 19: Decommission of Supabase and Vercel

**Goal**: The code and the runtime no longer depend on Supabase or Vercel, and the old data is copied, verified and deleted at the providers by the user from a runbook.
**Depends on**: Phase 17, Phase 18 (last phase of v3.0). **Gate: must not start before 2026-10-12** (a week of production without incidents after the move of 2026-10-05).
**Requirements**: DECOM-01, DECOM-02, DECOM-03, DECOM-04
**Research**: needs `/gsd-plan-phase 19 --research-phase` (`assets:refs` on a copy of production data, what restic currently holds, where the Supabase database physically lives).
**Success Criteria** (what must be TRUE):
  1. The code has no Supabase storage adapter, no `@supabase/*` or `@vercel/*` packages, no Vercel configuration and no Supabase environment keys; `yarn verify` ends `OK` and a search for "supabase|vercel" finds only the intended guards.
  2. The legacy Supabase link parser is removed only after a check on a copy of production data confirms that no content references Supabase URLs; otherwise it stays and the reason is recorded.
  3. ADR-0004 describes one production adapter (local storage).
  4. The runbook for the final copy (manifest, backup tag, restore check, deletion at both providers) exists and the user confirms each step done.

**Folded-in work**: ADR-0004 is amended first, before any code is removed. Existing guards and fixtures that name the providers (`isolatedChildEnv`, forbidden `vercel`, dangerous-value fixtures) and `denyDirectAccessPolicy()` with the applied migrations stay.
**User steps (outside the repository)**: run `assets:refs` on a copy of production data; the final copy of the Supabase data with a SHA-256 manifest into the backup store under its own tag outside the hourly retention, the restore check, then deletion at Supabase and Vercel (the user runs the runbook, agents have no access); the 152-ФЗ questions about storing minors' data stay with the user and the client.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19. Phases 9 and 10 can run in parallel, as can 16 and 18. Phase 19 is last and not before 2026-10-12.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Result foundation and readers | 19/19 | Complete    | 2026-10-06 |
| 10. Notification journal and bell | 9/9 | Complete    | 2026-10-06 |
| 11. Deadline finalisation, upload window and background jobs | 5/18 | In Progress|  |
| 12. Photos on session authentication | 0/TBD | Not started | - |
| 13. Token, QR and phone page | 0/TBD | Not started | - |
| 14. Authoring and submitting open questions | 0/TBD | Not started | - |
| 15. Review | 0/TBD | Not started | - |
| 16. Retention and cleanup | 0/TBD | Not started | - |
| 17. Enabling and acceptance | 0/TBD | Not started | - |
| 18. Remaining v1.0 tech debt | 0/TBD | Not started | - |
| 19. Decommission of Supabase and Vercel | 0/TBD | Not started | - |

## Future Milestone Notes

v4.0 "Чаты учителя и ученика" starts after v3.0 and builds on its photo pipeline, background-jobs module and cabinet notification journal. Scope decided by the user on 2026-10-05: 1:1 teacher-student dialogs through the access-policy seam, started by either side (a student writes only to their own teacher), no student-to-student messaging; group communication as teacher announcements without replies; text, up to 5 photos per message (no PDF) and an "обсудить попытку" card; no calls, voice, typing or presence indicators. Protection: TLS, an administrator access log, encrypted backups and application-level envelope encryption of message bodies and photos with the master key outside the database and its backups (no server-side text search); end-to-end encryption rejected. Architecture: own Express module, HTTP writes idempotent by `clientMessageId`, per-chat `seq` and delta sync, SSE stream with cookie auth, in-process event bus, notification events written in the message transaction. Research, the stack and pitfalls addendum (section 9, 2026-10-06) and the open client and legal questions: `.planning/research/chat/SUMMARY.md`; requirements CHAT-01…CHAT-12 in `REQUIREMENTS.md` (Future Requirements).

v5.0 "PWA и push-уведомления" is the last planned milestone: installable PWA (manifest, service worker) and Web Push (VAPID keys, subscription storage, delivery from the API) over HTTPS on the VPS; notifications such as "работа проверена" (v3.0) and new chat messages (v4.0) move from cabinet-only to push as an extra delivery channel of the notification journal. iOS delivers Web Push only to a PWA added to the home screen (iOS 16.4+). Push is best-effort in Russia (FCM, APNs), so the cabinet stays the source of truth; push payloads carry no message text by default and use the Declarative Web Push format. Research: `.planning/research/pwa/SUMMARY.md` (section "Что v3.0 должна заложить для v5.0"); requirements PWA-01…PWA-04 in `REQUIREMENTS.md` (Future Requirements).

What v3.0 hands over to them: the notification journal with unknown kinds, per-channel delivery rows with retry and lease fields and a collapse key (Phase 10); the background-jobs module and clean shutdown (Phase 11); browser-wide session refresh coordination (Phase 11); the image pipeline and the private `answers/` storage space with `private, no-store` delivery (Phase 12); new tables that do not cascade from `users` (Phase 9).
