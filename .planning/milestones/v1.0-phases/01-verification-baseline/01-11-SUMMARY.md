---
phase: 01-verification-baseline
plan: 11
subsystem: testing
tags: [playwright, e2e, take-test, attempt-review, authoring, lexical, known-defects, test-fail]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-09 yarn e2e wrapper, seed fixtures (all-templates, review-d1, seq-d2, authoring per project), storageState accounts, accounts.ts helpers"
provides:
  - "e2e/tests/take-test.spec.ts: D-14 flow 2 (@flow2) on chromium-desktop and chromium-mobile"
  - "e2e/tests/review.spec.ts: D-14 flow 3 (@flow3) student and admin attempt review, plus D2 and D1 as test.fail() (@known-defect) each preceded by a regular setup test"
  - "e2e/tests/authoring.spec.ts: D-14 flow 4 (@flow4) for five templates, plus D5 as test.fail() (@known-defect)"
  - "e2e/fixtures/exam.ts: shared helpers (student/admin session contexts and fixtures, answerQuestion, takeTest, adminReviewSections)"
affects: [01-15, phase-03-exam-scoring, phase-05-attempts-review]

actuals:
  tokens: 9765
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  patterns:
    - "test.fail(title, body) for known defects, with ALL setup in a regular first test of the test.describe.serial block (NOT beforeAll: an error in beforeAll under test.fail is scored as the expected failure, verified by probe), so a broken setup fails the run instead of passing as the defect"
    - "Manual session contexts (newSessionContext) from storageState with the project's device options, so one test can drive student and admin; fixtures studentPage / adminPage"
    - "Server numbers read from the submit response or API, UI numbers read from the page, compared in one assertion"

key-files:
  created:
    - e2e/fixtures/exam.ts
    - e2e/tests/take-test.spec.ts
    - e2e/tests/review.spec.ts
    - e2e/tests/authoring.spec.ts
  modified: []

key-decisions:
  - "Student 'review' is the post-submit TestRunner view: the app has no student attempt-review route (AttemptReview is used only by /admin/attempts/[id]); flow 3 clicks the question-number buttons and asserts status and points per question"
  - "D2 is compared as wrong positions shown in review (4 - 'Совпало позиций') vs mistakes derived from the server's earnedPoints (the server persists points, not a mistake count)"
  - "D1 uses a correctly answered radio question: results store correctAnswer only for wrong answers, so a correct attempt is re-rendered with the CURRENT key, which is where the defect shows"
  - "D1 asserts the whole question-section texts (toEqual before/after) rather than the status badge, which does not change"
  - "New helper file e2e/fixtures/exam.ts instead of growing accounts.ts, because accounts.ts is Playwright-free node code"
  - "seed.json, accounts.ts and e2e-seed.ts were not modified: the existing fixtures were enough; authoring questions are spec constants, not seed rows"

patterns-established:
  - "Locate the answer-card controls by their row (placeholder -> parent -> role), never by first radio/checkbox/combobox on the page: the Lexical toolbar owns radios (alignment) and comboboxes (block type)"
  - "Fresh browser contexts from storageState pre-set localStorage auth_refresh_cookie_migrated_v2=1 (see Issues Encountered)"

requirements-completed: [VER-03, VER-05]

coverage:
  - id: D1
    description: "Flow 2: student opens the assigned all-templates test, answers all five templates, submits and sees 8 / 8, 100%, 'пройден' on desktop and mobile"
    requirement: VER-03
    verification:
      - kind: e2e
        ref: "e2e/tests/take-test.spec.ts#student answers every question and sees the full score @flow2 (yarn e2e, both projects)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Flow 3: student reviews every question after submit (mixed attempt 5 / 8, 63%) and the admin sees the same statuses, points and answers under /admin/attempts/<id>"
    requirement: VER-03
    verification:
      - kind: e2e
        ref: "e2e/tests/review.spec.ts#flow 3 (two tests, both projects)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Flow 4: admin creates single_choice, multi_choice, matching, sequence_digits and short_text (one answer) questions; each is in the list after reload and stored with the right type and key"
    requirement: VER-03
    verification:
      - kind: e2e
        ref: "e2e/tests/authoring.spec.ts#flow 4 (five tests, both projects)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Known defects D1, D2, D5 pinned as test.fail() on both projects; each fails on the defect assertion; fixing phases get an unexpected-pass error"
    requirement: VER-05
    verification:
      - kind: e2e
        ref: "yarn e2e: D1, D2, D5 reported as expected failures on chromium-desktop and chromium-mobile (40 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Mobile reachability of the authoring editor and the student runner"
    verification:
      - kind: e2e
        ref: "all flow 2/3/4 tests pass on chromium-mobile (Pixel 7) with no test.fixme"
        status: pass
    human_judgment: false

# Metrics
duration: 13min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 11: Take-test, review and authoring e2e flows Summary

**Flows 2-4 of D-14 now run end to end on desktop and Pixel 7 against the isolated stack (all five question templates taken and scored, an attempt reviewed by student and admin, five template kinds authored and re-read after reload), and the known defects D1, D2 and D5 are pinned as `test.fail()` checks that fail on the defect assertion.**

## Performance

- **Duration:** about 13 min
- **Started:** 2026-10-03T08:54:10Z
- **Completed:** 2026-10-03T09:07:06Z
- **Tasks:** 2/2
- **Files:** 4 created, 0 modified (no application code, no seed change)

## Accomplishments

- **Flow 2 (`@flow2`).** The student opens `all-templates-<p>` from its landing page, clicks "Начать тест", answers the radio, checkbox, matching (three Radix selects), short text and digit sequence from the seed's keys, sees "Отвечено: 5 / 5", submits and gets "Баллы: 8 / 8", "Процент: 100%", "Статус: пройден". The submit response (read through `page.waitForResponse`) is asserted too, and the attempt shows in "Мои попытки".
- **Flow 3 (`@flow3`).** A mixed attempt (correct, partial, wrong, correct, correct = 5 / 8, 63%) is submitted by the student. Student view: the question-number buttons are clicked one by one and each question's status ("Верно", "Частично верно", "Неверно"), "N / M баллов" and answer details are asserted. Admin view under `/admin/attempts/<id>`: the same statuses, `N / M балл.`, hero "5/8", "63%", "порог пройден" and the same answer snippets.
- **Flow 4 (`@flow4`).** The admin opens `questions/new` (which creates a draft and redirects), picks the type, types the prompt in the Lexical editor, fills the answer card, saves, reloads and finds the prompt and type badge in the list. The stored question is also read back from `/api/tests/by-slug/...` and its type and key are checked (radio id, checkbox ids, matching id map, `3142`, `митоз`).
- **Known defects as `test.fail(title, body)`**, each in a `test.describe.serial` block whose FIRST test is a regular `D<n> setup` test (tagged `@known-defect` so it runs with the grep) and whose second test holds one assertion. Each annotated test fails on the defect assertion on both projects; the pre-annotation messages are below.
- **Setup placement was probed, not assumed.** A first version used `beforeAll`. A probe (`throw new Error('probe')` in D2's `beforeAll`, D1's assertion made to pass) showed Playwright scores a `beforeAll` error on a `test.fail` test as the EXPECTED failure (D2 stayed green) while an unexpected pass is correctly red (D1: "Expected to fail, but passed", `1 failed`). So the setup moved into regular tests; the same probe on D2's setup test then gave `1 failed, 1 did not run` (red run). All probes were reverted.

## Pre-annotation failure messages (acceptance: defect assertion, not setup)

Each check was run once with `test.fail(` temporarily turned into `test(`, on `chromium-desktop` and `chromium-mobile` (at that point setup was in `beforeAll`; the assertions and messages are unchanged by the later move to setup tests). Setup passed in every case; only the assertion below failed.

**D2** (key `1243`, answer `1234`). Server scored 1 mistake (adjacent swap, 1 of 2 points). Review showed "Совпало позиций: 2 / 4", so 2 wrong positions.
```
Error: wrong positions shown in review must equal the mistakes the server scored for 1234 vs 1243
expect(received).toBe(expected) // Object.is equality
Expected: 1
Received: 2
```

**D1** (radio answered correctly, key then corrected from option 2 to option 1 through PATCH `/api/tests/:id/questions/:qid`; the first review snapshot had no "пропущен" and "Выбран · верно" on the chosen option).
```
Error: admin review of an earlier attempt after the answer key was corrected
expect(received).toEqual(expected) // deep equality
- Expected  - 1
+ Received  + 2
-  Выбрано: 1 · из них верно: 1 · неверно: 0
+  Выбрано: 1 · из них верно: 1 · неверно: 0 · пропущено верных: 1
   Углекислый газ
+  Верный ответ · пропущен
   Кислород
   Выбран · верно
```

**D5** (type "Краткий ответ (несколько вариантов)", prompt and two variants filled in the setup step; the failing step is the save).
```
Error: saving a valid question returns to the test page
expect(page).toHaveURL(expected) failed
Expected pattern: /\/admin\/tests\/e2e-topic\/authoring-desktop\/?$/
Received string:  ".../admin/tests/e2e-topic/authoring-desktop/questions/drafts/<draft id>"
Timeout: 5000ms
```
D5 **reproduces through the UI** on both projects. The Playwright trace shows no `POST /api/tests/<id>/questions` was sent (only draft autosave `PATCH`es), which matches the code reading: `validateQuestion` in `QuestionEditorPageClient.tsx` passes the array key through `normalizeShortTextCorrectValue`, which returns `null` for arrays, so the client refuses with "Укажите правильный краткий ответ". The toast text itself is ephemeral and was not captured.

## Task Commits (ready to commit — not committed)

Per the standing rule nothing was committed or staged; `commits: 0` measured, HEAD still `11b2916`. Proposed commits in the user's style:

1. **Task 1: flows 2 and 3 plus D1 and D2.** `test: Сквозные сценарии прохождения теста и разбора попытки, дефекты D1 и D2 как ожидаемые падения`
   ```
   ?? e2e/fixtures/exam.ts
   ?? e2e/tests/take-test.spec.ts
   ?? e2e/tests/review.spec.ts
   ```
2. **Task 2: flow 4 plus D5.** `test: Сквозной сценарий создания вопросов, дефект D5 как ожидаемое падение`
   ```
   ?? e2e/tests/authoring.spec.ts
   ```
Single-commit alternative: `test: Сценарии прохождения теста, разбора и создания вопросов в e2e, дефекты D1, D2, D5 закреплены`. `e2e/` as a whole is untracked from 01-09, so the files above stage together with the earlier e2e files unless split by path.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## Files Created/Modified

- `e2e/fixtures/exam.ts` - `newSessionContext` (storageState + project device options + localStorage pre-seed), fixtures `studentPage`/`adminPage` on `test`, `answerQuestion` for all five templates, `takeTest` (landing -> start -> answer -> submit, returns the submit payload), `adminReviewSections`, `POINTS_BY_TYPE`.
- `e2e/tests/take-test.spec.ts` - flow 2.
- `e2e/tests/review.spec.ts` - flow 3 (serial: student test then admin test), D2 and D1 blocks (setup test + `test.fail`).
- `e2e/tests/authoring.spec.ts` - flow 4 (serial, one test per template) and the D5 block.

## Decisions Made

See `key-decisions` in the frontmatter. Worth repeating: nothing in `seed.json`, `accounts.ts` or `e2e-seed.ts` changed, so the mutating checks (D1 key correction, authoring) rely on the existing dedicated fixtures `review-d1-<p>` and `authoring-<p>`, one per project, in a scratch database per run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Student "review" is the post-submit runner view**
- **Found during:** Task 1 orientation
- **Issue:** The plan says the student "opens the review of that attempt". No such route exists (`AttemptReview` is only used by `/admin/attempts/[id]`; the landing page history has no links).
- **Fix:** The student review is asserted in `TestRunner` right after submission through the question-number buttons. Documented here as a finding.
- **Files modified:** e2e/tests/review.spec.ts

**2. [Rule 3 - Blocking] Attempt id and server numbers come from the submit response**
- **Found during:** Task 1
- **Issue:** The result screen shows no attempt id and the server stores no mistake count.
- **Fix:** `page.waitForResponse` on the submit POST gives `attemptId` and per-question `earnedPoints`; for D2 the mistake count is derived from `earnedPoints` (rule `one_mistake_partial`: 2 / 1 / 0 points for 0 / 1 / 2+ mistakes), and the points are re-read through `GET /api/tests/public/tests/:id/attempts/me` with the student's request context.
- **Files modified:** e2e/fixtures/exam.ts, e2e/tests/review.spec.ts

**3. [Rule 1 - Bug] Locators that matched the Lexical toolbar**
- **Found during:** Task 2 first runs
- **Issue:** `getByRole('radio').first()`, the first `checkbox` and the first `combobox` on the editor page belong to the editor toolbar (alignment radios, block-type select), so the type select, correct-radio and correct-checkbox clicks silently did the wrong thing.
- **Fix:** controls are located through their own row or label (`Тип вопроса` label -> parent combobox, placeholder `Вариант N` -> parent -> radio/checkbox, `N. подпись` -> parent -> combobox).
- **Files modified:** e2e/tests/authoring.spec.ts

**4. [Rule 1 - Bug] Test assumptions about stored values**
- **Found during:** Task 2
- **Issue:** The legacy radio type is titled "Один правильный вариант (legacy)" in the DB, and digit-only answer keys (`3142`, `1`) come back from the API as JSON numbers.
- **Fix:** the title is matched as stored; keys are compared through `String(...)` with a comment.
- **Files modified:** e2e/tests/authoring.spec.ts, e2e/tests/review.spec.ts

**5. [Rule 1 - Bug] Defect setup moved from `beforeAll` to a regular first test**
- **Found during:** final review (advisor prompt, then probe)
- **Issue:** with setup in `beforeAll`, a hook error on a block whose only test is `test.fail` is scored as the expected failure, so a broken setup would have passed as D1/D2/D5 (the exact T-1-30 risk).
- **Fix:** each block now starts with a regular `D<n> setup` test (tagged `@known-defect`) that writes the module-level state; `afterAll` only closes contexts. Probe: error in D2's setup test gives `1 failed`, next test `did not run`.
- **Files modified:** e2e/tests/review.spec.ts, e2e/tests/authoring.spec.ts

**6. [Additional] New helper file `e2e/fixtures/exam.ts`**
- The plan listed `accounts.ts` for helpers, but `accounts.ts` is plain node code with no Playwright import. Playwright-dependent helpers live in the new file so flows 2 and 3 share one `takeTest`.

---

**Total deviations:** 5 auto-fixed (2 blocking, 3 bugs in test code) plus 1 addition.
**Impact on plan:** none on scope. No application code changed, no package installed, no test skipped, no `test.fixme` needed.

## Issues Encountered

- **AuthProvider refresh storm in fresh browser profiles (finding for later phases).** `AuthProvider` has a legacy "cookie migration" effect: when `localStorage.auth_refresh_cookie_migrated_v2` is missing it POSTs `/api/auth/refresh`. A browser context created from a storageState (cookies only) hit it, the effect fired twice, the second call carried the already rotated refresh token and got 401, and the following question save failed. `newSessionContext` therefore pre-sets that key with `addInitScript`. This is test-side only and a real user with a cleared localStorage but live cookies would hit the same race.
- **Student runner and the matching selects** are Radix selects, found through the label text container plus `getByRole('option')`; they worked on both viewports with no workaround.
- **Mobile.** The whole authoring, take-test and review flows pass on Pixel 7 with no sidebar trigger needed because pages are opened by URL. No `test.fixme` was used. The 01-09 finding (no visible sidebar trigger below 1024 px) is unchanged and not touched by these flows.
- **Digit-only answer keys are stored as numbers** (finding): saving `3142` or `1` as `correct` returns a JSON number from `/by-slug`. Scoring normalises numbers (`normalizeIdValue`, `normalizeDigitsSequence`), so scoring still works, but any code that compares keys with `===` and a string would not.
- `yarn e2e` rebuilds `app/web/.next` with the e2e API origin (as noted in 01-09); a developer's next `next start` serves that build until it is rebuilt.
- The `test.fail` list-reporter lines show as `✘` but are counted as passed (`40 passed`, exit 0); an unexpected pass is reported as a failure.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-1-29: D1's key correction and all authoring write only to the per-project fixtures `review-d1-<p>` and `authoring-<p>` in a scratch database, `workers: 1`. T-1-30: `test.fail()` with setup in a preceding regular test of the same serial block (probe-verified that `beforeAll` would NOT protect it), no `test.skip(`, `waitForTimeout` count 0, pre-annotation messages recorded above. T-1-SC: no installs.

## User Setup Required

None.

## Next Phase Readiness

- Phase 3 (EXAM-06, EXAM-07) fixes D2 and D5 and Phase 5 (SCORE-03) fixes D1: when a fix lands, Playwright reports an unexpected pass for the matching `@known-defect` test and the `test.fail(` wrapper must be turned back into `test(`.
- 01-15 (CI) runs `yarn e2e`; the specs use no extra environment.

## Verification Results

- `yarn e2e --grep "@flow2|@flow3|@known-defect"`: exit 0, 22 passed. `yarn e2e --grep "@flow4|@known-defect"`: exit 0, 26 passed (final code, setup tests included).
- `yarn e2e` (final code): **exit 0, 40 passed** (4 auth setup, flow 1 and smoke, flows 2-4, 3 defect setup tests and D1/D2/D5 as expected failures, on `chromium-desktop` and `chromium-mobile`). No `bio-exam-pg-*` or `bio-exam-e2e-storage-*` directory remained afterwards.
- `grep -cE "waitForTimeout|test\.skip\(" e2e/tests/take-test.spec.ts e2e/tests/review.spec.ts e2e/tests/authoring.spec.ts e2e/fixtures/exam.ts`: 0 for all four.
- `test.fail(` calls: 2 in `review.spec.ts` (D1, D2) and 1 in `authoring.spec.ts` (D5), each with a comment naming the defect and the fixing phase (`grep -c` also counts comment lines: 3 and 2); the setup of each is the preceding regular test of its `test.describe.serial` block.
- `oxfmt --check` and `oxlint` on the four files: clean. Ad-hoc `tsc --noEmit --strict` over the four files plus `accounts.ts`: clean.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- Root pin guard re-run before the final SUMMARY write: OK.

- `[ -f ]` for the four created files: FOUND (`e2e/fixtures/exam.ts`, `e2e/tests/take-test.spec.ts`, `e2e/tests/review.spec.ts`, `e2e/tests/authoring.spec.ts`).
- Commits: none by rule; `git rev-list --count 11b2916..HEAD` = 0, changes sit in the working tree on purpose.
- Acceptance: `@flow2` in take-test (all five templates asserted by `toEqual` on the seed's template list); `@flow3`, `/admin/attempts/` and two `test.fail(` in review.spec.ts; `@flow4` and one `test.fail(` in authoring.spec.ts; forbidden-pattern grep = 0; full `yarn e2e` exit 0.
