---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 01
subsystem: api
tags: [exam-core, zod, contract, serverNow, upload-window]
requires: []
provides:
  - serverNow в ответе POST /api/tests/public/tests/:id/start
  - необязательные поля uploadClosesAt и submitSource у вида попытки
  - расширенное тело 409 серверной финализации в SubmitAttemptErrorSchema
  - SessionFateSchema (open | submitted | expired)
  - коды, статус отказа и пределы окна фото в exam-core
affects: [11-02, 11-03, 11-04, 11-05, 11-06, 11-07, 11-10, 11-11, 11-12]
actuals:
  tokens: 4500
  tasks: 3
  commits: 0
tech-stack:
  added: []
  patterns: [все новые поля контракта необязательные, серверное время читается clock_timestamp() в транзакции старта]
key-files:
  created:
    - packages/exam-core/src/upload-window.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
  modified:
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/attempt-session.ts
    - packages/exam-core/src/index.ts
    - packages/exam-core/src/attempt-result.test.ts
    - packages/exam-core/src/attempt-session.test.ts
    - scripts/check-exam-core-dist.mjs
    - app/server/src/services/attempt-sessions/sessions.ts
key-decisions:
  - "serverNow — поле тела ответа, не заголовок; в виде попытки /submit 200 его нет (идемпотентный повтор отдаёт то же тело), клиент берёт время из /start, тела 409 и судьбы сессии"
  - "Отказ фото — статус 422 для обоих кодов UPLOAD_WINDOW_CLOSED и UPLOAD_WINDOW_NONE; 409 занят повтором сдачи"
  - "submittedAt попытки серверной финализации — конец таймера (started_at + time_limit_minutes), реализует 11-04"
  - "serverNow в startAttemptSession читается отдельным SELECT clock_timestamp() в конце транзакции для всех трёх путей возврата"
status: complete
---

# Phase 11 Plan 01: контракт exam-core и serverNow у /start Summary

Контракт фазы 11 объявлен в exam-core целиком необязательными полями, а `POST /start` уже отдаёт `serverNow` — время базы через `clock_timestamp()`.

## Что сделано

- Task 1 (tracer): `AttemptSessionSchema.serverNow` (необязательное); в `sessions.ts` добавлен `readServerNow(tx)` (`SELECT clock_timestamp()`), `toSessionInfo(row, serverNow)` вызывается на всех трёх путях `startAttemptSession` (открытая, вставленная, найденная после конфликта). Новый `attempt-deadline.test.ts`: `/start` и повторный `/start` несут ISO-время, отличающееся от `clock_timestamp()` базы не больше чем на 5 с, тело проходит `AttemptSessionSchema.safeParse`.
- Task 2: `ATTEMPT_SUBMIT_SOURCES` и тип `AttemptSubmitSource`; `uploadClosesAt` и `submitSource` в `AttemptViewObjectSchema`; `SubmitAttemptErrorSchema` перенесён ниже `AttemptViewSchema` и получил необязательные `submitSource`, `uploadClosesAt`, `serverNow`, `attempt`; `SessionFateSchema` и тип `SessionFate`; новый `upload-window.ts`; экспорт в `index.ts`; семь имён в `EXPECTED_EXPORTS`. Табличные тесты в `attempt-result.test.ts` и `attempt-session.test.ts` (отказ фото проверяется рядом с судьбой сессии).
- Task 3: typecheck сервера и web, полный серверный набор, `yarn verify`, сверка файлов плана.

## Новые рантайм-экспорты

`ATTEMPT_SUBMIT_SOURCES`, `SessionFateSchema`, `UPLOAD_WINDOW_ERROR_CODES`, `UPLOAD_WINDOW_REFUSAL_STATUS`, `PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES`, `PHOTO_UPLOAD_WINDOW_MAX_MINUTES`, `UploadWindowRefusalSchema`. Типы: `AttemptSubmitSource`, `SessionFate`, `UploadWindowErrorCode`, `UploadWindowRefusal`.

## Проверки

- `yarn workspace @bio-exam/exam-core test`: 15 файлов, 745 тестов зелёные.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs`: `exam-core dist OK`, 89 экспортов в ESM и CJS.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test`: 100 файлов, 1930 тестов зелёные (до плана 99 файлов, 1929 тестов; добавлен один файл с одним тестом).
- typecheck `@bio-exam/server` и `@bio-exam/web`: без ошибок.
- `yarn verify`: `yarn verify: OK`.
- `11-plan-files.cjs check 11-01`: `11-01 changed only its files`.

## codegraph

- `codegraph impact startAttemptSession`: POST /api/tests/public/tests/:id/start (`routes/tests/public.ts`), `scripts/e2e-seed.ts` (`main`), `services/attempt-sessions/index.ts`; сигнатура не менялась, добавлено только поле результата.
- `codegraph impact SubmitAttemptErrorSchema`: `attempt-result.test.ts`, `routes/tests/attempt-submit.test.ts`, `app/web/lib/tests/api.ts`, `index.ts`; поля необязательные, вызывающие компилируются.
- `codegraph affected` по файлам плана: 48 тестовых и зависимых файлов (серверные тесты попытки, `scored-attempt`, web `attempt-lifecycle`, `attempt-review`); весь серверный набор и `yarn verify` прогнаны целиком.

## Deviations from Plan

None - plan executed exactly as written. Пояснение к `actuals.commits: 0`: по правилам фазы 11 исполнитель не коммитит, изменения оставлены в рабочем дереве для ведущей сессии. `serverNow` читается отдельным запросом, а не выражением в выборках (допустимый вариант задачи 1, один способ для всех трёх путей).

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: схемы и необязательное поле ответа, T-11-01 закрыт тестом (`deadline:<uuid>` отклоняется `SubmitAttemptRequestSchema`), T-11-02 — `attempt` типизирован `AttemptViewSchema`, T-11-03 — все новые поля `.optional()`.

## Файлы к коммиту

- `/Users/kdvornichenko/bio-exam/packages/exam-core/src/attempt-result.ts`, `attempt-session.ts`, `upload-window.ts` (новый), `index.ts`, `attempt-result.test.ts`, `attempt-session.test.ts`
- `/Users/kdvornichenko/bio-exam/scripts/check-exam-core-dist.mjs`
- `/Users/kdvornichenko/bio-exam/app/server/src/services/attempt-sessions/sessions.ts`
- `/Users/kdvornichenko/bio-exam/app/server/src/routes/tests/attempt-deadline.test.ts` (новый)

## Self-Check: PASSED
