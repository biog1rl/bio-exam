---
phase: 09-result-foundation-and-readers
plan: 12
subsystem: web-attempts-list
tags: [attempt-result-view, review-chip, review-filter, pending, admin-attempts]
requires: ["09-09", "09-11"]
provides:
  - "attemptResultView, AttemptResultFields, AttemptResultView: единственное решение «что показывать» для всех web-читателей"
  - "ReviewStatusChip, TeacherCheckedMark, AttemptReviewLine в components/tests/attempt-result/"
  - "Строка списка попыток проверяющего: pending без процента и вердикта, graded с отметкой «проверено учителем»"
  - "ReviewFilter, параметр review в адресе, AttemptsFilters и ключе SWR"
  - "Плитка ReviewTile «на проверке», средний «—», пустые состояния по review"
  - "parseAdminAttempts требует pendingTotal и reviewStatus из REVIEW_STATUSES у строк"
  - "TestAttemptSummary аддитивно: reviewStatus, autoEarnedPoints, autoTotalPoints"
affects: [09-13, 09-14, 09-15, 09-16, 09-17]
tech-stack:
  added: []
  patterns:
    - "Чистая функция «строка → вид» без React; читатели не проверяют scorePercentage == null сами"
key-files:
  created:
    - app/web/lib/tests/attempt-result-view.ts
    - app/web/lib/tests/attempt-result-view.test.ts
    - app/web/components/tests/attempt-result/ReviewStatusChip.tsx
    - app/web/components/tests/attempt-result/TeacherCheckedMark.tsx
    - app/web/components/tests/attempt-result/AttemptReviewLine.tsx
  modified:
    - app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx
    - app/web/app/(internal)/(protected)/admin/attempts/attempts-types.ts
    - app/web/lib/tests/admin-api.ts
    - app/web/lib/tests/admin-api.test.ts
    - app/web/lib/tests/attempts-url.ts
    - app/web/lib/tests/attempts-url.test.ts
    - app/web/lib/tests/types.ts
    - app/web/components/tests/TestRunner.tsx
    - app/web/lib/progress/my-attempts.test.ts
    - e2e/tests/attempts-list.spec.ts
decisions:
  - "Подпись «авто X из Y» в строке списка стоит отдельным слотом колонки результата по таблице UI-SPEC, поэтому AttemptReviewLine списком не используется; он готов для 09-13…09-16"
  - "Пустое состояние по review показывается, только когда других фильтров нет (статус студентов не 'active' тоже считается фильтром); иначе «Ничего не найдено» с новым текстом"
  - "Плитка «на проверке» не disabled, пока данных нет; disabled при pendingTotal === 0 и review !== 'pending'"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 0
plan_head_before: 7fed430fd755981295e5605741fbb36283e7b64e
plan_head_after: 7fed430fd755981295e5605741fbb36283e7b64e
---

# Phase 9 Plan 12: Вид результата, метки и список попыток проверяющего Summary

Один `attemptResultView` решает «pending или итог» для всех читателей, три общих компонента рисуют метки «На проверке» и «проверено учителем», список попыток админа и учителя показывает попытку на проверке без процента и вердикта, а фильтр «Проверка» (в адресе и ключе SWR) и плитка «на проверке» ведут к таким попыткам в одно действие. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия). `yarn verify: OK`.

## codegraph impact (до правок)

- `parseAdminAttempts`: 10 символов (`adminAttemptsFetcher`, `fetchAdminAttemptsPage`, страница попыток, `AdminAttemptsClient.loadMore`, тест).
- `attemptsKey`: 6 символов (`adminTestsKeys.attempts`, `fetchAdminAttemptsPage`, `loadMore`, тест).
- `parseAttemptsUrl`: 7 символов (страница попыток, `AdminAttemptsClient`, тест).
- `attemptsUrl`: 19 символов, включая `UserProfileAssignmentsPage` и `profile/[id]/page.tsx`: они вызывают `attemptsUrl` с `Partial<AttemptsUrlFilters>`, новое поле необязательное, их код не менялся.
- `AdminAttemptsClient`: 4 символа (только страница попыток).

## codegraph affected

Для файлов плана затронуты web-тесты `attempts-url.test.ts`, `admin-api.test.ts`, `attempt-result-view.test.ts`, `my-attempts.test.ts` и e2e-спеки (`attempts-list`, `review`, `teacher-zone`, `navigation`, `mobile-layout` и др., фикстуры `exam.ts`, `page-checks.ts`). Прогнаны: четыре web-теста, `yarn e2e tests/attempts-list.spec.ts` и весь `yarn verify`.

## Что сделано

- Task 1 (tracer): `attempt-result-view.ts` (pending при `reviewStatus === 'pending'` или при null в `scorePercentage`, `passed`, `earnedPoints`; `auto: null` при `autoTotalPoints === 0`; без `?? 0`, `clampPercent`, `Number(null)`), тест таблицей на шесть случаев; три компонента по разметке UI-SPEC; `AdminAttemptListItem` с nullable-полями результата и `reviewStatus`, `autoEarnedPoints`, `autoTotalPoints`; `TestAttemptSummary` аддитивно с тремя полями, литерал `setAttempts` в `TestRunner` и фикстура `summary()` в `my-attempts.test.ts` получили их; `AttemptRow` работает через `attemptResultView` (pending: `ReviewStatusChip` вместо плашки, `Clock3 size-4 text-muted-foreground`, «авто X из Y» с `text-balance`; graded: плашка, процент и `TeacherCheckedMark`); сетка строки `tab-sm:grid-cols-[minmax(0,1fr)_10.625rem_10.625rem_1.5rem]`.
- Task 2: `ReviewFilter` и поле `review` в `AttemptsUrlFilters` (читается `pending`/`graded`, иначе `all`; при `all` не пишется), в `AttemptsFilters` и `DEFAULT_ATTEMPTS_FILTERS`, в ключе попыток; `parseAdminAttempts` требует `pendingTotal` числом и `reviewStatus` строк из `REVIEW_STATUSES`; `Select` «Проверка» (имя `Проверка`, в триггере `Проверка: все` / `На проверке` / `Проверено`) в верхнем ряду `mb-3 flex flex-wrap items-center gap-2`; «Сбросить» сбрасывает `review`; сетка плиток `tab-sm:grid-cols-3 tab:grid-cols-5` и `ReviewTile` (`aria-pressed`, `Clock3 text-primary`, `border-primary bg-card` у нажатой); большая плитка среднего — «—» при `averageScore === null` и строка «без попыток на проверке» при `pendingTotal > 0`; пустые состояния по таблице UI-SPEC. `page.tsx` не менялся: `{ ...DEFAULT_ATTEMPTS_FILTERS, ...urlFilters }` уже несёт `review` в ключ первой загрузки.
- Task 3: e2e на моке (pending и graded в одном ответе; плитка нажимается и меняет адрес на `review=pending`, `Select` показывает «На проверке», повторное нажатие снимает фильтр; при `averageScore: null` средний «—»; `lowContrastTexts` без текстов меток; `horizontalOverflow` пуст) и на реальном сервере (адреса `review=pending`, `review=graded`, комбинация, «Сбросить», плитка `0 на проверке` disabled). Мок существующих тестов дополнен `pendingTotal` и полями строк. `yarn e2e tests/attempts-list.spec.ts`: 20 passed (desktop и mobile).

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/tests lib/progress`: зелёно (в списке `attempt-result-view`, `attempts-url`, `admin-api`, `my-attempts`).
- `yarn workspace @bio-exam/web typecheck`: чисто. `yarn workspace @bio-exam/web lint`: ошибок нет, предупреждения старые и в файлах плана не появились.
- `yarn e2e tests/attempts-list.spec.ts`: 20 passed.
- `yarn verify: OK` с первого полного прогона (до этого шаг `format-check` один раз упал на двух файлах плана и был исправлен `yarn exec oxfmt` по ним).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-12`: «09-12 changed only its files».
- Снимков экрана нет: Playwright-спек не сохраняет скриншоты; контраст и переполнение проверены по вычисленным стилям (`lowContrastTexts`, `horizontalOverflow`) на desktop и mobile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Фикстура `attemptRow` в `admin-api.test.ts` с `reviewStatus: string`**
- **Found during:** Task 2
- **Issue:** литерал `'none'` в фабрике фикстуры расширялся до `string`, и фикстура переставала подходить к `AdminAttemptsResponse`.
- **Fix:** `'none' as ReviewStatus`.
- **Files modified:** app/web/lib/tests/admin-api.test.ts

**2. [Рекомендация плана, не буква] `AttemptReviewLine` в списке попыток не используется**
- План требует метку «На проверке» из общего компонента и подпись «авто X из Y» в слотах колонок по таблице UI-SPEC («Строка попытки»): метка рядом с темой, подпись — в колонке результата. Это два разных слота, поэтому список берёт `ReviewStatusChip` и рисует мелкую подпись сам; `AttemptReviewLine` создан и готов для читателей 09-13…09-16. Копии разметки метки в списке нет.

Иных отклонений нет.

## Known Stubs

Нет.

## Threat Flags

Нет. T-09-36: процент и вердикт у pending не рисуются (единственное решение `attemptResultView`, nullable-типы строки, тест функции, e2e-мок проверяет отсутствие `%`, «Пройден», «Не пройден»). T-09-37: `parseAdminAttempts` отвергает тело без `pendingTotal`, с нечисловым средним и строки с неизвестным `reviewStatus` (тест таблицей).

## Замечания

- В фазе 9 graded = «проверено» (отметка «проверено учителем» и фильтр «Проверено») без различия оценки учителя и системного нуля; различие — с таблицей проверок в фазе 15.
- Тёмная тема не проверялась (допущение планировщика: недостижима, метки используют непрозрачные пары токенов).
- Колонка результата `10.625rem` и метки на 375 px проверены автоматически на отсутствие горизонтального переполнения (mobile-проект Playwright); визуальную обрезку «проверено учителем» глазами никто не смотрел (backstop из плана).

## Self-Check: PASSED
