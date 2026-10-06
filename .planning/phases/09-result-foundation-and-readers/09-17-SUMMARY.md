---
phase: 09-result-foundation-and-readers
plan: 17
subsystem: exam-core-contract
tags: [attempt-view, nullable, superRefine, pending, behavioral-test, RES-01, RES-02, RES-03]
requires: ["09-13", "09-14", "09-15", "09-16"]
provides:
  - "AttemptViewSchema и AdminAttemptViewSchema: earnedPoints, scorePercentage, passed — number | null и boolean | null, superRefine: null ровно у reviewStatus 'pending'"
  - "TestAttemptSummary в web: nullable earnedPoints, scorePercentage, passed"
  - "attempt-readers-pending.test.ts: восемь читателей по N, P и G плюс настоящая сдача с открытым вопросом, повтор сдачи и проекция = пересчёт"
affects: [phase-14, phase-15]
tech-stack:
  added: []
  patterns:
    - "Базовая объектная схема + superRefine у обеих экспортируемых схем: extend идёт от базовой, а не от ZodEffects"
key-files:
  created: []
  modified:
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/attempt-result.test.ts
    - app/server/src/services/scored-attempt/view.test.ts
    - app/web/lib/tests/types.ts
    - app/server/src/routes/tests/attempt-readers-pending.test.ts
decisions:
  - "Настоящая сдача с открытым вопросом делается вторым учеником (rdp_student_two) на T2: в T2 прямым INSERT засеян вопрос type 'open', 3 балла, без ключа; фикстуры P и G первого ученика не затронуты, общие счётчики админского списка и дашборда в тесте обновлены (попыток 4, на проверке 2)"
  - "Ответ сдачи сверяется с readAttemptView для той же попытки (зритель student, showCorrectAnswer) - совпадение тела и чтения из базы"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 30000
  tasks: 2
  commits: 0
---

# Phase 9 Plan 17: Контракт number | null и поведенческий тест восьми читателей Summary

Результат попытки в схемах вида `exam-core` и в `TestAttemptSummary` стал `number | null`; схема отвергает вид, где null не совпадает с `reviewStatus 'pending'`; настоящая сдача с открытым вопросом проходит весь путь до ответа без процента, а один поведенческий тест проходит все восемь читателей. Изменения в рабочем дереве, не закоммичены (правило пользователя). `yarn verify: OK`.

## Что сделано

- **Task 1 (tracer):** в `attempt-result.ts` внутренняя `AttemptViewObjectSchema` с `.nullable()` у трёх полей; `AttemptViewSchema = base.superRefine(...)`, `AdminAttemptViewSchema = base.extend({...}).superRefine(...)` с той же проверкой; экспортируемые имена и типы прежние. В `attempt-result.test.ts` таблица из шести строк (pending с null принят, pending с процентом, баллами, вердиктом отвергнут, none с null отвергнут, graded с null процентом отвергнут) на обе схемы. В `view.test.ts` строка вида `pending` (null-итог, автобаллы, статус `pending` у открытого вопроса). `types.ts`: nullable-поля `TestAttemptSummary`. `buildAttemptView` уже передавал значения как есть (09-06), поэтому `view.ts` не менялся.
- **Task 2:** добавлены тесты разбора проверяющего (N, P, G) и ответа сдачи, настоящая сдача, повтор сдачи, проекция = пересчёт.

## codegraph impact (до правок)

- `AttemptViewSchema`: 6 символов (`AdminAttemptViewSchema`, `attempt-result.test.ts`, `view.ts`, `index.ts` exam-core, `read.ts`).
- `AdminAttemptViewSchema`: 4 символа (`attempt-result.test.ts`, `read.ts`, `index.ts`).
- `TestAttemptSummary`: 22 символа (`types.ts`, `DashboardClient`, `dashboard/page.tsx`, `TestLandingPageClient`, `TestRunner`, `my-attempts.test.ts` и др.).

## Места, найденные компилятором

Пусто. `yarn typecheck` после смены типов зелёный без правок читателей: пропусков предыдущих планов нет. Необязательные файлы плана (`TestRunner.tsx`, `TestLandingPageClient.tsx`, `DashboardClient.tsx`, `my-attempts.ts`, `AttemptReviewHero.tsx`) не менялись. Приведения `never`/`unknown` из 09-13 в `app/web/lib/progress/my-attempts.test.ts` не трогал: файла нет в `files_modified` плана.

## Таблица «читатель × N / P / G»

| Читатель | N (none, 100 %) | P (pending) | G (graded, 75 %) |
| -------- | --------------- | ----------- | ---------------- |
| Список попыток админа `admin/attempts` | 100 %, сдано | null-итог, автобаллы 1 из 1, фильтр review=pending | 75 %, сдано |
| Дашборд админа `admin/dashboard` | в числе попыток | в попытках, не в среднем и не в «пройдено», процент null | в среднем |
| Разбор проверяющего `admin/attempts/:id` | 100 % | null-итог, автобаллы 1 из 1, всего 4, у открытого вопроса статус pending | graded, 75 % |
| «Мои попытки» `attempts/me` | 100 % | null-итог | 75 % |
| chart-data | на графике | не на графике | на дате сдачи, 75 % |
| Профиль ученика `test-attempts` | 100 % | null-итог | 75 % |
| Глобальный поиск `scope=attempts` | заголовок с 100 % | без процента, подпись «На проверке» | заголовок с 75 % |
| Ответ сдачи `submit` | none, 100 % | R (настоящая сдача): pending, null, автобаллы 1 из 1, совпадает с `readAttemptView` | не применимо (graded появляется только после проверки) |

Настоящая сдача R: повтор тем же `clientAttemptId` возвращает тот же `attemptId`, у ученика остаётся одна строка, строка `test_attempts` не меняется целиком; сохранённая проекция равна `projectionOf(computeAttemptOutcome(readFacts, пустые оценки, passing_score))` (числа `real` через `Math.fround`).

## Проверки

- `yarn workspace @bio-exam/exam-core build` и тесты exam-core: 712 passed.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-readers-pending.test.ts src/services/scored-attempt/view.test.ts`: passed (11 тестов в поведенческом файле).
- Полный серверный набор: 92 файла, 1835 passed.
- `yarn typecheck`: 6 задач успешны, ошибок нет.
- `yarn verify: OK` (все восемь шагов passed).
- Acceptance: `grep -c "nullable()"` в `attempt-result.ts` = 19 (≥ 3); в поведенческом тесте есть `admin/attempts/`, `admin/dashboard`, `attempts/me`, `chart-data`, `test-attempts`, `scope=attempts`, `submit`, `readAttemptView`.
- `09-plan-files.cjs check 09-17`: вне плана ничего не менялось; код возврата 2 только из-за строки «not changed: app/server/src/services/scored-attempt/view.ts»: файл числится в `files_modified` без пометки optional, но правки не требует (`buildAttemptView` уже передаёт nullable-поля как есть, правок `view.ts` не нужно, косметически его не трогал). Строки «09-17 changed only its files» нет по этой причине.
- `codegraph affected` по файлам плана: тесты exam-core (`attempt-result`, `answer`, `review`, `scoring` и др.), web `attempt-lifecycle`, `attempt-review`, `runner-result-card`, `lib/tests/api.ts`; все покрыты `yarn verify`.

## Deviations from Plan

**1. [Rule 3 - Blocking/Scope] `view.ts` не менялся.** План перечислил `view.ts` в файлах, но `buildAttemptView` с 09-06 принимает nullable `AttemptSummary` и передаёт поля как есть; после смены схемы он работает без правок. Из-за этого сверка файлов возвращает «not changed» по одному файлу.

**2. Настоящая сдача на T2 вторым учеником.** План говорил «ученик сдаёт тест T2»; чтобы не менять данные фикстур P и G (список попыток первого ученика, профиль, поиск, график), сдача сделана вторым учеником. Следствие: счётчики админского списка (pendingTotal 2) и дашборда (totalAttempts 4, latestAttempts 4) и фильтр review=pending в существующих тестах обновлены.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: T-09-46 закрыт (`superRefine` и таблица тестов схемы), T-09-47 закрыт (nullable-типы: typecheck без находок, поведенческий тест восьми читателей).

## Файлы к коммиту

- `packages/exam-core/src/attempt-result.ts`
- `packages/exam-core/src/attempt-result.test.ts`
- `app/server/src/services/scored-attempt/view.test.ts`
- `app/web/lib/tests/types.ts`
- `app/server/src/routes/tests/attempt-readers-pending.test.ts`

## Self-Check: PASSED
