---
phase: 09-result-foundation-and-readers
plan: 02
subsystem: testing
tags: [characterization, attempts, readers, resubmit]
requires: ["09-01"]
provides:
  - "Характеризация восьми читателей результата для попыток без открытых вопросов"
  - "Закреплённая идемпотентность повторной сдачи (RES-01)"
affects: [09-05, 09-06, 09-07, 09-08]
tech-stack:
  added: []
  patterns: ["сравнение поле за полем с литералами сценария, без снимков тел ответов"]
key-files:
  created:
    - app/server/src/routes/tests/attempt-readers-none.characterization.test.ts
  modified: []
decisions:
  - "Дата для chart-data берётся из submittedAt ответа сдачи, а не из часов теста, чтобы тест не зависел от перехода через полночь"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 0
plan_head_before: 4d8f566f211f4f974f02e08e34417f2c4e99e8ac
---

# Phase 9 Plan 02: Характеризация читателей результата Summary

Один серверный интеграционный тест: три попытки создаются настоящей HTTP-сдачей, значения восьми читателей сверяются с литералами сценария поле за полем; повторная сдача с тем же `clientAttemptId` не создаёт строки и не меняет её.

## Что сделано

- Task 1 (tracer): сценарий в `beforeAll` на `startAuthApp('test_readers_none')`: тест A (radio + short_answer, порог 60), тест B (radio, порог NULL), три сдачи A1 100 %, A2 50 %, B1 0 %. Проверены ответ сдачи и список попыток админа (строки, `summary.passed = 2`, `summary.averageScore = 50`, `scopeTotal = 3`).
- Task 2: дашборд, разбор, «Мои попытки», chart-data, профиль, глобальный поиск, повторная сдача, граничные случаи формулы итога. 12 тестов.
- Код приложения не менялся. Комментариев в файле нет, `INSERT INTO test_attempts` нет, сравнения целых тел нет.

## Читатель -> поля -> ожидаемые значения

| Читатель | Поля | Ожидание |
| --- | --- | --- |
| Ответ сдачи `POST .../submit` | earnedPoints, totalPoints, scorePercentage, passed | A1 2/2/100/true; A2 1/2/50/false; B1 0/1/0/true |
| Список админа `GET /api/tests/admin/attempts` | те же поля по строке; summary.passed, summary.averageScore, scopeTotal | как выше; 2; 50; 3 |
| Дашборд `GET /api/tests/admin/dashboard` | summary.totalAttempts/passedAttempts/averageScore; latestAttempts scorePercentage, passed; dailyActivity | 3; 2; 50; по попыткам; одна запись, attempts 3, averageScore 50 |
| Разбор `GET /api/tests/admin/attempts/:id` (A2) | attempt.earnedPoints/totalPoints/scorePercentage/passed/attemptId | 1/2/50/false |
| «Мои попытки» `GET .../tests/:A/attempts/me` | total; rows по id | 2; A1 и A2 как выше |
| chart-data `GET .../tests/:A/chart-data` | data[].date/maxScore/minScore/count | день сдачи; 100; 50; 2 |
| Профиль `GET /api/users/:id/test-attempts` | attempts по attemptId | три попытки как выше |
| Поиск `GET /api/search?scope=attempts` | title, subtitle; поиск `q=50` | `Тест rdn-a · 100%` и `· 50%`; «Сдано» / «Не сдано»; A2 найдена по проценту |
| Повторная сдача | attemptId, число строк, строка A2 (answers, results, earned_points, total_points, score_percentage, passed) | тот же attemptId; 3; `JSON.stringify` строки до и после равен |

## codegraph affected

`codegraph affected app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` -> `app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` (1 файл). `codegraph impact` не требовался: существующие символы не менялись.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-readers-none.characterization.test.ts`: 12 passed.
- `yarn verify`: `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests passed).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-02`: `09-02 changed only its files`.
- `git diff --stat -- app/server/src` без нового файла: пусто.

## Deviations from Plan

None - plan executed exactly as written. Уточнение без смены цели: дата для chart-data берётся из `submittedAt` ответа первой сдачи (`slice(0, 10)`, как группирует маршрут), а не из часов теста.

## Known Stubs

Нет.

## Threat Flags

Нет.

## Файлы к коммиту

- `app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` (новый)

Предлагаемое сообщение коммита: `test: Характеризация восьми читателей результата для попыток без открытых вопросов и повторной сдачи с тем же clientAttemptId`

## Self-Check: PASSED
