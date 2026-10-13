---
phase: 09-result-foundation-and-readers
plan: 11
subsystem: web-attempt-runner
tags: [answers-invalid, submit-failure, attempt-lifecycle, banner, maxLength]
requires: ["09-04", "09-06"]
provides:
  - "AttemptRequestError(status, code, attemptId, reason = null, limit = null); readAttemptErrorBody разбирает тело через SubmitAttemptErrorSchema"
  - "SubmitFailure += answers-invalid { reason, limit }; classifySubmitFailure: 422 ANSWERS_INVALID с известной причиной после 404 и до retry"
  - "answersInvalidBanner(rejection) и тип SubmitRejection в attempt-submit-flow.ts"
  - "AttemptSnapshot.submitRejection; applySubmitFailure не блокирует и не повторяет сдачу после answers-invalid"
  - "maxLength={SHORT_TEXT_MAX_LENGTH} у поля short_text"
affects: [09-13, phase-14]
tech-stack:
  added: []
  patterns:
    - "Тексты отказов принадлежат web и берут числа из констант exam-core через Intl.NumberFormat('ru-RU')"
key-files:
  created: []
  modified:
    - app/web/lib/tests/api.ts
    - app/web/components/tests/attempt-submit-flow.ts
    - app/web/components/tests/attempt-submit-flow.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/TestRunner.tsx
    - app/web/components/tests/QuestionInput.tsx
decisions:
  - "Неизвестная причина или тело вне SubmitAttemptErrorSchema дают reason null и прежний общий retry (T-09-34)"
  - "submitRejection сбрасывается при следующей сдаче, при новом ответе, в init и reset; автосдача после отказа не повторяется, потому что autoFired остаётся взведённым"
  - "maxLength только у short_text; sequence_digits не менялся (по плану)"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: d61d1a5
plan_head_after: d61d1a5
---

# Phase 9 Plan 11: Отказ сдачи ANSWERS_INVALID и предел краткого ответа в web Summary

Ответ 422 `ANSWERS_INVALID` классифицируется как отдельный отказ с причиной, баннер `TestRunner` показывает текст по причине (из констант `exam-core`), модуль попытки возвращается в `active` без блокировки и автоповтора, поле краткого ответа получило `maxLength`. `yarn verify: OK`. Изменения в рабочем дереве, не закоммичены (правило пользователя).

## codegraph impact (до правок)

- `classifySubmitFailure` (6): `sendSubmit`, `resubmit`, `runSubmit` в `lifecycle.ts`, `attempt-submit-flow.test.ts`.
- `AttemptRequestError` (20): `fetchAttemptJson`, `startTestSession`, `submitPublicTestAnswers`, `requestError` в `testing.ts`, `attempt-submit-flow.ts`, тест классификатора. Единственный `new AttemptRequestError` в коде — `fetchAttemptJson`; новые параметры с умолчанием `null`, остальные вызовы (тесты) не менялись.
- `applySubmitFailure` (4): `sendSubmit`, `resubmit`, `runSubmit`.
- `bannerFor` (4): `AttemptRunner` и `TestRunner` в `TestRunner.tsx`.

## Что сделано

- Task 1 (tracer): `api.ts` отдаёт `reason`/`limit`; `classifySubmitFailure` распознаёт `answers-invalid`; `applySubmitFailure` для него заполняет `submitRejection`, снимает `frozen` при автосдаче, вызывает `enterActive(false)` и возвращает `settled` (ключи хранилища и черновик не трогаются, `submitFailed` остаётся `false`); `TestRunner` выбирает `answersInvalidBanner(snapshot.submitRejection)` до прежнего выбора; `requestError` в `testing.ts` принимает `extra`.
- Task 2: тексты по четырём причинам в `ANSWERS_INVALID_BANNERS` (числа 200 и 5 000 через `Intl.NumberFormat('ru-RU')` от констант), таблицы тестов классификатора и баннеров, характеризация модуля попытки.
- Task 3: `maxLength={template === 'short_text' ? SHORT_TEXT_MAX_LENGTH : undefined}` в `QuestionInput.tsx`.

## Тексты баннера

| Причина | Текст | Действие |
| ------- | ----- | -------- |
| `short_text_too_long` | Краткий ответ не может быть длиннее 200 знаков. Сократите ответ и отправьте снова. | нет |
| `open_text_too_long` | Текст ответа не может быть длиннее 5 000 знаков (неразрывный пробел). Сократите ответ и отправьте снова. | нет |
| `foreign_question` | В ответах есть вопрос, которого нет в этом тесте. Обновите страницу: тест мог измениться. | reload |
| `unknown_question_type` | Один из вопросов больше не поддерживается в этой версии страницы. Обновите страницу. | reload |

## Тесты

- `attempt-submit-flow.test.ts`: 422 ANSWERS_INVALID с каждой из четырёх причин даёт `answers-invalid`; без причины, с неизвестной причиной и при статусе 400 — `retry`; тексты и действия построены из тех же констант; литерал `5 000` в явной проверке.
- `lifecycle-submit.test.ts` (закрывает unresolved-пункт UI-SPEC): таблица по четырём причинам (снимок: `active`, `blockReason` пуст, `submitFailed false`, `submitRejection` заполнен, ввод включён, ключи `session/wal/clientAttemptId` на месте, повторная сдача вызывает API и завершается `submitted`); новый ответ снимает отказ; автосдача с 422 не повторяется сама (один вызов `submit` после продвижения таймеров), `frozen` удалён; перезагрузка с чужим id в локальной копии: сдача уходит с тем же `clientAttemptId` без этого id и завершается `submitted`. Существующие тесты 409, `TIME_EXPIRED`, 403, 404, 400/500/сеть не менялись и зелёные.

## Проверки

- `yarn workspace @bio-exam/exam-core build` и `yarn workspace @bio-exam/web vitest run components/tests`: 13 файлов, 246 тестов passed.
- `yarn workspace @bio-exam/web typecheck`: чисто (предварительно удалён устаревший `app/web/.next/types`, под `.gitignore`).
- `node --test scripts/attempt-integrity-guards.test.mjs`: 13 pass, 0 fail.
- `yarn e2e tests/take-test.spec.ts tests/submit-retry.spec.ts`: 14 passed (setup и оба проекта, desktop и mobile), без failed и flaky.
- `yarn verify`: все восемь шагов passed, `yarn verify: OK` (с первого прогона).
- `yarn format:check`: чисто (файлы плана предварительно прогнаны через `yarn exec oxfmt`).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-11`: `09-11 changed only its files`.
- Приёмка: `grep -c "answers-invalid" attempt-submit-flow.ts` = 2; `Intl.NumberFormat` = 1; `5 000|5000` = 0; `SHORT_TEXT_MAX_LENGTH` в `QuestionInput.tsx` = 2.

## codegraph affected

По файлам плана затронуты только они сами (6 исходных файлов); web-тесты `components/tests`, охрана целостности, e2e сдачи и `yarn verify` зелёные.

## Deviations from Plan

Нет: план выполнен как написан. Уточнение: тексты всех четырёх причин и ветка классификатора сделаны уже в Task 1 (единый словарь), Task 2 добавил таблицы тестов и характеризацию без изменения кода.

Принятое ограничение (backstop, D-08): вставка в краткий ответ текста длиннее 200 знаков обрезается браузером без сообщения.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей сверх `<threat_model>`. T-09-33 (нет автоповтора на answers-invalid, тест автосдачи), T-09-34 (тексты в web по `reason`, неизвестная причина даёт общий retry), T-09-35 (ключи хранилища и ответы не очищаются, тесты) закрыты.

## Файлы к коммиту

```
 M app/web/components/tests/QuestionInput.tsx
 M app/web/components/tests/TestRunner.tsx
 M app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
 M app/web/components/tests/attempt-lifecycle/lifecycle.ts
 M app/web/components/tests/attempt-lifecycle/testing.ts
 M app/web/components/tests/attempt-submit-flow.test.ts
 M app/web/components/tests/attempt-submit-flow.ts
 M app/web/lib/tests/api.ts
```

`docs/adr/0006-enforce-authorization-by-construction.md` принадлежит другой сессии и в коммит не входит.

## Self-Check: PASSED

Файлы изменены, `yarn verify: OK`, e2e сдачи зелёные, сверка файлов плана пройдена.
