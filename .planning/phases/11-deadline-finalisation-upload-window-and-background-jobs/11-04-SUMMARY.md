---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 04
subsystem: api
tags: [attempt, deadline, finalization, drizzle, postgres, idempotency]
requires:
  - phase: 11-03
    provides: upload_closes_at в submitAttempt, submit_source, shiftStartedAt, insertOpenQuestion, attemptRowOf
provides:
  - finalizeSessionByDeadline(sessionId, owner?) с исходами open | finalized | submitted | expired | superseded | not_found
  - submitAttempt с параметрами source и expectedDraft, исход draft_changed, момент сдачи серверной попытки — конец таймера
  - sessionExpired(limit, marginSeconds) для числа и столбца лимита, DEADLINE_FINALIZE_MAX_AGE_HOURS = 24 (D-21)
  - explanationReaderFor — чтение пояснений для оценки без маршрута
  - lib/db-errors.ts — isTransientDbError (текстовые признаки и SQLSTATE 08, 40, 53, 57, 55P03)
affects: [11-05, 11-06, 11-07, 11-08]
actuals:
  tokens: 8500
  tasks: 3
  commits: 0
tech-stack:
  added: []
  patterns:
    - одна функция финализации вне транзакций поверх общего submitAttempt; ровно одну попытку дают FOR UPDATE и уникальные индексы
    - сверка черновика под блокировкой по содержимому jsonb (IS NOT DISTINCT FROM), повтор до 3 раз
    - нетранзиентная ошибка финализации закрывает сессию expired, временная пробрасывается
key-files:
  created:
    - app/server/src/services/attempt-sessions/deadline.ts
    - app/server/src/services/attempt-sessions/explanations.ts
    - app/server/src/lib/db-errors.ts
  modified:
    - app/server/src/services/attempt-sessions/submit.ts
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
key-decisions:
  - "Повторный вызов для сессии, уже сданной финализацией, возвращает finalized (а не submitted): признак — client_attempt_id попытки сессии равен deadline:<sessionId>; ручная сдача даёт submitted"
  - "upload_closes_at считается как LEAST(момент сдачи, конец таймера) + окно; для клиентской попытки момент сдачи — now(), выражение то же, что в 11-03"
  - "Ответ черновика проверяется AnswerValueSchema и findAnswerViolation по одному вопросу; вопрос с неизвестным шаблоном или удалённый — ответ выбрасывается с logger.warn без тела ответа"
  - "Неизвестный тип вопроса в тесте даёт answers_invalid у scoreSubmission (проверка шаблонов всех вопросов), финализация бросает ошибку с id сессии, ветка R3 закрывает сессию expired"
requirements-completed: [TIME-01, TIME-02]
status: complete
---

# Phase 11 Plan 04: ядро серверной финализации по дедлайну Summary

`finalizeSessionByDeadline` превращает просроченный черновик открытой сессии в одну попытку `submit_source = 'deadline'` с `client_attempt_id = 'deadline:<sid>'` и моментом сдачи в конце таймера через общий `scoreSubmission` и `submitAttempt`; пустой черновик (D-04), сессия старше 24 ч после дедлайна плюс льготы (D-21) и ошибка данных закрывают сессию `expired` без попытки.

## Что сделано

- Task 1 (tracer): `lib/db-errors.ts` — `isTransientDbError` перенесён из `public.ts` с прежними признаками по тексту и SQLSTATE из `err.code`/`err.cause.code` (классы `08`, `40`, `53`, `57`, код `55P03`); `public.ts` импортирует его для `withTransientDbRetry`. `explanations.ts` — `explanationReaderFor(test)` поверх `readQuestionMarkdown`; `/submit` берёт `readExplanation` из него, импорт `readQuestionMarkdown` из `public.ts` убран, добавлена ветка `draft_changed` с исключением. `sessions.ts` — `sessionExpired(limit: number | null | SQLWrapper, marginSeconds = 0)`, одна формула для числа и столбца лимита, и `DEADLINE_FINALIZE_MAX_AGE_HOURS = 24`. `submit.ts` — `source` (по умолчанию `'client'`) пишется в `submit_source`; при `deadline` и лимите `submitted_at` попытки и сессии — `started_at + limit`; `expectedDraft` сверяется под `FOR UPDATE` после веток «сдана» и «закрыта» (`draft_answers IS NOT DISTINCT FROM $::jsonb`, для `null` — `IS NULL`), несовпадение — `draft_changed` до записи. `deadline.ts` — `finalizeSessionByDeadline`, `FinalizeOutcome`, `DeadlineOwner`, `DEADLINE_CLIENT_ATTEMPT_PREFIX`, `deadlineClientAttemptId`. Реэкспорт в `index.ts` одним блоком в конце файла. Tracer-тест.
- Task 2: варианты в `attempt-deadline.test.ts` (каждый случай — свой ученик и свой тест через `prepareDeadlineSession`). Все прошли с первого прогона, правок в `deadline.ts`/`submit.ts` не понадобилось.
- Task 3: охранники, полный серверный набор, `yarn verify`.

## Исходы FinalizeOutcome и тесты

| Исход | Когда | Тест в `attempt-deadline.test.ts` |
|-------|-------|-----------------------------------|
| `finalized` | просрочена, черновик есть → попытка `deadline`, `submitted_at` = конец таймера, черновик сессии очищен | «просроченная сессия с черновиком становится попыткой deadline…» |
| `finalized` (повтор) | сессия уже сдана финализацией (`client_attempt_id = deadline:<sid>`) | «повторный вызов возвращает ту же попытку…», «пять параллельных вызовов…» (`Promise.all`, один `attemptId`, попыток 1) |
| `finalized` (D-21, 23 ч) | дедлайн плюс льгота 23 ч назад | `test.each` D-21 `23 hours 12 minutes` |
| `finalized` (удалённый вопрос) | один живой и один удалённый ответ → в `answers` только живой | «ответ на удалённый вопрос выбрасывается…» |
| `expired` (D-04) | черновик пуст | «D-04: просроченная сессия без черновика…» |
| `expired` (удалённый вопрос) | черновик только с ответом на удалённый вопрос | «ответ на удалённый вопрос выбрасывается…» |
| `expired` (D-21) | дедлайн плюс льгота 25 ч назад → `closeExpiredSession`, черновик в строке остаётся | `test.each` D-21 `25 hours 12 minutes` |
| `expired` (R3, ошибка данных) | вопрос неизвестного типа → `answers_invalid` → ошибка → `logger.error`, закрытие, черновик в строке | «ошибка данных при оценке закрывает сессию expired…» |
| `open` | тест без лимита; в пределах льготы; база не меняется | `test.each` «тест без лимита, старт 10 дней назад», «лимит 10, старт 11 минут назад» |
| `submitted` | ручная сдача раньше финализации → id клиентской попытки | «сданная вручную сессия даёт submitted…» |
| `superseded` | сессия закрыта `superseded` | там же |
| `not_found` | чужой `owner` → сессия не меняется | «чужой владелец получает not_found…» |
| `draft_changed` (`submitAttempt`) | `expectedDraft` не совпал → ничего не записано | «submitAttempt с устаревшим expectedDraft…» |
| окно фото | открытый вопрос, окно 15 → `upload_closes_at = started_at + 10 + 15 мин` | «окно для фото серверной попытки идёт от конца таймера» |

Временная ошибка базы (`isTransientDbError`) и `draft kept changing` пробрасываются; отдельного теста на них в плане нет.

## codegraph

- `codegraph impact submitAttempt`: `POST /api/tests/public/tests/:id/submit`, `scripts/e2e-seed.ts` (`main`, проверяет только `kind !== 'created'`, новые параметры необязательны), `attempt-sessions/index.ts`.
- `codegraph impact sessionExpired`: `startAttemptSession`, `precheckSubmit`, маршруты `/start` и `/submit`; вызовы с числом и `marginSeconds = 0` дают прежнее условие.
- `codegraph impact closeExpiredSession`: `/submit`; функция не менялась, теперь её вызывает и `deadline.ts`.
- `codegraph impact isTransientDbError`: `withTransientDbRetry` и `GET /api/tests/public/topics/:topicSlug/tests/:testSlug` в `public.ts`; повтор чтения теперь срабатывает и на SQLSTATE `08/40/53/57/55P03`.
- `codegraph affected` по файлам плана: индекс собран по основному checkout (новых файлов в нём нет), вернул только `public.ts`; поэтому прогнан весь серверный набор и `yarn verify`.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-deadline.test.ts src/routes/tests/attempt-time-limit.test.ts`: 2 файла, 34 теста зелёные; `attempt-time-limit.test.ts` без правок.
- `node --test scripts/attempt-integrity-guards.test.mjs scripts/teacher-zone-guards.test.mjs`: 27 pass, 0 fail.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test`: 100 файлов, 1958 тестов зелёные (до плана 1944 по 11-03-SUMMARY; +14 в `attempt-deadline.test.ts`).
- `yarn verify`: первый прогон `FAILED at lint-typecheck-test` на известной нестабильности — unhandled `57P01` в `export-routes.test.ts` при зелёных 100 файлах сервера; повтор — `yarn verify: OK`, все шаги passed. Предупреждение линтера `no-control-regex` в `services/storage/keys.ts` существовало до плана.
- `yarn format:check`: зелёный (`yarn exec oxfmt` по файлам плана).
- Acceptance-grep: `explanationReaderFor` в `public.ts` 2, `draft_changed` в `public.ts` 1 и в `submit.ts` 2, `function isTransientDbError` в `public.ts` 0, в `db-errors.ts` 1, `deadline:` в `deadline.ts` 1, `DEADLINE_FINALIZE_MAX_AGE_HOURS` в `sessions.ts` 1 и `deadline.ts` 3, `make_interval` в `deadline.ts` 0; в тесте есть `superseded`, `draft_changed`, `not_found`, `Promise.all`, `25 hours`, `23 hours`.
- `11-plan-files.cjs check 11-04` не запускался: режим worktree, сверку делает ведущая сессия.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Повтор финализации давал submitted вместо finalized**
- **Found during:** Task 2 (до прогона, при сверке с must_haves)
- **Issue:** шаг 5 плана велит для сданной сессии отвечать `submitted`, а must_haves и `<behavior>` требуют, чтобы повторный вызов возвращал `finalized` с тем же `attemptId`.
- **Fix:** чтение сессии присоединяет `test_attempts` по `attempt_id`; если `client_attempt_id` попытки равен `deadline:<sid>`, исход `finalized`, иначе `submitted`. Тест параллельных вызовов требует `finalized` у всех пяти.
- **Files modified:** `app/server/src/services/attempt-sessions/deadline.ts`, `attempt-deadline.test.ts`

### Дополнения

- Тест ветки R3 (вопрос неизвестного типа) добавлен здесь на уровне сервиса; план относил тест `/start` с таким вопросом к 11-06, он там остаётся.
- Помимо `findAnswerViolation` ответ черновика проверяется `AnswerValueSchema` (черновик в jsonb мог быть записан до текущих схем); невалидный выбрасывается с причиной `invalid_value`.
- В `index.ts` дополнительно реэкспортированы `DEADLINE_CLIENT_ATTEMPT_PREFIX` и `deadlineClientAttemptId` (для 11-06/11-07).
- `uploadClosesAtOf` в `submit.ts` получает момент сдачи вместо литерала `now()`; для клиентской попытки выражение не изменилось.

## Threat model

- T-11-09: фильтр по текущим вопросам и поштучная проверка — тесты удалённого вопроса.
- T-11-10: `owner` → `not_found` без изменений — тест.
- T-11-11: `FOR UPDATE`, `test_attempts_session_id_uniq`, `(user_id, 'deadline:<sid>')` — тест пяти параллельных вызовов.
- T-11-12: `expectedDraft` по содержимому jsonb, повтор до 3 раз — тест `draft_changed`.
- T-11-13: функция вне транзакций, `scoreSubmission` вызывается до `submitAttempt`; параллельный тест не висит.
- T-11-58: ветка R3 — тест ошибки данных.
- T-11-59: D-21 — тест 25 ч / 23 ч.

## Файлы к коммиту

```
 M app/server/src/routes/tests/attempt-deadline.test.ts
 M app/server/src/routes/tests/public.ts
 M app/server/src/services/attempt-sessions/index.ts
 M app/server/src/services/attempt-sessions/sessions.ts
 M app/server/src/services/attempt-sessions/submit.ts
?? app/server/src/lib/db-errors.ts
?? app/server/src/services/attempt-sessions/deadline.ts
?? app/server/src/services/attempt-sessions/explanations.ts
```

Плюс этот SUMMARY. Коммитов нет (правило фазы: коммитит ведущая сессия). При слиянии с 11-05 в `attempt-sessions/index.ts` оба плана дописывают блоки реэкспорта в конец файла.

## Self-Check: PASSED

- Созданные файлы на месте: `deadline.ts`, `explanations.ts`, `lib/db-errors.ts`.
- Коммитов план не делает (`commits: 0` по правилу фазы, изменения в рабочем дереве worktree).
