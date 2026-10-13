---
phase: 09-result-foundation-and-readers
plan: 15
subsystem: web-user-profile
tags: [attempt-result-view, review-chip, user-profile, chart, pending]
requires: ["09-12", "09-10"]
provides:
  - "UserAttemptRow: строка попытки профиля с nullable-результатом, reviewStatus и авто-баллами"
  - "userAttemptToProgress: строка профиля в ProgressAttempt или null для попытки на проверке"
  - "Список попыток профиля через attemptResultView: ReviewStatusChip у pending, TeacherCheckedMark у graded"
  - "График профиля (range и day) только из попыток с итогом"
affects: [09-16, 09-17]
tech-stack:
  added: []
  patterns:
    - "Список читает все строки через attemptResultView, график получает только kind final"
key-files:
  created: []
  modified:
    - app/web/lib/users/api.ts
    - app/web/components/users/UserProfileAssignmentsPage.tsx
decisions:
  - "Преобразование строки профиля в ProgressAttempt лежит в lib/users/api.ts (userAttemptToProgress), по образцу toProgressAttempt из my-attempts.ts"
  - "Раскраска тем и фильтры темы и теста берут все строки; график и пустое состояние периода считаются по chartAttempts"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 12000
  tasks: 2
  commits: 0
plan_head_before: c69c886b42e510da8cc73e9efa3387d588231245
plan_head_after: c69c886b42e510da8cc73e9efa3387d588231245
---

# Phase 9 Plan 15: Профиль ученика с попыткой на проверке Summary

Список попыток профиля показывает у попытки на проверке метку «На проверке» и «{дата} · авто X из Y» (при `auto === null` только дата) без процента и вердикта, у graded добавляет «проверено учителем», а столбчатый график профиля строится только из попыток с итогом. Изменения в рабочем дереве, не закоммичены (правило пользователя). `yarn verify: OK`.

## codegraph impact (до правок)

- `parseUserAttempts`: 5 символов (`userAttemptsFetcher`, `api.test.ts`, `UserProfileAssignmentsPage`).
- `UserAttemptsResponse`: 5 символов (`parseUserAttempts`, `userAttemptsFetcher`, `api.test.ts`).
- `UserProfileAssignmentsPage`: 4 символа (только `ProfileByIdPage` и маршрут `/profile/:id`).

## codegraph affected

Для файлов плана: `lib/users/api.test.ts` (прогнан: 8 файлов, 77 тестов passed), а также `useTestEditorModel.ts` и `ScoringSettingsPageClient.tsx` (по графу, не связаны с результатом плана). Из e2e прогнаны `attempt-chart.spec.ts` и `user-lookup.spec.ts`.

## Что сделано

- Task 1 (tracer): `UserAttemptRow = AttemptResultFields & {attemptId, testId, testTitle, testSlug, topicSlug, topicTitle, submittedAt}`, `UserAttemptsResponse.attempts: UserAttemptRow[]`; `parseUserAttempts` по-прежнему проверяет только конверт (форма строк по контракту сервера 09-10, как и раньше). Список: вторая строка по `view.kind`, плашка справа `ReviewStatusChip` у pending, `Badge` и `TeacherCheckedMark` у graded.
- Task 2: `userAttemptToProgress` (pending даёт `null`); в странице `chartAttempts` строится из `periodAttempts`, им питаются оба режима `AttemptBarChart` и условия «Нет данных за выбранный период» и «Нет попыток за выбранный день». Список ниже по-прежнему строится из `filteredAttempts` без фильтра по виду.
- `api.test.ts` не менялся: проверяет только конверт и ключи, форму строк не проверяет. Новых юнит-тестов нет (гигиена).

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/users`: 8 файлов, 77 passed.
- `yarn workspace @bio-exam/web typecheck`: чисто. `lint`: ошибок нет, предупреждения старые (в `UserProfileAssignmentsPage` и `lib/users/api.ts` новых нет).
- `yarn e2e tests/attempt-chart.spec.ts tests/user-lookup.spec.ts`: 18 passed (desktop и mobile, без flaky).
- `yarn verify: OK` с первого прогона.
- `09-plan-files.cjs check 09-15`: «09-15 changed only its files».
- `grep "Math.round(attempt.scorePercentage)"` в странице: 0; `attemptResultView` в странице: есть.

## Deviations from Plan

None - plan executed exactly as written. Единственный нюанс: e2e плана прогоняют существующие сценарии профиля и графика с реальным сервером, где попыток на проверке нет, поэтому ветки pending и graded профиля автоматически проверены только типами (`typecheck`) и общими компонентами 09-12 (`attemptResultView` покрыт тестом таблицей). Отдельный e2e-мок профиля с pending не добавлялся: файл спеки вне `files_modified` плана.

## Known Stubs

Нет.

## Threat Flags

Нет. T-09-43: процент и вердикт попытки на проверке в списке профиля и на графике не рисуются (список через `attemptResultView`, график только из `kind === 'final'`).

## Файлы к коммиту

- app/web/lib/users/api.ts
- app/web/components/users/UserProfileAssignmentsPage.tsx

## Self-Check: PASSED
