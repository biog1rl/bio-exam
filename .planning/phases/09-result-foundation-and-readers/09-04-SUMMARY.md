---
phase: 09-result-foundation-and-readers
plan: 04
subsystem: exam-core
tags: [outcome, projection, answer-limits, open-question, exam-core]
requires: ["09-03"]
provides:
  - "computeAttemptOutcome, projectionOf, REVIEW_STATUSES и типы ReviewStatus, OutcomeFact, AttemptScore, AttemptOutcome, ComputeAttemptOutcomeInput, OutcomeProjection"
  - "SHORT_TEXT_MAX_LENGTH = 200, OPEN_TEXT_MAX_LENGTH = 5000, ANSWER_VIOLATION_REASONS, findAnswerViolation"
  - "SUBMIT_ERROR_CODES.answersInvalid, поля reason и limit в SubmitAttemptErrorSchema"
  - "Статус вопроса pending и параметр template у questionStatus; CARDS.pending в web"
affects: [09-05, 09-06, 09-07, 09-17]
tech-stack:
  added: []
  patterns: ["одна функция итога в exam-core, формула facts.ts:139-140 переехала побайтно", "чистая проверка ответов возвращает первую причину или null"]
key-files:
  created:
    - packages/exam-core/src/outcome.ts
    - packages/exam-core/src/outcome.test.ts
    - packages/exam-core/src/answer-limits.ts
    - packages/exam-core/src/answer-limits.test.ts
  modified:
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/attempt-result.test.ts
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
    - scripts/exam-core-no-private-copies.test.mjs
    - app/web/components/tests/runner-result-card.ts
    - app/web/components/tests/runner-result-card.test.ts
decisions:
  - "Оценка открытого проверяется только для открытых фактов: недопустимая оценка по чужому или не открытому questionId игнорируется, RangeError бросается только для открытого факта (сообщение содержит questionId)"
  - "final.earnedPoints для graded = autoEarnedPoints + сумма оценок открытых (в порядке фактов), а процент считается от totalPoints по всем фактам, включая 3 за каждый открытый"
  - "sequence_digits ограничен тем же пределом 200 и той же причиной short_text_too_long; значение не строка не даёт нарушения длины"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 32000
  tasks: 3
  commits: 0
plan_head_before: 1ff3aa5a2f80f7316d9b2f459c29600a40a94f06
plan_head_after: 1ff3aa5a2f80f7316d9b2f459c29600a40a94f06
---

# Phase 9 Plan 04: Ядро результата и входной проверки Summary

`computeAttemptOutcome` и `projectionOf` в `exam-core` повторяют формулу `facts.ts:139-140` и закрывают три состояния проверки (`none`, `pending`, `graded`); пределы 200/5000 и `findAnswerViolation` дают одну чистую проверку ответов; код `ANSWERS_INVALID`, статус вопроса `pending` и карточка «На проверке» известны пакету и web. `yarn verify: OK`. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия).

## Что сделано

- Task 1 (tracer): `outcome.ts` — внутренняя `scoreOf` с формулой `totalPoints > 0 ? (earned / total) * 100 : 0` и `passingScore == null ? true : percent >= Number(passingScore)`; суммы по фактам в порядке `for … of`. Путь `none`: `submitted` по всем фактам, `final` равен `submitted` без `totalPoints`. Экспорты в `index.ts`, `EXPECTED_EXPORTS` (75 -> 82: `ANSWER_VIOLATION_REASONS`, `OPEN_TEXT_MAX_LENGTH`, `REVIEW_STATUSES`, `SHORT_TEXT_MAX_LENGTH`, `computeAttemptOutcome`, `findAnswerViolation`, `projectionOf`). Сборка `dist` и `check-exam-core-dist` зелёные.
- Task 2: ветки `pending` и `graded`; `RangeError` для оценки вне `0..points` и не конечной; `questionStatus` принимает `template?`, для `'open'` возвращает `'pending'` первой веткой; `QuestionStatusSchema` — пять значений; `CARDS.pending` с классами `border-border/70 bg-secondary text-secondary-foreground`; тест неизвестного статуса на `'skipped'`, строка `pending -> На проверке`.
- Task 3: `answer-limits.ts`; `SUBMIT_ERROR_CODES.answersInvalid = 'ANSWERS_INVALID'`, `SubmitAttemptErrorSchema.error` — три кода, необязательные `reason` (enum `ANSWER_VIOLATION_REASONS`) и `limit` (положительное целое); группа `Phase 9 D-06, D-15` в `exam-core-no-private-copies.test.mjs`.

## Таблица состояний функции итога

| Состояние | Условие | submitted | autoEarned / autoTotal | final |
| --------- | ------- | --------- | ---------------------- | ----- |
| `none` | нет фактов с `template === 'open'` | все факты | = submitted | = submitted без totalPoints |
| `pending` | есть открытый факт без записи в `finalScores` | все факты, открытый 0 из 3 | по не-открытым | `null` |
| `graded` | все открытые оценены (системный 0 приходит как 0) | все факты | по не-открытым | autoEarned + оценки, процент от totalPoints, порог той же формулой |

Проекция: `pending` — три `null` (`finalEarnedPoints`, `finalScorePercentage`, `finalPassed`), `autoTotalPoints` всегда число. Таблица «проекция равна пересчёту» в `outcome.test.ts`: none, pending, graded, graded с системным 0, pending только из открытых.

## codegraph impact (до правок)

- `questionStatus` (10): `view.ts` (`buildQuestionView`, `buildAttemptView`), `view.test.ts`, `runner-result-card.test.ts`, `review-viewers.test.ts` (`viewFor`), `attempt-result.test.ts`, `index.ts`. Новый параметр необязателен, прежние вызовы не меняются.
- `QuestionStatusSchema` (5): `AttemptQuestionViewSchema`, `AttemptViewSchema` в `attempt-result.ts`, тест, `index.ts`. Исчерпывающее отображение по статусу — только `CARDS` в `runner-result-card.ts`; `typecheck` web зелёный.
- `SubmitAttemptErrorSchema` (3): только `attempt-result.ts`, тест, `index.ts`.
- `SUBMIT_ERROR_CODES` (10): `routes/tests/public.ts`, `routes/index.ts`, `attempt-submit-flow.ts`, три `lifecycle-*.test.ts`, тест пакета, `index.ts`. Новый код добавлен, прежние не менялись; применение `ANSWERS_INVALID` на сервере и в web — 09-07.
- `codegraph affected` по файлам плана: 41 тестовый и зависимый файл (`public.ts`, `view.test.ts`, `legacy.test.ts`, `TestRunner.tsx`, `attempt-lifecycle/*`, `attempt-review/*`, `question-validation.ts` и др.); все покрыты прогоном `yarn verify`.

## Проверки

- `yarn workspace @bio-exam/exam-core test`: 15 файлов, 706 тестов passed; `typecheck` пакета чист.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs`: `exam-core dist OK ... 82 экспортов в ESM и CJS`.
- `node --test scripts/exam-core-no-private-copies.test.mjs`: 5 pass, 0 fail.
- `yarn workspace @bio-exam/web vitest run components/tests/runner-result-card.test.ts`: 4 passed.
- `yarn verify`: все восемь шагов passed, `yarn verify: OK`.
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-04`: `09-04 changed only its files`.

## Deviations from Plan

Нет: план выполнен как написан. Коммиты не создавались по правилу пользователя (`commits: 0`, изменения в рабочем дереве, один коммит на план делает ведущая сессия).

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей. T-09-08 (одна функция итога, имя в списке приватных копий), T-09-09 (`RangeError`, строки таблицы), T-09-10 (константы и `findAnswerViolation`; применение — 09-07) закрыты на уровне пакета.

## Self-Check: PASSED

Файлы `outcome.ts`, `outcome.test.ts`, `answer-limits.ts`, `answer-limits.test.ts` созданы; сверка файлов плана и `yarn verify: OK` подтверждены.
