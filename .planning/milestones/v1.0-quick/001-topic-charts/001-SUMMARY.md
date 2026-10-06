---
phase: quick-001
plan: 01
subsystem: web/progress
status: complete
deferred_human_gate: true
tags: [charts, recharts, shadcn, dashboard, profile, e2e]
requires: []
provides:
  - app/web/lib/progress/attempt-chart.ts
  - app/web/lib/progress/my-attempts.ts
  - app/web/components/progress/AttemptBarChart.tsx
  - app/web/components/progress/StudentProgressSection.tsx
affects:
  - app/web/components/users/UserProfileAssignmentsPage.tsx
  - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
tech-stack:
  added: []
  patterns:
    - "shadcn Bar Chart: ChartContainer + BarChart accessibilityLayer + Cell по разделу + LabelList + ChartTooltipContent + ChartLegendContent"
    - "чистые функции графика и периода в lib/progress с Vitest без DOM"
key-files:
  created:
    - app/web/lib/progress/attempt-chart.ts
    - app/web/lib/progress/attempt-chart.test.ts
    - app/web/lib/progress/my-attempts.ts
    - app/web/lib/progress/my-attempts.test.ts
    - app/web/components/progress/AttemptBarChart.tsx
    - app/web/components/progress/StudentProgressSection.tsx
    - e2e/tests/attempt-chart.spec.ts
  modified:
    - app/web/components/users/UserProfileAssignmentsPage.tsx
    - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
    - app/web/styles/globals.css
decisions:
  - "Выбор дня не очищает from/to: снятие дня возвращает и пресет, и свой диапазон (решение исполнителя, автономно)"
  - "now для периода фиксируется при монтировании через useState(() => new Date()), чтобы не было impure-вызова при рендере"
metrics:
  duration: "~75 мин"
  completed: 2026-10-04
actuals:
  tokens: 16000
  tasks: 3
  commits: 0
plan_head_before: 1c78296
plan_head_after: 1c78296
---

# Quick 001 Plan 01: Графики прогресса Summary

Графики-области в профиле ученика заменены одним столбиковым графиком shadcn: попытка — столбик, высота — процент, цвет — раздел, название теста в столбике, по умолчанию «Месяц». Тот же график добавлен на дашборд ученика за последний месяц.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-charts`, ветка `gsd/charts` от `1c78296`.

## Что сделано

**Task 1 (tracer): одна попытка — один столбик в профиле у администратора**
- `attempt-chart.ts`: `ProgressAttempt`, `TopicColor`, `TOPIC_PALETTE`, `topicConfigKey` (slug из `[a-z0-9_-]` как есть, иначе `topic-x` + FNV-1a в base36, T-Q1-04), `assignTopicColors` (сортировка обычным сравнением строк), `buildTopicChartConfig`, `AttemptBarRow`, `buildAttemptBars` (день — местное время, промежуток `gap-<день>` между днями, подпись даты под средним столбиком дня, в режиме `day` — `HH:mm`), `barMinPointSize`, `chartMinWidth`.
- `AttemptBarChart.tsx` по композиции shadcn Bar Chart.
- `UserProfileAssignmentsPage.tsx`: тип `UserAttempt` заменён на `ProgressAttempt`, оба `AreaChart` заменены на `<AttemptBarChart>`, удалены `chartData`, `dayChartData`, `chartConfig`, импорты Area/AreaChart/Legend/ChartContainer/ChartTooltip и комментарии к удалённому коду.
- e2e: setup с двумя попытками `seq-d2` в отдельных контекстах и тест администратора.
- Проверка трассера: `yarn e2e --grep @progress` — 8 passed (4 setup + 4 теста) на chromium-desktop и chromium-mobile.

**Task 2: подписи, tooltip, легенда, период**
- `fitBarLabel`, `legendTopics`, `PeriodValue`, `PERIOD_PRESETS`, `DEFAULT_PERIOD = 'month'`, `parsePeriod`, `parseDayParam` (строго `yyyy-MM-dd`), `parseDateParam`, `resolvePeriodBounds`, `filterAttemptsByPeriod`.
- В `AttemptBarChart`: `LabelList` с рендером `text.attempt-bar-label` (обводка `var(--card)`, `paintOrder="stroke"`, вертикально через `rotate(-90)`), `ChartTooltip cursor={false}` с полным названием, датой, разделом, процентом и баллами (`filterNull` не трогался), `ChartLegend verticalAlign="top"` с payload из `legendTopics`, подписи осей «Правильно, %» и «Дата»/«Время», `margin`, `aria-describedby` на sr-only абзац рядом с `ChartContainer`.
- `globals.css`: `--color-chart-6…10` в `@theme`, `--chart-6…10` в `:root` и `[data-theme='dark']`.
- Профиль: `range` по умолчанию `DEFAULT_PERIOD`, при выборе «Месяц» параметр удаляется из URL; границы через `resolvePeriodBounds` + `filterAttemptsByPeriod`; пять пресетов из `PERIOD_PRESETS` в `ToggleGroup aria-label="Период"` с `flex-wrap justify-start`; подписи кнопок, заголовок дня и `selected` календаря только из `parseDateParam`/`parseDayParam` (T-Q1-01); точки в списке и в выборе тестов — цвет раздела; `CHART_COLORS` и `activeTestList` удалены.
- e2e администратора: подписи в столбиках (префикс названия `seq-d2`), легенда с `seed.topic.title`, «Месяц» `aria-checked="true"`, `range` в URL нет, «3 месяца» и «Полгода» видны, tooltip скрыт.

**Task 3: дашборд ученика**
- `my-attempts.ts`: `MY_ATTEMPTS_PAGE = 100`, `loadMyProgressAttempts(tests, fetchPage)` — страницы по 100, стоп на пустой странице или при `>= total`, ошибка не перехватывается.
- `StudentProgressSection.tsx`: тот же SWR-ключ `dashboard-public-tests`, попытки по ключу `['progress-my-attempts', ids]`, цвета от всех попыток, график за месяц; состояния загрузки, ошибки, «График появится после первой попытки.», «За последний месяц попыток нет.».
- `DashboardClient.tsx`: ровно 2 добавленные строки (импорт и `{canReadTests ? null : <StudentProgressSection />}` перед закомментированным блоком «Динамика результатов»), 0 удалённых; файл до и после проходит `oxfmt --check`.
- e2e: тест дашборда ученика.

## TDD (без коммитов, по правилу пользователя)

- Task 1 RED: `vitest run lib/progress` → `Test Files 1 failed`, модуль `./attempt-chart` не найден. GREEN: 15 passed.
- Task 2 RED: 16 failed (`fitBarLabel is not a function`, `legendTopics is not a function`, `parsePeriod is not a function` …). GREEN: 31 passed.
- Task 3 RED: `Cannot find module './my-attempts'`. GREEN: 36 passed (2 файла).

## Проверки

| Проверка | Результат |
|---|---|
| `yarn workspace @bio-exam/web vitest run lib/progress` | 2 files, 36 passed |
| `yarn workspace @bio-exam/web typecheck` | без ошибок |
| `bar composition ok` / `labels legend period ok` / `dashboard and e2e wired` | все три печатаются |
| `yarn e2e --grep @progress` после Task 3 | 12 passed, из них 2 временных visual-теста (файл удалён); в полном прогоне все 6 тестов `@progress` зелёные на обоих проектах |
| `yarn verify` | `yarn verify: OK` (web 370 тестов, server 423, exam-core 498, rbac 2) |
| `yarn e2e` полный | 128 passed, `failed` в сводке нет; два `✘` — ожидаемые `test.fail` `@known-defect` D1 (desktop и mobile) |

Перед первым `typecheck` в worktree понадобилась сборка `@bio-exam/rbac` и `@bio-exam/exam-core` (`dist` в .gitignore, отслеживаемые файлы не меняются).

Визуальная проверка исполнителем: временный spec `e2e/tests/zz-visual.spec.ts` снимал скриншоты профиля, tooltip, режима дня и дашборда на desktop и mobile; файл удалён, в рабочем дереве его нет. Битые параметры `?range=garbage&from=abc&to=zzz&day=2026-99-99` страницу не роняют, график показывается.

## codegraph

`codegraph impact UserProfileAssignmentsPage`: `UserProfileAssignmentsPage` → `app/web/app/(internal)/(protected)/profile/[id]/page.tsx` (`ProfileByIdPage`, маршрут `/profile/:id`).

`codegraph impact ChartContainer`: `chart.tsx` (`useChart`, `ChartLegendContent`, `ChartTooltipContent`), `UserProfileAssignmentsPage.tsx` → `profile/[id]/page.tsx`, `components/data-table.tsx` (`TableCellViewer`), `tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx` → `page.tsx`. `chart.tsx` не менялся.

`codegraph impact DashboardClient`: `dashboard/page.tsx` (`DashboardPage`, маршрут `/dashboard`).

`codegraph affected` по файлам плана: «No test files affected by the changed files» (индекс основного дерева, новых файлов worktree в нём нет; затронутые тесты — `attempt-chart.test.ts`, `my-attempts.test.ts`, `e2e/tests/attempt-chart.spec.ts`, все зелёные).

## Deviations from Plan

None по коду плана. Отличия в окружении:
- `root-pin.sh` не запускался: он пинит основное дерево, а код пишется в worktree; вместо него проверка `git rev-parse --show-toplevel` = путь `wt-charts`.
- gsd-tools (`roadmap.*`, `state.*`) не вызывались по правилам worktree: STATE и ROADMAP обновит оркестратор.
- Решение исполнителя (автономно): `handleDaySelect` больше не очищает `from`/`to`, чтобы снятие дня возвращало и свой диапазон, а не только пресет.
- `now` для периода в профиле и на дашборде берётся из `useState(() => new Date())`: убирает предупреждение oxlint `react(purity)` (в профиле оно было и до плана).

## Out of scope (не исправлялось)

- На мобильном (Pixel 7, 412px) колонка профиля шире экрана на 16px. Если скрыть сетку «Назначенные тесты / Назначить тест», ширина становится нормальной, а скрытие графика, пресетов, фильтров и списка ничего не меняет. Значит, причина в этой сетке, а не в графике. Колонка `/dashboard` на мобильном тоже шире экрана (567px), и это было до плана.
- Предупреждения oxlint `no-unused-vars` в `DashboardClient.tsx` (`adminStudentChartConfig`, `studentProgress`, `groupedTests`, `adminStudentScores`) были до плана. Файл общий с 04-12, поэтому не трогался.

## Допущения, которые клиент ещё должен подтвердить

1. Повторная попытка того же теста — отдельный столбик (подтверждено в задаче, см. plan_notes).
2. Попытки одного дня стоят рядом по времени, между днями — пустой промежуток, дата под средним столбиком дня.
3. Цвет раздела — по алфавиту slug среди разделов с попытками; новый раздел может сдвинуть цвета разделов после него.
4. Подпись: горизонтально при ширине столбика от 72px, иначе вертикально; обрезка «…»; при низком столбике — над ним; 0% рисуется высотой 3px.
5. «Месяц» — с начала того же числа месяц назад; настройка `chart-default-range` на этот график не влияет.
6. «Один день» — тот же график, под столбиками `HH:mm`.
7. Список попыток фильтруется поиском, разделом и тестами, но не периодом.
8. В профиле у администратора — только попытки по назначенным тестам.
9. Дашборд ученика: график за месяц без фильтров и без списка (Task 3 выполнен, требование «графики везде, где сейчас есть график» подтверждено).
10. Даты — по часовому поясу браузера.
11. Легенда — только разделы, у которых есть столбики в выбранном периоде.

При двух попытках столбики занимают всю ширину (shadcn без `maxBarSize`); если клиенту это покажется тяжёлым, ширину можно ограничить одним пропом `maxBarSize` у `Bar`.

## Deferred human verification

- Визуальная проверка на живых данных клиента: вертикальные подписи на длинных названиях, цвета разделов, вид в тёмной теме. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает пользователь или основная сессия по его просьбе. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Known Stubs

Нет.

## Threat Flags

Нет: новых маршрутов и изменений сервера нет; `git status` по `app/server`, `package.json`, `yarn.lock`, `components/providers`, `lib/session`, `proxy.ts`, `e2e/fixtures`, `session.spec.ts` пуст.

## Файлы к коммиту (от корня worktree)

- app/web/lib/progress/attempt-chart.ts
- app/web/lib/progress/attempt-chart.test.ts
- app/web/lib/progress/my-attempts.ts
- app/web/lib/progress/my-attempts.test.ts
- app/web/components/progress/AttemptBarChart.tsx
- app/web/components/progress/StudentProgressSection.tsx
- app/web/components/users/UserProfileAssignmentsPage.tsx
- app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
- app/web/styles/globals.css
- e2e/tests/attempt-chart.spec.ts

`git status --porcelain --untracked-files=all` в worktree показывает ровно эти 10 файлов.

## Self-Check: PASSED

Все 10 файлов существуют в worktree; коммитов нет по правилу пользователя (`commits: 0`, HEAD `1c78296` без изменений).
