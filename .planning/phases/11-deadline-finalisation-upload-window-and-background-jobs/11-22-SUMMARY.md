---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 22
subsystem: api
status: complete
tags: [attempt-sessions, submit, deadline, refactor, outcome-vocabulary, e2e-seed]
requires:
  - phase: 11-19
    provides: словарь SessionOutcome, classifySubmitted, startAttemptSession, saveSessionDraft, sendSessionOutcome
provides:
  - "commands.ts: submitSession(pair, request) сама решает, когда финализировать при сдаче"
  - "submit.ts (внутреннее): precheckSubmit и submitAttempt в словаре SessionOutcome, ScoredSubmission, DraftChanged; перегрузка submitAttempt с expectedDraft"
  - "public.ts: /submit — checkAttemptAccess → submitSession → sendSessionOutcome(res, 'submit', …)"
  - "e2e-seed.ts: попытки сида через startAttemptSession и submitSession"
affects: [11-18, 12, 13, 14]
actuals:
  tokens: 11700
  tasks: 3
  commits: 0
plan_head_before: 1acc806c224cf6ef8f49de4120576722f5127f7d
plan_head_after: 1acc806c224cf6ef8f49de4120576722f5127f7d
tech-stack:
  added: []
  patterns:
    - "Все входы попытки (старт, черновик, сдача, судьба, задача) вызывают команды модуля сессии попытки; маршрут переводит исход в HTTP одной функцией sendSessionOutcome по столбцу маршрута"
    - "Запись попытки принимает результат scoreSubmission целиком и выводит results, resultsVersion, окно фото и признак открытого вопроса внутри"
key-files:
  created: []
  modified:
    - app/server/src/services/attempt-sessions/commands.ts
    - app/server/src/services/attempt-sessions/submit.ts
    - app/server/src/services/attempt-sessions/deadline.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/scripts/e2e-seed.ts
    - app/server/src/services/attempt-sessions/commands.test.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
    - app/server/src/services/background-jobs/background-jobs.test.ts
key-decisions:
  - "Сид идёт через submitSession: четыре засеянные попытки (review-pending-desktop, review-graded-desktop, review-pending-mobile, review-graded-mobile) получают upload_closes_at = submitted_at + 15 минут; seed.json не менялся"
  - "finalized или submitted во всех шагах сдачи решает classifySubmitted по submit_source, включая ветку ClientAttemptConflict (submit_source найденной попытки переносится в исключении из транзакции)"
  - "Шаги precheckSubmit и submitAttempt внутренние (submit.ts), закрепления импортируют их из submit.js; заглушка результата оценки — объект ok: true из scoreSubmission"
  - "submitAttempt перегружен: без expectedDraft тип исхода не содержит draft_changed, маршрут о нём не знает"
  - "Сид читает пояснения через explanationReaderFor(pair.test) вместо readExplanation: async () => null, как HTTP-путь"
requirements-completed: [TIME-01, TIME-06]
coverage:
  - id: D1
    description: "/submit вызывает submitSession, ответы /submit прежние"
    requirement: TIME-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-submit.test.ts"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-races.test.ts"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-deadline.test.ts#ленивая финализация на /submit"
        status: pass
    human_judgment: false
  - id: D2
    description: "409 после финализации с видом попытки deadline, прежнее 409 для клиентской сдачи"
    requirement: TIME-06
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-deadline.test.ts#тела ответов 200 и 409"
        status: pass
    human_judgment: false
  - id: D3
    description: "submitSession без HTTP: no_questions, окно для фото, гонка трёх путей финализации"
    verification:
      - kind: integration
        ref: "app/server/src/services/attempt-sessions/commands.test.ts#submitSession"
        status: pass
    human_judgment: false
  - id: D4
    description: "Попытки сида создаются командами модуля, e2e, читающие попытки сида, зелёные"
    verification:
      - kind: e2e
        ref: "yarn e2e tests/attempt-review-pending.spec.ts tests/attempts-list.spec.ts tests/review.spec.ts tests/teacher-zone.spec.ts tests/timed-attempt.spec.ts tests/submit-retry.spec.ts tests/answer-durability.spec.ts tests/attempt-slow-network.spec.ts"
        status: pass
    human_judgment: false
duration: 17min
completed: 2026-10-13
---

# Phase 11 Plan 22: сдача — команда модуля submitSession, шаги сдачи в словаре исходов

**POST /submit вызывает одну команду submitSession(pair, request), которая сама финализирует просроченную сессию, оценивает и пишет попытку; precheckSubmit и submitAttempt ушли из публичного интерфейса и говорят словарём SessionOutcome, ScoredAttemptFacts удалён, сид e2e создаёт попытки той же командой; ответы API прежние.**

## Performance

- Duration: около 17 минут
- Tasks: 3 из 3
- Files: 10 изменены, новых нет
- Коммитов нет (правило фазы: коммитит ведущая сессия)

## Решения плана

- **Смена фикстуры e2e.** Сид идёт через `submitSession`, поэтому все четыре засеянные попытки (`review-pending-desktop`, `review-graded-desktop`, `review-pending-mobile`, `review-graded-mobile`; во всех тестах есть вопрос `open`, лимита нет, окно по умолчанию) получают `upload_closes_at = submitted_at + 15 минут` (без лимита `LEAST(submitted_at, NULL)` даёт `submitted_at`). Раньше было `NULL`. `seed.json` не менялся, строка счётчиков прежняя: `e2e-seed: users=128 tests=28 questions=44 prompts=44 attempts=4 notifications=42`. Восемь e2e-спеков зелёные без правок ожиданий.
- **classifySubmitted везде.** `finalized` или `submitted` решает `classifySubmitted` по `submit_source` в пяти местах `submit.ts`: предпроверка сданной сессии, сданная сессия с другим ключом в транзакции (и без `attemptId`), ветка `ClientAttemptConflict`. Для конфликта `submit_source` найденной попытки читается в той же выборке, что и её id, и переносится в исключении (транзакция откатывается броском).
- **Шаги внутренние.** `precheckSubmit`, `submitAttempt`, `ScoredSubmission` экспортируются из `submit.ts`, но не из `index.ts`; закрепления импортируют `submit.js` динамически после `startAuthApp`. Заглушка — объект `ok: true` из `scoreSubmission`.
- **Перегрузка submitAttempt.** С `expectedDraft: unknown` исход включает `{ kind: 'draft_changed' }` (тип `DraftChanged` экспортируется из `submit.ts`, им же пользуется `deadline.ts`), без него — нет; маршрут и команда сдачи `draft_changed` не видят.

## Публичный интерфейс index.ts после плана (для 11-18)

Доступ и тест: `checkAttemptAccess`, `findVisibleTest`, `findVisibleTestBySlug`, `isAssignedOrPrivileged`, `visibleTestsFilter`, типы `AttemptAccess`, `AttemptAccessParams`, `AttemptTest` (`access.ts`).

Команды (`commands.ts`):
- `startAttemptSession(pair: AttemptPair): Promise<SessionOutcomeOf<'open'>>`
- `saveSessionDraft(pair: AttemptPair, sessionId: string, draft: SaveAttemptDraftRequest): Promise<SessionOutcomeOf<'saved' | 'answers_invalid'> | SettledOutcome>`
- `submitSession(pair: AttemptPair, request: SubmitAttemptRequest): Promise<SessionOutcomeOf<'accepted' | 'finalized' | 'submitted' | 'expired' | 'superseded' | 'not_found' | 'answers_invalid' | 'no_questions'>>`

Финализация (`deadline.ts`): `finalizeSessionByDeadline(sessionId, owner?) → SettledOutcome`, `findSessionsDueForFinalization`, `closeStaleOpenSessions`, `FINALIZE_SETTLE_SECONDS`, `DEADLINE_CLIENT_ATTEMPT_PREFIX`, `deadlineClientAttemptId`.

Сессии (`sessions.ts`): `databaseNow`, `DEADLINE_FINALIZE_MAX_AGE_HOURS`, тип `SessionInfo`.

Окно фото (`upload-window.ts`): `photoUploadWindow`, `uploadWindowRefusal`, `uploadWindowState`, типы `UploadWindowExecutor`, `UploadWindowInput`, `UploadWindowState`.

Типы словаря (`outcome.ts`): `AttemptPair`, `SessionOutcome`, `SessionOutcomeOf`, `SessionOwner`, `SessionTest`, `SettledOutcome`.

Убраны из `index.ts`: `precheckSubmit`, `submitAttempt`, `explanationReaderFor`, `ScoredAttemptFacts`, `PrecheckSubmitParams`, `PrecheckSubmitResult`, `SubmitAttemptOutcome`, `SubmitAttemptParams`, `SessionCloseReason`.

Внутри модуля (`submit.ts`):
- `precheckSubmit(owner, { sessionId, clientAttemptId }, timeLimitMinutes)` → `{ kind: 'writable' } | { kind: 'past_deadline' } | accepted | finalized | submitted | expired | superseded | not_found`
- `submitAttempt({ owner, sessionId, clientAttemptId, answers, telemetry?, scored, test, source })` → `accepted | finalized | submitted | expired | superseded | not_found`; с `expectedDraft` ещё `draft_changed`
- `closeSessionAsExpired(sessionId)`, типы `ScoredSubmission`, `DraftChanged`

`public.ts`, столбец `'submit'` в `sendSessionOutcome`: `accepted` → 200 вид попытки; `finalized` → 409 `{ error, ...submittedBody }`; `submitted` → 409 `{ error, attemptId }` (`attemptId` может быть `null`); `expired` → 422 `TIME_EXPIRED`; `superseded`, `not_found` → 404 `Session not found`; `answers_invalid` → 422; `no_questions` → 404 `Questions not found`. `sendAlreadySubmitted`, `rejectClosedSession`, `timeExpired` удалены.

## Смена закреплений (красный → зелёный)

Задача 1:
- Красный: служебные случаи `attempt-deadline` («submitAttempt с устаревшим expectedDraft…», «клиентская сдача после финализации… получает finalized с попыткой deadline» — заголовок поправлен с `conflict` на `finalized` вслед за исходом), `attempt-time-limit` (describe «между предпроверкой и транзакцией submit», заголовок второго случая — «даёт expired»; `attemptSessions` из файла ушёл, шаги из `submit.js`), `background-jobs` («запас после льготы», `STUB_SCORED: ScoredSubmission`) и новый `commands.test.ts` «тест без вопросов: no_questions». Прогон четырёх файлов: `Test Files 4 failed (4)`, `Tests 6 failed | 78 passed (84)` (`attemptSessions.submitSession is not a function`, `AssertionError: Expected values to be strictly deep-equal`).
- Зелёный: семь закрепляющих наборов `<verify>` — `Test Files 7 passed (7)`, `Tests 108 passed (108)`; typecheck чистый. Ворота трассера: повтор `<verify>` — `Tests 108 passed (108)`.

Задача 2:
- Случаи «тест с открытым вопросом: accepted, upload_closes_at через 15 минут после сдачи» и «гонка трёх путей финализации без HTTP: пять раундов, одна попытка deadline» зелёные сразу (команда построена в задаче 1): `Tests 15 passed (15)` в `commands.test.ts`.

## codegraph

Индекс `.codegraph/` лежит в основном checkout; выводы ниже отражают дерево `dev` до правок, не worktree.

- `codegraph impact submitAttempt` (submit.ts:145) — 10 символов: `submit.ts`, `public.ts` (файл и `POST /api/tests/public/tests/:id/submit`), `routes/index.ts`, `deadline.ts` (`finalizeDraft`, `finalizeOnce`), `scripts/e2e-seed.ts` (`main`), `attempt-sessions/index.ts`. Второе определение с тем же именем — HTTP-помощник `test-support/attempt-world.ts:165` (26 символов), не менялся.
- `codegraph impact precheckSubmit` — 5 символов: `submit.ts`, `public.ts` (маршрут `/submit`), `routes/index.ts`, `attempt-sessions/index.ts`.
- `codegraph node ScoredAttemptFacts` — тип в `submit.ts:18` (удалён); потребители по `grep`: `deadline.ts`, `public.ts`, `e2e-seed.ts`, `background-jobs.test.ts`, `index.ts`.
- `codegraph affected` по файлам плана: `app/server/src/routes/tests/admin/attempts.ts`, `app/server/src/routes/tests/public.ts` (тест-файлы индекс не связывает; наборы выбраны по плану, прогнан полный серверный набор).

## Проверки

- Охранники `node --test scripts/attempt-integrity-guards.test.mjs scripts/teacher-zone-guards.test.mjs`: 27 pass, 0 fail.
- `yarn workspace @bio-exam/server typecheck`: чисто; `lint`: одно прежнее предупреждение `no-control-regex` в `services/storage/keys.ts`.
- Полный серверный набор: до — `Test Files 104 passed (104)`, `Tests 2039 passed (2039)`; после — `Test Files 104 passed (104)`, `Tests 2042 passed (2042)` (+3 в `commands.test.ts`).
- `yarn verify: OK` (все восемь шагов passed, load average около 6,7).
- `yarn e2e tests/attempt-review-pending.spec.ts tests/attempts-list.spec.ts tests/review.spec.ts tests/teacher-zone.spec.ts tests/timed-attempt.spec.ts tests/submit-retry.spec.ts tests/answer-durability.spec.ts tests/attempt-slow-network.spec.ts`: `82 passed (1.4m)`, сид `attempts=4`.
- Критерии приёмки: в `public.ts` 0 вхождений `scoreSubmission|precheckSubmit|submitAttempt|explanationReaderFor|sendAlreadySubmitted|rejectClosedSession` и 0 `draft_changed`; `ScoredAttemptFacts` — 0 в `submit.ts`, `deadline.ts`, `index.ts`, `public.ts`; `classifySubmitted` в `submit.ts` — 5; `precheckSubmit|submitAttempt|explanationReaderFor` в `index.ts` — 0; в `e2e-seed.ts` `submitSession` есть, `scoreSubmission|resultsVersion|submitAttempt` — 0; `attempt-submit.test.ts`, `attempt-races.test.ts`, `route-inventory.txt`, `e2e/fixtures/seed.json` не изменены (`git status --short` их не показывает).
- `11-plan-files.cjs check 11-22` не запускался (режим worktree).

## Deviations from Plan

1. Заголовки двух служебных случаев поправлены вслед за исходами: «…получает conflict с попыткой deadline» → «…получает finalized с попыткой deadline», «…даёт closed с reason expired» → «…даёт expired». Тела случаев изменены строго по списку «Закрепления сервиса».
2. `DraftChanged` экспортируется из `submit.ts`, `deadline.ts` больше не объявляет свой тип: перегрузка `submitAttempt` и `untilDraftSettles` говорят одним типом.
3. `deadline.ts` передаёт `test: session` (строка финализации содержит `timeLimitMinutes` и `photoUploadWindowMinutes`); `outcomeOfSubmit` удалён: исходы записи уже в словаре, `accepted` → `finalized`.
4. В гонке без HTTP исход сдачи тоже `finalized` (сдача при `past_deadline` идёт через финализацию или находит попытку `deadline`), как и требует план.
5. `outcome.ts` и `jobs.ts` не менялись (`# optional`): `classifySubmitted` хватило прежнего входа, подсчёт задачи компилируется на `SettledOutcome`.

## Follow-up

- `.agents/skills/bio-exam-api/SKILL.md:41` называет сдачу `precheckSubmit`, `submitAttempt`, `closeExpiredSession`; после плана публичная команда сдачи — `submitSession`. Файл не в списке плана, правка — в 11-18 (README и навык).

## Known Stubs

Нет.

## Файлы к коммиту

- `app/server/src/services/attempt-sessions/commands.ts`
- `app/server/src/services/attempt-sessions/submit.ts`
- `app/server/src/services/attempt-sessions/deadline.ts`
- `app/server/src/services/attempt-sessions/index.ts`
- `app/server/src/routes/tests/public.ts`
- `app/server/src/scripts/e2e-seed.ts`
- `app/server/src/services/attempt-sessions/commands.test.ts`
- `app/server/src/routes/tests/attempt-deadline.test.ts`
- `app/server/src/routes/tests/attempt-time-limit.test.ts`
- `app/server/src/services/background-jobs/background-jobs.test.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-22-SUMMARY.md`

## Self-Check: PASSED
