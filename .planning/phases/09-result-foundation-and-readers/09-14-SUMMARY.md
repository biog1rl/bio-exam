---
phase: 09-result-foundation-and-readers
plan: 14
subsystem: web-attempt-review
tags: [attempt-result-view, pending, attempt-review, teacher-checked-mark, nav-filter]
requires: ["09-06", "09-12"]
provides:
  - "AttemptReviewHero: шапка разбора через attemptResultView, ветки pending и graded, плитка «баллов автопроверки»"
  - "getStatusLabel, getStatusClass, getStatusDotClass: ветки pending"
  - "getQuestionPointsLabel: «до N балл.» у вопроса на проверке"
  - "navFiltersFor(results): пункт навигации «На проверке» последним, только при вопросе pending; NavFilter += 'pending'"
  - "AttemptReviewSummary: колонка «на проверке» и сетка tab-sm:grid-cols-4 только при счётчике больше нуля"
affects: [09-15, 09-16]
tech-stack:
  added: []
  patterns:
    - "Статус вопроса берётся из вида сервера; процент в шапке только из вида kind 'final'"
key-files:
  created: []
  modified:
    - app/web/components/tests/attempt-review/AttemptReviewHero.tsx
    - app/web/components/tests/attempt-review/AttemptQuestionsList.tsx
    - app/web/components/tests/attempt-review/AttemptReviewNav.tsx
    - app/web/components/tests/attempt-review/AttemptReviewSummary.tsx
    - app/web/components/tests/attempt-review/attempt-review-utils.ts
    - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
decisions:
  - "Подпись «до N балл.» вынесена в getQuestionPointsLabel в attempt-review-utils.ts и проверяется там же таблично; AttemptQuestionsList.test.ts (optional в плане) не менялся"
  - "В списке сводки у вопроса на проверке справа «до N» вместо «0/N» (по тому же правилу T-09-41)"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: 76846a97a7a9e3dd31eedf860632d0e1b485bde1
plan_head_after: 76846a97a7a9e3dd31eedf860632d0e1b485bde1
---

# Phase 9 Plan 14: Разбор попытки с «на проверке» Summary

Разбор попытки проверяющим читает результат через `attemptResultView`: у pending шапка показывает «На проверке», «авто X из Y» и пояснение без процента и вердикта, у graded итог плюс «проверено учителем», открытый вопрос на проверке везде нейтральный («На проверке», «до N балл.»), а навигация и сводка получают пункт и колонку «на проверке» только при наличии таких вопросов. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия), поэтому `commits: 0`.

## codegraph impact (до правок)

- `getStatusLabel` и `getStatusClass`: по 6 символов (`AttemptQuestionsList`, `AttemptReview`, тест утилит).
- `getStatusDotClass`: 5 символов (`AttemptReviewNav`, `AttemptReview`, тест).
- `NAV_FILTERS`: 5 символов (`AttemptReviewNav`, `AttemptReview`).
- `AttemptReviewHero`: 5 символов (`AttemptReview`, страница `admin/attempts/[id]/page.tsx`); пропсы не менялись.

## codegraph affected

Затронуты только файлы плана (шесть): `AttemptQuestionsList.tsx`, `AttemptReviewHero.tsx`, `AttemptReviewNav.tsx`, `AttemptReviewSummary.tsx`, `attempt-review-utils.ts`, `attempt-review-utils.test.ts`. Тестов вне каталога разбора граф не нашёл; дополнительно прогнан `yarn e2e tests/review.spec.ts`.

## Что сделано

- Task 1 (tracer): `AttemptReviewHero` берёт `attemptResultView(attempt)`. pending: `Clock3 size-7 text-secondary-foreground`, `font-serif text-4xl leading-none break-words` «На проверке», подпись «авто X из Y» (при `auto === null` строки нет), пояснение «Процент и итог появятся после проверки.»; final: прежние пиктограмма, процент и «порог пройден / не пройден» по `passed` вида, для graded `TeacherCheckedMark` в `mt-4` под подписью. Плитка баллов: «баллов» и `{earned}/{total}` у final, «баллов автопроверки» и `{autoEarned}/{autoTotal}` (при `auto === null` «—») у pending; «вопросов», «верно» (только `correct`), «время» не менялись.
- Task 2: ветки `pending` в `getStatusLabel` («На проверке»), `getStatusClass` (`border-border/70 bg-secondary text-secondary-foreground`), `getStatusDotClass` (`bg-muted-foreground/35`); `NavFilter` += `'pending'`; `navFiltersFor(results)` добавляет пункт «На проверке» последним, если среди видов есть `pending` (`NAV_FILTERS` остался источником четырёх прежних пунктов); `getQuestionPointsLabel`. Тест таблицами в `attempt-review-utils.test.ts`: подписи, класс, точка, «до 3 балл.» против «2 / 3 балл.», состав пунктов навигации с pending и без, фильтр `pending`.
- Task 3: `AttemptQuestionsList` показывает плашку баллов через `getQuestionPointsLabel`; `AttemptReviewNav` строит пункты через `navFiltersFor(results)`, фильтр `pending` показывает только вопросы на проверке; `AttemptReviewSummary` считает `pending`, четвёртая колонка «на проверке» и `tab-sm:grid-cols-4` только при счётчике больше нуля (иначе `tab-sm:grid-cols-3`), «верно» pending не включает.

## Проверки

- `yarn workspace @bio-exam/web typecheck`: чисто.
- `yarn workspace @bio-exam/web vitest run components/tests/attempt-review`: 3 файла, 62 теста passed.
- `node --test scripts/attempt-integrity-guards.test.mjs`: pass 13, fail 0.
- `yarn e2e tests/review.spec.ts`: 20 passed (desktop и mobile), шапка none не сломана.
- `yarn format:check`: чисто (oxfmt прогнан по файлам плана).
- `yarn verify: OK` с первого прогона.
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-14`: «09-14 changed only its files».
- Визуальной проверки pending-шапки в браузере и e2e на ней нет: готовых фикстур попытки pending в e2e разбора нет, открытый вопрос в раннере появится в фазах 10-15; поведение pending покрыто типами, утилитными тестами и видом `attemptResultView` (09-12).

## Deviations from Plan

None - plan executed exactly as written (кроме выбора места для `getQuestionPointsLabel`: функция лежит в `attempt-review-utils.ts`, и её тест там же, а не в `AttemptQuestionsList.test.ts`; файл теста списка оставлен без изменений, он помечен optional).

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: правки только в чтении вида сервера (T-09-41 и T-09-42 закрыты: «до N балл.», нейтральный pending, процент только из `kind 'final'`).

## Файлы к коммиту

- app/web/components/tests/attempt-review/AttemptReviewHero.tsx
- app/web/components/tests/attempt-review/AttemptQuestionsList.tsx
- app/web/components/tests/attempt-review/AttemptReviewNav.tsx
- app/web/components/tests/attempt-review/AttemptReviewSummary.tsx
- app/web/components/tests/attempt-review/attempt-review-utils.ts
- app/web/components/tests/attempt-review/attempt-review-utils.test.ts

## Self-Check: PASSED

Файлы плана на месте, `git status --short` показывает ровно эти шесть изменённых файлов (плюс чужой неотслеживаемый ADR-0006, не тронут).
