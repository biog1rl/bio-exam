---
phase: 09-result-foundation-and-readers
plan: 07
subsystem: api
tags: [answer-limits, submit, draft, student-boundary, white-list]
requires: ["09-04", "09-06"]
provides:
  - "Входная проверка сдачи: findAnswerViolation в scoreSubmission, вариант answers_invalid, 422 ANSWERS_INVALID"
  - "Входная проверка черновика: SaveSessionDraftResult с { kind: 'invalid' }, 400 ANSWERS_INVALID"
  - "studentQuestionView — белый список полей вопроса для ученика"
affects: [09-11, 09-17]
tech-stack:
  added: []
  patterns: ["проверка ответов до транзакции, как scoreSubmission до submitAttempt", "сериализатор по белому списку без spread строки"]
key-files:
  created:
    - app/server/src/routes/tests/student-question-view.ts
    - app/server/src/routes/tests/student-question-payload.test.ts
  modified:
    - app/server/src/services/scored-attempt/facts.ts
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/attempt-submit.test.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
decisions:
  - "Нарушение при сдаче — 422, при черновике — 400: клиентская очередь повторяет всё, кроме 400/403/404"
  - "Вариант type_not_configured заменён answers_invalid с unknown_question_type; GET-списки при неизвестном типе остаются 500 (D-18)"
  - "Чтение вопроса и типов в saveSessionDraft стоит до db.transaction: getQuestionTypeMapForTest ходит в общий db и внутри транзакции занял бы второе соединение пула"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 28000
  tasks: 3
  commits: 0
plan_head_before: 9b7fdc8
plan_head_after: 9b7fdc8
---

# Phase 9 Plan 07: Граница ученика на сервере Summary

Сдача и черновик принимают ответы только на вопросы теста и тексты в пределах 200/5000 с понятным 4xx (422 на сдаче, 400 на черновике), неизвестный тип при сдаче даёт 422 вместо 500, а вопрос ученику собирается функцией `studentQuestionView` по белому списку полей с тестом точного набора ключей. `yarn verify: OK`. Изменения в рабочем дереве, не закоммичены (правило пользователя).

## Что сделано

- Task 1 (tracer): `scoreSubmission` после загрузки типов вызывает `findAnswerViolation`; цикл `type_not_configured` убран, вариант результата заменён на `{ ok: false; reason: 'answers_invalid'; violation }`. В `public.ts` сдача отвечает `422 { error: 'ANSWERS_INVALID', reason, limit? }` через `answersInvalidBody`; строка 500 «Question type is not configured» на сдаче удалена.
- Task 2: `saveSessionDraft` при переданных `questionId` и `value` до `db.transaction` читает вопрос теста и шаблон типа, вызывает `findAnswerViolation` для одного ответа; нарушение — `{ kind: 'invalid', violation }` без транзакции и записи. Маршрут черновика отвечает 400 с тем же телом. Повтор сданной попытки тем же клиентом возвращается раньше проверки (`precheckSubmit`), порядок прочих ответов не менялся.
- Task 3: `student-question-view.ts`; оба студенческих списка вопросов строят элементы через `studentQuestionView`; проверка неизвестного типа в GET (`throw`) осталась как была. Тест `student-question-payload.test.ts` засевает вопросы с эталоном и пояснением и сверяет точный набор ключей на обоих маршрутах.

## codegraph impact (до правок)

- `scoreSubmission` (5): `facts.ts`, `public.ts` (POST submit), `routes/index.ts`, `services/scored-attempt/index.ts`. Единственный вызывающий — маршрут сдачи.
- `saveSessionDraft` (5): `sessions.ts`, `public.ts` (PATCH answers), `routes/index.ts`, `services/attempt-sessions/index.ts`. Единственный вызывающий — маршрут черновика.
- `ScoreSubmissionResult` (5): `facts.ts`, `scoreSubmission`, `services/scored-attempt/index.ts`, `public.ts`. Потребитель варианта `type_not_configured` — только `public.ts`, заменён.
- `codegraph affected` по файлам плана: `public.ts`, `student-question-view.ts` (тесты определяются через их импорт; все серверные тесты покрыты `yarn verify`).

## Таблица случаев

| Случай | Маршрут | Статус | reason / limit |
| ------ | ------- | ------ | -------------- |
| Ответ на вопрос другого теста | submit | 422 | `foreign_question` |
| Краткий ответ 201 знак | submit | 422 | `short_text_too_long`, 200 |
| Краткий ответ 200 знаков | submit | 200 | - |
| Тип вопроса вне `question_types` | submit | 422 | `unknown_question_type` |
| Открытый ответ 5001 знак | submit | 422 | `open_text_too_long`, 5000 |
| Повтор сданной попытки с лишним ответом | submit | 200 (сохранённая попытка) | - |
| Чужой `questionId` | PATCH answers | 400 | `foreign_question` |
| Краткий ответ 201 знак | PATCH answers | 400 | `short_text_too_long`, 200 |
| 25 одновременных PATCH | PATCH answers | 200 все | - |

Строки `test_attempts` после отказов нет, сессия открыта, исправленная сдача проходит (проверено тестами).

## Проверки

- `attempt-submit.test.ts`, `attempt-time-limit.test.ts`, `attempt-races.test.ts`: 34 passed.
- `student-question-payload.test.ts`, `exam-flow.test.ts`: 76 passed.
- `node --test scripts/tests-router-composition.test.mjs scripts/attempt-integrity-guards.test.mjs`: 17 pass, 0 fail.
- `yarn verify`: `yarn verify: OK` (все восемь шагов passed).
- `yarn format:check`: чисто. `09-plan-files.cjs check 09-07`: `09-07 changed only its files`.
- Ссылка в acceptance: `status(400)` в `public.ts` 2 -> 3.

## Deviations from Plan

Нет: план выполнен как написан. Новых маршрутов нет, `route-inventory.txt` не менялся. Коммиты не создавались по правилу пользователя (`commits: 0`).

Замечание к тесту: в `student-question-payload.test.ts` маркер эталона — уникальная строка, а не «Митоз», потому что «Митоз» совпадает с текстом варианта ответа радио-вопроса в тестовом мире и давал бы ложное срабатывание поиска подстроки.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей. T-09-20, T-09-21, T-09-22, T-09-24 закрыты проверкой на сдаче и черновике, T-09-23 — `studentQuestionView` и тестом точного набора ключей.

## Self-Check: PASSED

Файлы `student-question-view.ts` и `student-question-payload.test.ts` созданы; `yarn verify: OK` и сверка файлов плана подтверждены.
