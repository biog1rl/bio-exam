---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 19
subsystem: api
status: complete
tags: [attempt-sessions, deadline, refactor, outcome-vocabulary, express]
requires:
  - phase: 11-09
    provides: finalizeSessionByDeadline, finalize-deadlines, ленивая финализация на /start, PATCH, GET судьбы и /submit
provides:
  - "outcome.ts: словарь исходов SessionOutcome, SessionOutcomeOf, SettledOutcome, classifySubmitted, ownerOf, SessionOwner, SessionTest, AttemptPair"
  - "commands.ts: startAttemptSession(pair) и saveSessionDraft(pair, sessionId, draft) сами решают, когда финализировать"
  - "draft-answers.ts: одно правило ответов черновика draftAnswerRule(testId) для PATCH и финализации"
  - "deadline.ts: finalizeSessionByDeadline(sessionId, owner?) → SettledOutcome (open несёт SessionInfo), untilDraftSettles"
  - "sessions.ts: sessionFilter и closeSessionsAsExpired вместо трёх предикатов и трёх закрытий"
  - "public.ts: sendSessionOutcome для /start, PATCH и GET судьбы; submittedBody — одно тело «сдано» для судьбы и 409 /submit"
affects: [11-22, 11-18, 12, 13, 14]
actuals:
  tokens: 13000
  tasks: 3
  commits: 0  # по 11-EXEC-RULES коммитит ведущая сессия, изменения в рабочем дереве
tech-stack:
  added: []
  patterns:
    - "Команда модуля сессии попытки отдаёт исход общего словаря, маршрут переводит его в HTTP одной функцией по таблице"
    - "Транзакции старта и записи черновика возвращают внутренний признак (needs_finalization, not_written), финализацию вызывает команда после выхода из транзакции"
key-files:
  created:
    - app/server/src/services/attempt-sessions/outcome.ts
    - app/server/src/services/attempt-sessions/commands.ts
    - app/server/src/services/attempt-sessions/draft-answers.ts
    - app/server/src/services/attempt-sessions/commands.test.ts
  modified:
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/server/src/services/attempt-sessions/deadline.ts
    - app/server/src/services/attempt-sessions/submit.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/scripts/e2e-seed.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
key-decisions:
  - "Словарь исходов строится на видах прежнего FinalizeOutcome (finalized, submitted, expired, superseded, not_found) плюс open с сессией, saved, accepted, answers_invalid, no_questions; accepted и no_questions заведены для 11-22"
  - "finalized или submitted решает classifySubmitted по test_attempts.submit_source, а не по сравнению client_attempt_id с deadline:<sid>"
  - "open несёт SessionInfo с serverNow из того же чтения (clock_timestamp() в выборке finalizeOnce); GET судьбы не читает started_at повторно"
  - "startAttemptSession(pair) финализирует сам: транзакция openOrStartSession → признак needs_finalization → finalizeSessionByDeadline вне транзакции → второй проход, второй признак — Error"
  - "Правило ответов черновика читает все вопросы теста: ключ не UUID — foreign_question, неверная форма — answer_shape_invalid (в логе финализации раньше invalid_value)"
  - "Цикл повторов — untilDraftSettles(step, rounds) с признаком { kind: 'draft_changed' } вместо Symbol"
  - "Одиночное закрытие сессии как истёкшей — closeSessionAsExpired(sessionId) в submit.ts поверх closeSessionsAsExpired; давний хвост — closeSessionsAsExpired(db, exists(...tests...))"
  - "sendSessionOutcome в этом плане знает маршруты 'start' | 'draft' | 'fate'; столбец /submit добавляет 11-22"
requirements-completed: [TIME-01, TIME-06]
coverage:
  - id: D1
    description: "finalizeSessionByDeadline отдаёт open с сессией, GET судьбы переводит исход sendSessionOutcome, ответы судьбы прежние"
    requirement: TIME-06
    verification:
      - kind: integration
        ref: "app/server/src/services/attempt-sessions/commands.test.ts#finalizeSessionByDeadline: исход open несёт сессию"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-deadline.test.ts#судьба сессии GET /sessions/:sessionId"
        status: pass
    human_judgment: false
  - id: D2
    description: "/start и PATCH черновика вызывают команды модуля; R3 на старте, D-03, D-04, D-21 прежние"
    requirement: TIME-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-deadline.test.ts#startAttemptSession на просроченной сессии"
        status: pass
      - kind: integration
        ref: "app/server/src/services/attempt-sessions/commands.test.ts#startAttemptSession"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/tests/attempt-time-limit.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Одно правило ответов черновика draftAnswerRule"
    verification:
      - kind: integration
        ref: "app/server/src/services/attempt-sessions/commands.test.ts#draftAnswerRule"
        status: pass
    human_judgment: false
  - id: D4
    description: "Цикл повторов untilDraftSettles"
    verification:
      - kind: unit
        ref: "app/server/src/services/attempt-sessions/commands.test.ts#untilDraftSettles"
        status: pass
    human_judgment: false
  - id: D5
    description: "Сценарии ученика с таймером, сохранением черновика и сдачей в браузере"
    verification:
      - kind: e2e
        ref: "yarn e2e tests/attempt-review-pending.spec.ts tests/timed-attempt.spec.ts tests/submit-retry.spec.ts tests/answer-durability.spec.ts tests/attempt-slow-network.spec.ts"
        status: pass
    human_judgment: false
duration: 20min
completed: 2026-10-06
---

# Phase 11 Plan 19: модуль сессии попытки решает, когда финализировать, и отдаёт один словарь исходов

**Команды startAttemptSession(pair) и saveSessionDraft(pair, sessionId, draft) финализируют внутри модуля, finalizeSessionByDeadline отдаёт SessionOutcome с сессией в open, public.ts переводит исход в HTTP одной функцией sendSessionOutcome; дубли условия владельца, закрытия как истёкшей и проверки ответов черновика сняты, ответы API прежние.**

## Performance

- Duration: около 20 минут
- Tasks: 3 из 3
- Files: 4 созданы, 7 изменены
- Коммитов нет (правило фазы: коммитит ведущая сессия)

## Публичный интерфейс index.ts после плана (для 11-22)

Без изменений: `checkAttemptAccess`, `findVisibleTest`, `findVisibleTestBySlug`, `isAssignedOrPrivileged`, `visibleTestsFilter`, типы `AttemptAccess`, `AttemptAccessParams`, `AttemptTest`; окно фото `photoUploadWindow`, `uploadWindowRefusal`, `uploadWindowState` и их типы; `explanationReaderFor`.

Сессия и финализация:
- `startAttemptSession(pair: AttemptPair): Promise<SessionOutcomeOf<'open'>>` (`commands.ts`)
- `saveSessionDraft(pair: AttemptPair, sessionId: string, draft: SaveAttemptDraftRequest): Promise<SessionOutcomeOf<'saved' | 'answers_invalid'> | SettledOutcome>` (`commands.ts`)
- `finalizeSessionByDeadline(sessionId: string, owner?: SessionOwner): Promise<SettledOutcome>` (`deadline.ts`)
- `findSessionsDueForFinalization`, `closeStaleOpenSessions`, `FINALIZE_SETTLE_SECONDS`, `DEADLINE_CLIENT_ATTEMPT_PREFIX`, `deadlineClientAttemptId` (`deadline.ts`)
- `databaseNow`, `DEADLINE_FINALIZE_MAX_AGE_HOURS`, тип `SessionInfo` (`sessions.ts`)
- типы `SessionOutcome`, `SessionOutcomeOf`, `SettledOutcome`, `SessionOwner`, `SessionTest`, `AttemptPair` (`outcome.ts`)

Временно до 11-22 (сдача прежними шагами): `precheckSubmit`, `submitAttempt`, типы `PrecheckSubmitParams`, `PrecheckSubmitResult`, `ScoredAttemptFacts`, `SessionCloseReason`, `SubmitAttemptOutcome`, `SubmitAttemptParams` (`submit.ts`).

Убраны из `index.ts`: `SessionNeedsFinalizationError`, `finalizeExpiredOpenSession`, `readSessionFate`, `closeExpiredSession`, `FinalizeOutcome`, `SessionFateRead`, `DeadlineOwner`, `SaveSessionDraftResult`, `SaveSessionDraftParams`, `StartAttemptSessionParams`.

Внутри модуля (не из `index.ts`), пригодится 11-22:
- `outcome.ts`: `classifySubmitted({ id, submitSource })` → `finalized` (есть id и `submitSource === 'deadline'`) или `submitted` с `attemptId` (может быть `null`); `ownerOf(pair)` → `{ testId: pair.test.id, userId: pair.userId }`.
- `sessions.ts`: `sessionFilter({ sessionId?, owner?, open? })`, `closeSessionsAsExpired(executor, where): Promise<string[]>` (только `submitted_at IS NULL AND closed_at IS NULL`, `draft_answers` не трогает), `sessionExpired`, `toSessionInfo`, `openOrStartSession(owner, timeLimitMinutes)` → `open | { kind: 'needs_finalization', sessionId }`, `writeSessionDraft({ owner, sessionId, timeLimitMinutes, questionId?, value?, telemetry? })` → `saved | { kind: 'not_written' }`.
- `submit.ts`: `closeSessionAsExpired(testSessionId)` (одиночная сессия поверх `closeSessionsAsExpired`); `precheckSubmit` и `submitAttempt` читают сессию через `sessionFilter`.
- `deadline.ts`: `untilDraftSettles<T>(step: () => Promise<T | { kind: 'draft_changed' }>, rounds = 3): Promise<T>`, бросает `Error('finalizeSessionByDeadline: draft kept changing')`; финализация отбрасывает ответы черновика по `draftAnswerRule` с `logger.warn({ sessionId, questionId, reason })`.
- `draft-answers.ts`: `draftAnswerRule(testId): Promise<(questionId, raw) => DraftAnswerVerdict>`, `DraftAnswerVerdict = { ok: true; value } | { ok: false; violation }`.

`public.ts`:
- `sendSessionOutcome(res, route: 'start' | 'draft' | 'fate', outcome: SessionOutcome, viewer: AttemptViewer)` по таблице плана; недостижимая ячейка бросает `Error('sendSessionOutcome: outcome <kind> is not expected on <route>')`. 11-22 добавляет `'submit'` и ячейки `accepted`, `finalized`, `submitted`, `expired`, `superseded`, `not_found`, `answers_invalid` (422), `no_questions`.
- `submittedBody(attemptId, viewer)` → `{ attemptId, submitSource, uploadClosesAt, serverNow, attempt }`; `sendAlreadySubmitted` на `/submit` читает его один раз и отдаёт полное тело только для вида `deadline`, иначе `{ error, attemptId }`.
- `studentViewer(test)` → `{ kind: 'student', showCorrectAnswer }` для /start, PATCH, судьбы и /submit.

## Accomplishments

- Финализация отдаёт исход общего словаря; GET судьбы — `checkAttemptAccess` → `finalizeSessionByDeadline(sessionId, owner)` → `sendSessionOutcome`.
- `/start` — один вызов `startAttemptSession({ test: access.test, userId })`, без `finalizeExpiredOpenSession` и без исключения; PATCH — `saveSessionDraft({ test, userId }, sessionId, parsed.data)`; маршрут не проверяет лимит и не финализирует сам.
- Транзакции старта и черновика не вызывают финализацию (Pitfall 1): признак → команда → финализация вне транзакции.
- `sessionWhere`, `sessionOfPair`, `openSessionOf`, `scorableDraft`, `closeExpiredSession`, `SessionNeedsFinalizationError`, `finalizeExpiredOpenSession`, `readSessionFate`, `startAfterFinalization` удалены.
- Сид e2e открывает сессию командой `startAttemptSession({ test, userId })`, `testRows` хранит `SessionTest`; оценка и запись попытки прежние.

## Смена закреплений (красный → зелёный)

Задача 1:
- Красный: `commands.test.ts` «finalizeSessionByDeadline: исход open несёт сессию» (2 случая) — `AssertionError: open без session`; `Tests 2 failed | 45 passed (47)`. Служебный случай «$name: open, база не меняется» в `attempt-deadline.test.ts` ослаблен до `assert.equal(outcome.kind, 'open')` (зелёный и до, и после).
- Зелёный: `commands.test.ts`, `attempt-deadline`, `background-jobs`, `route-inventory.snapshot` — `Test Files 4 passed (4)`, `Tests 59 passed (59)`; typecheck сервера чистый. Ворота трассера (повтор `<verify>`) пройдены.

Задача 2:
- Красный: `test.each` «startAttemptSession на просроченной сессии: $name» переписан на исходы команды `startAttemptSession({ test, userId })` (черновик и 13 мин → новая сессия, у прежней попытка `deadline`; черновик и 25 ч 12 мин → новая, прежняя `expired` с черновиком; пустой черновик → новая, прежняя `expired`): 3 случая красные; `commands.test.ts` красный целиком (нет `./draft-answers.js`). `Test Files 2 failed (2)`, `Tests 3 failed | 42 passed | 9 skipped (54)`.
- Зелёный: `commands.test.ts`, `attempt-deadline`, `attempt-time-limit`, `route-inventory.snapshot` — `Test Files 4 passed (4)`, `Tests 72 passed (72)`; typecheck чистый.

Задача 3:
- Таблица `untilDraftSettles` (1 вызов; 3 вызова и исход третьего; 3 вызова и `draft kept changing`) зелёная сразу: цикл перенесён в задаче 1.

## codegraph

`codegraph impact` до правок:
- `finalizeSessionByDeadline` — 12 символов: `deadline.ts` (`readSessionFate`, `finalizeExpiredOpenSession`), `public.ts` (GET судьбы, `/start`, `startAfterFinalization`, PATCH, `/submit`), `routes/index.ts`, `attempt-sessions/index.ts`, `background-jobs/jobs.ts`.
- `readSessionFate` — 5: `deadline.ts`, `public.ts` (GET судьбы), `routes/index.ts`, `attempt-sessions/index.ts`.
- `startAttemptSession` — 8: `sessions.ts`, `public.ts` (`startAfterFinalization`, `/start`), `scripts/e2e-seed.ts` (`main`), `routes/index.ts`, `attempt-sessions/index.ts`.
- `saveSessionDraft` — 5: `sessions.ts`, `public.ts` (PATCH), `routes/index.ts`, `attempt-sessions/index.ts`.
- `openSessionOf` — 11: `sessions.ts` (`saveSessionDraft`, `startAttemptSession`), `deadline.ts` (`finalizeExpiredOpenSession`), `public.ts` (`/start`, PATCH, `startAfterFinalization`), `attempt-sessions/index.ts`, `e2e-seed.ts`.
- `closeExpiredSession` — 6: `submit.ts`, `deadline.ts` (`finalizeDraft`, `finalizeOnce`, `finalizeSessionByDeadline`), `attempt-sessions/index.ts`.

`codegraph affected` по файлам плана: `app/server/src/routes/tests/admin/attempts.ts`, `app/server/src/routes/tests/public.ts` (индекс не связывает с ними тест-файлы; наборы выбраны по плану и прогнан полный серверный набор).

## Проверки

- Закрепляющие наборы задачи 3 (`attempt-deadline`, `attempt-submit`, `attempt-time-limit`, `attempt-races`, `background-jobs`, `route-inventory.snapshot`, `commands.test.ts`): `Test Files 7 passed (7)`, `Tests 107 passed (107)`.
- Охранники `node --test scripts/attempt-integrity-guards.test.mjs scripts/teacher-zone-guards.test.mjs`: 27 pass, 0 fail.
- Полный серверный набор: до — `Test Files 103 passed`, `Tests 2027 passed`; после — `Test Files 104 passed`, `Tests 2039 passed` (+12 в `commands.test.ts`). Прогон «после» завершился кодом 1 из-за известного unhandled 57P01 в `src/db/answer-keys-jsonb.test.ts` при нагрузке (load average около 11); все тесты зелёные, в `yarn verify` тот же набор прошёл.
- `yarn workspace @bio-exam/server typecheck`: чисто.
- `yarn verify: OK` (все шаги passed, включая `format-check` и `script-tests`).
- `yarn e2e tests/attempt-review-pending.spec.ts tests/timed-attempt.spec.ts tests/submit-retry.spec.ts tests/answer-durability.spec.ts tests/attempt-slow-network.spec.ts`: 38 passed (1.8m).
- `git diff --quiet` для `attempt-submit.test.ts`, `attempt-races.test.ts`, `attempt-time-limit.test.ts`, `background-jobs.test.ts`, `route-inventory.txt`: без изменений.
- `11-plan-files.cjs check 11-19` не запускался (режим worktree).

## Deviations from Plan

1. Решение по интерфейсу: `sendSessionOutcome` объявлен с маршрутами `'start' | 'draft' | 'fate'` без `'submit'`: столбец `/submit` по плану заполняет 11-22, пустой член объединения был бы мёртвым кодом.
2. Решение по интерфейсу: одиночное закрытие сессии вынесено в `closeSessionAsExpired(testSessionId)` в `submit.ts` (бывший `closeExpiredSession`, не экспортируется из `index.ts`): так `closeSessionsAsExpired` используется в `sessions.ts`, `deadline.ts` и `submit.ts`, как требует критерий задачи 2.
3. Решение по интерфейсу: добавлен помощник `studentViewer(test)` в `public.ts`: зритель ученика нужен четырём маршрутам.
4. `ownerOf(pair)` экспортируется из `outcome.ts` (в интерфейсе плана не назван): общее построение владельца для команд.
5. `jobs.ts` не менялся: подсчёт `finalized`/`expired`/`other` компилируется на `SettledOutcome`.

## Follow-up

- `.agents/skills/bio-exam-api/SKILL.md` (строка раздела «Попытка теста») называет удалённый `closeExpiredSession`; файла нет в списке плана, правка оставлена ведущей сессии или 11-22.

## Known Stubs

Нет.

## Файлы к коммиту

- `app/server/src/services/attempt-sessions/outcome.ts` (новый)
- `app/server/src/services/attempt-sessions/commands.ts` (новый)
- `app/server/src/services/attempt-sessions/draft-answers.ts` (новый)
- `app/server/src/services/attempt-sessions/commands.test.ts` (новый)
- `app/server/src/services/attempt-sessions/sessions.ts`
- `app/server/src/services/attempt-sessions/deadline.ts`
- `app/server/src/services/attempt-sessions/submit.ts`
- `app/server/src/services/attempt-sessions/index.ts`
- `app/server/src/routes/tests/public.ts`
- `app/server/src/scripts/e2e-seed.ts`
- `app/server/src/routes/tests/attempt-deadline.test.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-19-SUMMARY.md`

## Self-Check: PASSED
