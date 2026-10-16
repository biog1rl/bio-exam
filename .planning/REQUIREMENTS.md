# Requirements: bio-exam

**Defined:** 2026-10-06
**Core Value:** A student's timed test attempt is scored correctly, exactly once, and stays reviewable exactly as it was scored.

Scope: Milestone v3.0 "Открытые задания с фото и ручной проверкой". Sources: client answers 12–19 (`milestones/v1.0-phases/07.1-teachers-and-responsibility-zones/07.1-CLIENT-ANSWERS.md`), user decisions of 2026-10-06 (`PROJECT.md` section "Current Milestone"), research `research/SUMMARY.md` (with STACK, FEATURES, ARCHITECTURE, PITFALLS), v1.0 tech debt (`milestones/v1.0-MILESTONE-AUDIT.md`, phase `deferred-items.md`). Items the later milestones need from v3.0 come from `research/chat/SUMMARY.md` §9 and `research/pwa/SUMMARY.md`.

## v1 Requirements

### Result foundation

- [x] **RES-01**: The auto-scored facts of an attempt (answers, per-question results, earned and total points, percentage and passed at submit) are never rewritten after submit; manual reviews are stored as appended records
- [x] **RES-02**: The final result of an attempt is the auto facts plus the last review of each open answer, computed by one shared function in `exam-core`; a stored projection (review status, final points, percentage, passed) always equals that recomputation, including the existing attempts
- [x] **RES-03**: Every reader of a test result (admin attempts list and detail, dashboards, charts, "my attempts", user profile, test landing page, attempt review, global search) shows an attempt under review as "на проверке" with no percentage and no passed/failed mark, leaves it out of averages, and puts it on charts only after grading, at its submission date
- [x] **RES-04**: The admin attempts list filters by review state (all, на проверке, проверено) through a new parameter, without changing the existing user-status filter
- [x] **RES-05**: Submit accepts answers only for questions of the test and rejects text answers over a length limit (v1.0 SEC-04/N3)

### Open question

- [ ] **OPEN-01**: An admin, or a teacher in their zone, can create and edit an open question with prompt, explanation and a reference answer with grading criteria; open questions can be mixed with other templates in one test and are included in ZIP export
- [x] **OPEN-02**: An open question is scored 0–3 points
- [ ] **OPEN-03**: The type of an open question that already has student answers cannot be changed
- [ ] **OPEN-04**: A student answers an open question with text and/or up to 5 photos (no PDF); an answer with neither text nor photos cannot be submitted by the student
- [ ] **OPEN-05**: The text of an open answer autosaves and survives a page reload like other answers
- [ ] **OPEN-06**: The test author sets the photo upload window (minutes) in the test settings
- [ ] **OPEN-07**: After submitting a test with open questions, the student sees a preliminary "X из Y" for the auto-scored part without a percentage, the review of the auto-scored questions at once, and "на проверке" for the open answers
- [ ] **OPEN-08**: The student can end the upload window early with "Готово, фото загружены"
- [ ] **OPEN-09**: The student can start a new attempt of a test while a previous attempt is under review

### Timer and upload window

- [x] **TIME-01**: When the time of a timed attempt runs out, the server finalises the attempt itself with the last saved answers, at the deadline plus the existing grace period, so text typed offline before the deadline is not lost
- [x] **TIME-02**: After the deadline, text answers are read-only, while photos of open answers can still be added or removed until the upload window closes; the window starts at submit or at the end of the timer, whichever is earlier (untimed tests: at submit)
- [x] **TIME-03**: The student sees until when photos can be added, counted from server time
- [x] **TIME-04**: Whether a photo is accepted is decided by one server rule on database time; a photo arriving after the window closes is rejected with a clear message
- [ ] **TIME-05**: The reviewer sees the upload time of each photo, with marks "после окончания времени" and "с телефона по ссылке"
- [x] **TIME-06**: When the server has already finalised an attempt, the student's page shows "ответ принят, фото можно добавить до ЧЧ:ММ" instead of an error, and unsent text is not discarded without checking what the server kept

### Photos

- [x] **PHOTO-01**: A student adds photos from the computer with a file picker, and on a phone with "Сделать фото" (camera) and "Выбрать из галереи"
- [x] **PHOTO-02**: Photos are downscaled in the browser before upload, sent one at a time with retries, and a retried upload never creates a duplicate
- [x] **PHOTO-03**: The server accepts JPEG, PNG and WebP (and iPhone photos from Safari), checks the type by file signature, fixes orientation, removes all metadata including GPS, and stores a WebP image and thumbnail; too large or unsupported files get a 4xx response with a readable message
- [x] **PHOTO-04**: Photo processing is bounded (pixel limit, concurrency, no cache) so uploads cannot exhaust the API container memory
- [x] **PHOTO-05**: Answer photos are served only to their owner and to reviewers allowed by the access policy, with `Cache-Control: private, no-store`; anyone else gets the same response as for a missing file; they never go through the shared question-image proxy
- [x] **PHOTO-06**: The student can remove a photo while the window is open and sees the counter "N из 5"

### Phone upload by QR

- [ ] **QR-01**: Each open question in the test runner shows a QR code and a copyable link that open an upload page on a phone for exactly that question of that attempt, without signing in
- [ ] **QR-02**: The phone page shows the question, the current photos and its states (ready, uploading, 5 of 5, window closed, link invalid, offline); photos added on the phone appear on the computer within a few seconds
- [ ] **QR-03**: The link can only add and remove photos of its question; it stops working when the upload window closes, after "Готово", when the assignment is revoked or the user is blocked, and every invalid state shows one message "ссылка недействительна"
- [ ] **QR-04**: The link token never appears in server logs, the Referer header or search indexes; phone-page requests are rate-limited by token, not only by IP
- [ ] **QR-05**: Reloading the test page on the computer does not break a phone page that is already open

### Review

- [ ] **REV-01**: A teacher (own zone) or an admin sees the queue "Ждут проверки" with section and group filters; an answer enters the queue when its upload window closes
- [ ] **REV-02**: The review screen shows the student's text, the photos with zoom and rotation, upload times, and the reference answer with criteria; the reviewer sets a score 0–3 and a comment and can save and go to the next answer
- [ ] **REV-03**: The reviewer can return an answer for correction with a required comment and no score, up to 3 times per answer; the student resubmits only that answer (text and photos, from the computer or by QR) and it returns to the queue
- [ ] **REV-04**: The reviewer can grade a returned answer without waiting for a correction ("Оценить без исправления")
- [ ] **REV-05**: Every answer version and every review is kept; the history is visible to the student and the reviewer; the final score is the last review
- [ ] **REV-06**: When the last open answer of an attempt is graded, the attempt shows its final percentage and passed state everywhere
- [ ] **REV-07**: After an attempt has its final result, its answers cannot be returned for correction; the reviewer can only re-grade with a new review record, and the student is notified
- [ ] **REV-08**: An open answer that is still empty when its window closes gets an automatic 0 marked "нет ответа" and does not enter the queue; the reviewer can re-grade it
- [ ] **REV-09**: Two saves of the same answer based on the same version cannot both win: the second gets a conflict message; a reviewer cannot review their own attempt
- [ ] **REV-10**: The student sees the reference answer and criteria of an open question only after the attempt has its final result
- [ ] **REV-11**: An unsaved review comment survives a page reload
- [ ] **REV-12**: The teacher's dashboard shows a "Ждут проверки" tile with the count and a link to the queue

### Notifications

- [x] **NOTIF-01**: A general notification journal stores events per recipient (kind, subject, deep link, read mark, per-channel delivery); each event is written in the same transaction as the change that causes it, and retries never duplicate it
- [x] **NOTIF-02**: The header has a bell with the unread count (capped "9+"), a list, mark-as-read on open and "прочитать все"; a deep link re-checks access when opened
- [ ] **NOTIF-03**: A student gets events when an answer is returned for correction, an answer is graded or re-graded, a test is fully graded, and a test is assigned to them (directly or through a group)
- [ ] **NOTIF-04**: A teacher gets events when an attempt with open answers is waiting for review and when a corrected answer is resubmitted
- [x] **NOTIF-05**: The browser tab title shows the unread count
- [x] **NOTIF-06**: The journal accepts later channels and kinds without schema changes to existing rows: unknown kinds are allowed, delivery rows carry retry and lease fields, events carry a collapse key (needed by v4.0 chats and v5.0 push)

### Retention

- [ ] **RET-01**: A background job deletes answer photos from the site one year after upload; the review record (score, comment, upload times) stays and shows "фото удалены по сроку хранения"
- [ ] **RET-02**: Photos of answers that are not graded yet are not deleted by the retention job
- [ ] **RET-03**: Photos never attached to a submitted attempt are deleted after 24 hours; deleting a test or a user deletes their answer files
- [ ] **RET-04**: The runner and the phone page tell the student how long photos are kept; the documented rule is "на сайте год, в зашифрованных резервных копиях до 12 месяцев после удаления"

### Platform

- [x] **PLAT-01**: A background-jobs module runs periodic tasks inside the API process: started only from the server entry point, safe when two API instances overlap during a deploy, stopped before the database pool closes, and runnable once by a command
- [x] **PLAT-02**: API shutdown waits for in-flight requests and jobs before closing the database pool
- [x] **PLAT-03**: Session refresh is coordinated across all tabs of one browser, so parallel tabs never trigger refresh-token replay
- [x] **PLAT-04**: Logging out clears that user's attempt draft keys in the browser (shared school computers; v1.0 SEC-02)
- [x] **PLAT-05**: User deletion follows one recorded rule for the new tables: data owned by the deleted user (open answers, photos with their files deleted first, reviews of their answers, their notifications) is removed with them; records they authored for others (reviews, comments) stay with the author cleared and shown as "проверяющий удалён"

### Tech debt from v1.0

- [x] **DEBT-01**: Existing upload routes return 413/415/400 for size and type errors instead of 500
- [ ] **DEBT-02**: The 404 page shows its image, the protected area has one toaster, and `DashboardClient` has no unused variables
- [ ] **DEBT-03**: A teacher can invite students, with the active-account check at invite time
- [ ] **DEBT-04**: Admin test reading returns correct answers only to users allowed to see them, and the user directory endpoint is limited to users who need it
- [ ] **DEBT-05**: The invite screen uses the typed request layer, shows clear texts for 400/404/409 and blocks double submit
- [ ] **DEBT-06**: Known flaky tests (login throttle under load, answer-keys JSONB `57P01`) pass reliably
- [x] **DEBT-07**: ADR-0004 records who may read `images/` (any signed-in user, by design) and `answers/` (owner and reviewers only)
- [ ] **DEBT-08**: The remaining deferred review findings of v1.0 phases 06–08 (CR-03 bfcache, CR-05 repeated start, CR-09…CR-19, NQ-*) are each fixed or explicitly closed with a reason
- [ ] **DEBT-09**: Small UI fixes: speech button label, focus after a topic reload retry, idempotent MDX table conversion, answer keys made of digits stored as strings

### Decommission of Supabase and Vercel

- [ ] **DECOM-01**: The code has no Supabase storage adapter, no `@supabase/*` or `@vercel/*` packages, no Vercel configuration and no Supabase environment keys; `yarn verify` passes and a search for "supabase|vercel" finds only the intended guards
- [ ] **DECOM-02**: Before the legacy Supabase link parser is removed, a check on a copy of production data confirms no content references Supabase URLs
- [ ] **DECOM-03**: ADR-0004 is amended to one production adapter (local storage)
- [ ] **DECOM-04**: A server runbook covers the final copy of the Supabase data with a SHA-256 manifest into the backup store under a separate tag, a restore check, then deletion at Supabase and Vercel; the user runs it, not before 2026-10-12

### Rollout

- [ ] **ROLL-01**: The open question type is offered to authors only after the phases of this milestone pass; e2e covers the computer-plus-phone flow in two browser contexts and the full review loop
- [ ] **ROLL-02**: Manual acceptance on a real iPhone and a real Android phone (camera, gallery, orientation, slow network) passes before the type is enabled
- [ ] **ROLL-03**: The server runbook extends deploy protection to attempts whose upload window is still open

## Future Requirements

Deferred; tracked but not in the current roadmap.

### Teacher-student chats (v4.0, `research/chat/SUMMARY.md`)

- **CHAT-01**: 1:1 teacher-student dialog, one per pair, created lazily; who may write is decided by the access-policy seam, either side may start (a student only with their own teacher); no student-to-student messaging; a student who leaves the zone keeps a read-only dialog
- **CHAT-02**: Teacher announcements to an owned group without replies; students answer in their 1:1 dialog
- **CHAT-03**: Writes over HTTP, idempotent by `(sender_id, client_message_id)`; per-chat `seq` under the chat row lock; edits and deletions in the same delta; `sync` plus `changes?since` restore state after reconnect
- **CHAT-04**: SSE stream with cookie auth, closed at access-token expiry and on session revocation, heartbeat, in-process event bus published after COMMIT; polling fallback
- **CHAT-05**: Up to 5 photos per message (no PDF) through the v3.0 photo pipeline, delivery through the API only to chat members; unattached uploads expire
- **CHAT-06**: "Обсудить попытку/работу" card storing `{type, id}`; the right to open the review is checked on open
- **CHAT-07**: Server-side unread counts; read state visible to the teacher only; teacher quiet hours with a student banner
- **CHAT-08**: Edit own message within 15 minutes with a mark; soft delete only, the administrator sees originals; message length, rate and upload quotas
- **CHAT-09**: Notification events written in the message transaction to the v3.0 journal, per-dialog throttling, deep links `/chats/{chatId}?m={messageId}`
- **CHAT-10**: Envelope encryption of message bodies and photos (AES-256-GCM, per-chat data key wrapped by a master key outside the database and its backups, key version and rotation); administrator reads through an explicit action written to an access log
- **CHAT-11**: Client ready for PWA: IndexedDB outbox with retries keyed by user, no service-worker caching of chat API or photos, local data cleared on logout; mobile layout at 375px with iOS keyboard handling
- **CHAT-12**: Guards: every chat route goes through the seam, attachment delivery checks membership, e2e of the SSE stream through the proxy

### PWA and push (v5.0, `research/pwa/SUMMARY.md`)

- **PWA-01**: Installable app: manifest, icons, public paths in `proxy.ts`, a service worker without data caching, install button on Android and instructions on iOS
- **PWA-02**: Push subscriptions per device bound to the session, VAPID keys served by the API, test notification
- **PWA-03**: Delivery of journal events as Web Push (Declarative Web Push payload without content), badge from the unread count, deep links
- **PWA-04**: Notification settings: master switch, kinds, quiet hours, wording that push may not arrive in Russia

### Review and notification extras

- **REVX-01**: Keyboard shortcuts on the review screen (`0`–`3`, `j/k`, `Ctrl+Enter`)
- **REVX-02**: Comment templates for reviewers
- **NOTIFX-01**: Grouped teacher event "Ждут проверки: N" (needed for push in v5.0)
- **MODX-01**: Moderation of answer photos for inappropriate content: a local model (for example NudeNet on ONNX) as a background job after upload marks a photo, the reviewer sees it blurred with "проверить"; uploads are never blocked (anatomy diagrams give false positives); cloud classifiers are rejected while photos of minors would go to a third party. Revisit after launch if incidents occur, sized by the Phase 12 memory measurement

### Product directions

- **PROD-01**: ZIP import/restore of tests
- **PROD-02**: Assignment lifecycle beyond assigned-or-privileged, including due dates and reminders
- **PROD-03**: Cohort analytics

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drawing or marking on photos during review | User decision 2026-10-06: score and comment only |
| PDF answers | Client answer 13: photos only |
| Rubrics, second expert, reviewer assignment, review locks | One teacher today; version check (REV-09) covers concurrent saves |
| AI or OCR grading | Not requested; grading stays with the teacher |
| Rotating QR codes | One stable link per question and attempt is enough at this scale (research) |
| SMS or email notifications | No SMTP or SMS provider; cabinet is the only channel (client answer 17) |
| Student deleting photos after review | Review history must stay as graded |
| Deadline for a correction round | User decision 2026-10-06; "Оценить без исправления" covers abandoned answers |
| Return for correction after the final result | User decision 2026-10-06; re-grade only |
| Offline test taking | Timer and scoring live on the server |
| Mobile sidebar menu button | Done in the UX navigation work |
| Changing restic backup policy for photos | User decision 2026-10-06: honest wording instead |

## Traceability

Which phases cover which requirements. Filled 2026-10-06 during roadmap creation (v3.0 phases 9-19, see `ROADMAP.md`).

| Requirement | Phase | Status |
|-------------|-------|--------|
| RES-01 | Phase 9 | Complete |
| RES-02 | Phase 9 | Complete |
| RES-03 | Phase 9 | Complete |
| RES-04 | Phase 9 | Complete |
| RES-05 | Phase 9 | Complete |
| OPEN-01 | Phase 14 | Pending |
| OPEN-02 | Phase 9 | Complete |
| OPEN-03 | Phase 14 | Pending |
| OPEN-04 | Phase 14 | Pending |
| OPEN-05 | Phase 14 | Pending |
| OPEN-06 | Phase 14 | Pending |
| OPEN-07 | Phase 14 | Pending |
| OPEN-08 | Phase 14 | Pending |
| OPEN-09 | Phase 14 | Pending |
| TIME-01 | Phase 11 | Complete |
| TIME-02 | Phase 11 | Complete |
| TIME-03 | Phase 11 | Complete |
| TIME-04 | Phase 11 | Complete |
| TIME-05 | Phase 15 | Pending |
| TIME-06 | Phase 11 | Complete |
| PHOTO-01 | Phase 12 | Complete |
| PHOTO-02 | Phase 12 | Complete |
| PHOTO-03 | Phase 12 | Complete |
| PHOTO-04 | Phase 12 | Complete |
| PHOTO-05 | Phase 12 | Complete |
| PHOTO-06 | Phase 12 | Complete |
| QR-01 | Phase 13 | Pending |
| QR-02 | Phase 13 | Pending |
| QR-03 | Phase 13 | Pending |
| QR-04 | Phase 13 | Pending |
| QR-05 | Phase 13 | Pending |
| REV-01 | Phase 15 | Pending |
| REV-02 | Phase 15 | Pending |
| REV-03 | Phase 15 | Pending |
| REV-04 | Phase 15 | Pending |
| REV-05 | Phase 15 | Pending |
| REV-06 | Phase 15 | Pending |
| REV-07 | Phase 15 | Pending |
| REV-08 | Phase 15 | Pending |
| REV-09 | Phase 15 | Pending |
| REV-10 | Phase 15 | Pending |
| REV-11 | Phase 15 | Pending |
| REV-12 | Phase 15 | Pending |
| NOTIF-01 | Phase 10 | Complete |
| NOTIF-02 | Phase 10 | Complete |
| NOTIF-03 | Phase 15 | Pending |
| NOTIF-04 | Phase 15 | Pending |
| NOTIF-05 | Phase 10 | Complete |
| NOTIF-06 | Phase 10 | Complete |
| RET-01 | Phase 16 | Pending |
| RET-02 | Phase 16 | Pending |
| RET-03 | Phase 16 | Pending |
| RET-04 | Phase 16 | Pending |
| PLAT-01 | Phase 11 | Complete |
| PLAT-02 | Phase 11 | Complete |
| PLAT-03 | Phase 11 | Complete |
| PLAT-04 | Phase 11 | Complete |
| PLAT-05 | Phase 9 | Complete |
| DEBT-01 | Phase 12 | Complete |
| DEBT-02 | Phase 13 | Pending |
| DEBT-03 | Phase 18 | Pending |
| DEBT-04 | Phase 18 | Pending |
| DEBT-05 | Phase 18 | Pending |
| DEBT-06 | Phase 18 | Pending |
| DEBT-07 | Phase 12 | Complete |
| DEBT-08 | Phase 18 | Pending |
| DEBT-09 | Phase 18 | Pending |
| DECOM-01 | Phase 19 | Pending |
| DECOM-02 | Phase 19 | Pending |
| DECOM-03 | Phase 19 | Pending |
| DECOM-04 | Phase 19 | Pending |
| ROLL-01 | Phase 17 | Pending |
| ROLL-02 | Phase 17 | Pending |
| ROLL-03 | Phase 17 | Pending |

**Coverage:**
- v1 requirements: 74 total
- Mapped to phases: 74
- Unmapped: 0
- Per phase: 9 → 7, 10 → 4, 11 → 9, 12 → 8, 13 → 6, 14 → 8, 15 → 15, 16 → 4, 17 → 3, 18 → 6, 19 → 4

**Composite requirements.** Each ID maps to one phase, the phase where its last piece lands; earlier pieces are listed as folded-in work in the earlier phase of `ROADMAP.md`:
- DEBT-02 → Phase 13: the `DashboardClient` unused variables are done in Phase 9; the 404 image and the single toaster in Phase 13.
- DEBT-08 → Phase 18: CR-03 (bfcache) and CR-05 (repeated start) are fixed in Phase 11 with the client attempt-lifecycle module and only recorded in Phase 18; the rest is Phase 18 work.
- NOTIF-03 → Phase 15: the "test assigned" producer is built in Phase 10 as the first real producer of the journal; the review events land in Phase 15.
- RET-04 → Phase 16: the wording is final there; the runner (Phase 14) and the phone page (Phase 13) show it from Phase 16 on.

---
*Requirements defined: 2026-10-06*
*Last updated: 2026-10-06 after roadmap creation (traceability filled)*
