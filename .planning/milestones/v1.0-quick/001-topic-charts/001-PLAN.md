---
phase: quick-001
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
autonomous: true
requirements: []

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "В профиле ученика у администратора (/profile/<login>, карточка «динамика / Пройденные тесты») один график: каждая попытка в выбранном периоде — отдельный столбик, видимый без наведения; ось Y — процент правильно выполненного 0–100%, ось X — дата попытки; несколько попыток одного дня стоят рядом по времени, между днями пустой промежуток в один столбик"
    - "Цвет столбика задаёт раздел (тема), а не тест: ключ конфигурации раздела — topicConfigKey(slug) из [a-z0-9_-], цвет — var(--chart-N) по алфавитному порядку slug среди всех разделов ученика (до фильтров), палитра --chart-1…--chart-10 по кругу; легенда ChartLegend/ChartLegendContent показывает разделы, у которых есть столбики"
    - "Название теста написано в столбике через LabelList: горизонтально, если столбик шире 72px, иначе вертикально; не влезает — обрезано многоточием; не помещается внутри (низкий процент) — над столбиком; ChartTooltipContent показывает полное название, раздел, дату и процент"
    - "Период по умолчанию «Месяц» (URL без range); пресеты Неделя, Месяц, 3 месяца, Полгода, Всё время, кнопки «Свой диапазон» и «Один день»; поиск по тесту, выбор раздела, выбор тестов и список попыток под графиком работают как раньше"
    - "Композиция shadcn Bar Chart в AttemptBarChart.tsx: ChartContainer config={chartConfig}, BarChart accessibilityLayer, CartesianGrid vertical={false}, XAxis tickLine={false} axisLine={false} tickMargin={10} с tickFormatter даты, ChartTooltip content={<ChartTooltipContent …/>}, Bar dataKey=\"percent\" radius={4}, Cell fill={`var(--color-${key})`}, LabelList, ChartLegend + ChartLegendContent; у графика role=\"figure\" и aria-label, у осей подписи"
    - "На дашборде ученика (/dashboard, роль без tests.read) раздел «Пройденные тесты» с тем же графиком за последний месяц; данные — свои попытки по назначенным тестам без изменений на сервере"
    - "Битые параметры URL (range, from, to, day) не роняют страницу: неизвестный range — «Месяц», невалидные даты игнорируются"
  artifacts:
    - path: "app/web/lib/progress/attempt-chart.ts"
      provides: "ProgressAttempt, topicConfigKey, assignTopicColors, buildTopicChartConfig, buildAttemptBars, fitBarLabel, legendTopics, PERIOD_PRESETS, DEFAULT_PERIOD, parsePeriod, parseDayParam, parseDateParam, resolvePeriodBounds, filterAttemptsByPeriod"
      contains: "buildAttemptBars"
    - path: "app/web/lib/progress/attempt-chart.test.ts"
      provides: "Vitest чистых функций: строки столбиков, цвета разделов, подписи, период"
      contains: "assignTopicColors"
    - path: "app/web/components/progress/AttemptBarChart.tsx"
      provides: "Столбиковый график попыток по композиции shadcn"
      contains: "accessibilityLayer"
    - path: "app/web/lib/progress/my-attempts.ts"
      provides: "loadMyProgressAttempts: все свои попытки по назначенным тестам с разделом"
      contains: "loadMyProgressAttempts"
    - path: "app/web/components/progress/StudentProgressSection.tsx"
      provides: "Раздел дашборда ученика «Пройденные тесты»"
      contains: "AttemptBarChart"
    - path: "e2e/tests/attempt-chart.spec.ts"
      provides: "e2e: столбики и подписи видны без наведения, период по умолчанию — месяц"
      contains: "@progress"
  key_links:
    - from: "app/web/components/users/UserProfileAssignmentsPage.tsx"
      to: "app/web/components/progress/AttemptBarChart.tsx"
      via: "<AttemptBarChart attempts=… colors=… mode=…> вместо графиков-областей в обоих режимах"
      pattern: "AttemptBarChart"
    - from: "app/web/components/progress/AttemptBarChart.tsx"
      to: "app/web/lib/progress/attempt-chart.ts"
      via: "buildAttemptBars, buildTopicChartConfig, fitBarLabel, legendTopics"
      pattern: "buildAttemptBars"
    - from: "app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx"
      to: "app/web/components/progress/StudentProgressSection.tsx"
      via: "{canReadTests ? null : <StudentProgressSection />}"
      pattern: "StudentProgressSection"
  prohibitions:
    - statement: "Маршруты сервера, их права доступа и форма ответов не меняются (/chart-data, /attempts/me, /api/users/:id/test-attempts); в app/server ничего не правится"
      status: resolved
      verification: test
    - statement: "Не трогаются app/web/components/providers/*, app/web/lib/session/*, app/web/proxy.ts, app/web/app/(internal)/(protected)/admin/*, app/web/app/(internal)/(protected)/profile/[id]/page.tsx, e2e/tests/session.spec.ts, e2e/fixtures/*"
      status: resolved
      verification: test
    - statement: "Новых npm-пакетов нет; package.json и yarn.lock не меняются"
      status: resolved
      verification: test
    - statement: "В новом и изменённом коде нет комментариев"
      status: resolved
      verification: test
---

<objective>
Заменить график «динамика / Пройденные тесты» из точек и областей на один столбиковый график в стиле shadcn Bar Chart: столбик — попытка, высота — процент правильно выполненного, цвет — раздел, название теста внутри столбика, период по умолчанию — месяц. Тот же график — на дашборде ученика.

Purpose: клиент видит пустой график у ученицы с тремя попытками: у каждого теста по одной точке, линия из одной точки не рисуется, а точки скрыты до наведения. Столбики видны всегда, и одна попытка — уже видимый столбик.
Tracer — профиль ученика у администратора: попытки из `/api/users/:id/test-attempts` → `buildAttemptBars` → `AttemptBarChart` → e2e: две попытки ученика видны двумя столбиками без наведения.
Output: модуль `lib/progress/attempt-chart.ts` с тестом, компонент `AttemptBarChart.tsx`, правка `UserProfileAssignmentsPage.tsx`, токены `--chart-6…--chart-10`, загрузчик `my-attempts.ts` с тестом, раздел дашборда `StudentProgressSection.tsx`, одна строка в `DashboardClient.tsx`, e2e `attempt-chart.spec.ts`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@docs/adr/0001-express-owns-data-and-access-policy.md
@docs/adr/0005-decompose-by-concept.md
@app/web/components/ui/chart.tsx
@app/web/components/users/UserProfileAssignmentsPage.tsx
@app/web/vitest.config.ts
@e2e/fixtures/exam.ts
@e2e/tests/review.spec.ts

Эталон композиции: https://ui.shadcn.com/docs/components/base/chart (Bar Chart). `app/web/components/ui/chart.tsx` уже в проекте, заново не ставить. recharts 2.15.4: `accessibilityLayer` у `BarChart` есть; `Legend` берёт `payload` из пропсов (`lib/util/getLegendProps.js`); `minPointSize` у `Bar` может быть функцией `(value, index) => number`.
</context>

<!-- planner-discipline-allow: AreaChart -->
<!-- planner-discipline-allow: CHART_COLORS -->

## Допущения для клиента

Каждое допущение — отдельный пункт; при другом ответе клиента меняется указанное место.

1. **Повторная попытка того же теста — отдельный столбик.** Клиент ещё подтвердит. Место: `buildAttemptBars` (строка на каждую попытку, без свёртки по тесту).
2. **Попытки одного дня стоят рядом по времени отправки, между днями — пустой промежуток шириной в столбик, дата подписана под средним столбиком дня** (при двух — под первым). Место: `buildAttemptBars`.
3. **Цвет раздела — по алфавитному порядку slug среди разделов, в которых у ученика есть попытки по назначенным тестам.** Фильтры цвет не меняют, у ученика на дашборде и у администратора в профиле цвета одинаковые. Новый раздел может сдвинуть цвета разделов после него по алфавиту. Палитра: `--chart-1…--chart-5` и новые `--chart-6…--chart-10`, дальше по кругу. Место: `assignTopicColors`, `TOPIC_PALETTE`, `globals.css`.
4. **Подпись в столбике:** горизонтально, если столбик шире 72px, иначе вертикально; не влезает целиком — обрезка с «…»; при низком проценте, когда внутри меньше 4 символов, подпись над столбиком. Столбик с 0% рисуется высотой 3px, чтобы был виден. Место: `fitBarLabel`, `barMinPointSize`.
5. **«Месяц» — с начала того же числа месяц назад по сейчас.** «3 месяца» и «Полгода» — так же на 3 и 6 месяцев, «Неделя» — на 7 дней. Настройка администратора `chart-default-range` (график на странице теста) на этот график не влияет. Место: `resolvePeriodBounds`, `DEFAULT_PERIOD`.
6. **«Один день» — тот же столбиковый график, под столбиками время попытки `HH:mm`.** Место: `buildAttemptBars` режим `day`.
7. **Список попыток под графиком, как и сейчас, фильтруется поиском, разделом и тестами, но не периодом.** Место: `UserProfileAssignmentsPage` (`filteredAttempts`).
8. **В профиле у администратора — попытки только по назначенным тестам** (как сейчас фильтры). Место: `UserProfileAssignmentsPage`.
9. **Дашборд ученика.** Сейчас на `/dashboard` этого графика нет: блок «Динамика результатов» в `DashboardClient.tsx` закомментирован, живой график с фильтрами есть только в профиле ученика у администратора. План добавляет на дашборд раздел «Пройденные тесты» с тем же графиком за последний месяц, без фильтров и без списка (у ученика рядом уже есть «Последние попытки»). Если клиент имел в виду только профиль у администратора, Task 3 выбрасывается целиком; если нужны фильтры и на дашборде — отдельная правка.
10. **Даты — по часовому поясу браузера** (сейчас график группировал по UTC, и попытка после 21:00 по Москве попадала в следующий день).
11. **Легенда показывает только разделы, у которых есть столбики в выбранном периоде.** Место: `legendTopics`.

## Параллельно с фазой 4

- План исполняется в отдельном worktree от `dev`. Общий файл с фазой 4 один: `DashboardClient.tsx` есть в `files_modified` у 04-12 (меняет строку `canReadTests`). Здесь в нём только импорт и одна строка JSX далеко от этого места, строки с `isAdmin` и `canReadTests` не трогать; конфликт при слиянии, если будет, — в одном импорте.
- `UserProfileAssignmentsPage.tsx`, `globals.css`, новые файлы — вне фазы 4. `profile/[id]/page.tsx` (его меняют 04-11 и 04-12) не трогается.
- Сервер не меняется: `/api/users/:id/test-attempts` уже отдаёт `topicSlug` и `topicTitle`, ученику раздел приходит из `GET /api/tests/public/tests`. `/chart-data` не нужен (он по одному тесту и по дням), доступ к нему фаза 5 поменяет без конфликта.

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Одна попытка — один столбик в профиле ученика у администратора</name>
  <files>app/web/lib/progress/attempt-chart.ts, app/web/lib/progress/attempt-chart.test.ts, app/web/components/progress/AttemptBarChart.tsx, app/web/components/users/UserProfileAssignmentsPage.tsx, e2e/tests/attempt-chart.spec.ts</files>
  <read_first>
    - app/web/components/users/UserProfileAssignmentsPage.tsx (весь файл: тип UserAttempt, фильтры, chartData, dayChartData, два графика, список)
    - app/web/components/ui/chart.tsx (ChartContainer, ChartStyle, ChartTooltipContent, ChartLegendContent, getPayloadConfigFromPayload)
    - app/web/vitest.config.ts (environment node, только *.test.ts)
    - e2e/fixtures/exam.ts (newSessionContext, takeTest, correctAnswers, projectKey) и e2e/fixtures/accounts.ts (seed, seedTest, sessionAccount)
    - e2e/tests/review.spec.ts блок «D2» (test.describe.serial, подготовка в обычном тесте)
  </read_first>
  <behavior>
    - buildAttemptBars: три попытки разных тестов в один день → три строки kind 'attempt' подряд без промежутка, по возрастанию submittedAt независимо от порядка входа
    - две попытки одного теста в один день → две отдельные строки (допущение 1)
    - попытки двух дней в режиме 'range' → между группами одна строка kind 'gap' с percent null; tick — дата 'd MMM' (ru) у среднего столбика дня, у остальных пустая строка
    - режим 'day' → промежутков нет, tick у каждой строки — 'HH:mm'
    - попытки в 23:30 и 00:30 следующего дня по местному времени (даты строятся через new Date(y, m, d, h, mi).toISOString()) → разные дни
    - percent = scorePercentage, ограниченный 0…100; fill строки = var(--color-<topicConfigKey(slug)>); пустой вход → []
    - topicConfigKey: 'e2e-topic' → 'topic-e2e-topic'; slug с кириллицей, пробелом, ';', '<', '}' → 'topic-x<хеш>' из [a-z0-9_-], одинаковый при повторном вызове, разный для разных slug
    - assignTopicColors: те же разделы в другом порядке и с повторами → тот же результат; порядок по slug; 6-й раздел → var(--chart-6), 11-й → снова var(--chart-1); title null → slug
    - buildTopicChartConfig: ключи — topicConfigKey, у каждого label (название раздела) и color (var(--chart-N))
    - barMinPointSize: null и undefined → 0, число (в том числе 0) → 3; chartMinWidth(n) = n * 36
  </behavior>
  <action>
1. `codegraph impact UserProfileAssignmentsPage`, `codegraph impact ChartContainer`: вызывающих запиши в SUMMARY.
2. `app/web/lib/progress/attempt-chart.ts` (без React и DOM, только date-fns и ru-локаль):
   - тип `ProgressAttempt` той же формы, что строка `/api/users/:id/test-attempts`: attemptId, testId, testTitle, testSlug, topicSlug, topicTitle (string | null), submittedAt (ISO), earnedPoints, totalPoints, scorePercentage, passed;
   - тип `TopicColor` { slug, key, title, color } и константа `TOPIC_PALETTE` из десяти строк var(--chart-1) … var(--chart-10);
   - `topicConfigKey(slug)`: если slug подходит под /^[a-z0-9_-]+$/ — 'topic-' + slug, иначе 'topic-x' + FNV-1a 32 бит от slug в base36. Ключ попадает в CSS через ChartStyle (dangerouslySetInnerHTML), поэтому других символов в нём быть не может (T-Q1-04);
   - `assignTopicColors(items)` по полям topicSlug и topicTitle: уникальные slug, сортировка обычным сравнением строк, цвет TOPIC_PALETTE[i % 10], title = topicTitle ?? slug;
   - `buildTopicChartConfig(colors)` → Record<key, { label, color }> (совместим с ChartConfig, тип из ui не импортировать);
   - тип `AttemptBarRow`: kind 'attempt' | 'gap', key (attemptId или 'gap-' + день), percent (number | null), testTitle, topicTitle, topicKey, fill, submittedAt, earnedPoints, totalPoints, tick; `buildAttemptBars(attempts, colors, mode)` по behavior, день — format(new Date(submittedAt), 'yyyy-MM-dd') в местном времени;
   - `barMinPointSize(value)`, `chartMinWidth(rowCount)` (36px на строку).
   `attempt-chart.test.ts` — строки behavior, `vi.useFakeTimers` не нужен.
3. `app/web/components/progress/AttemptBarChart.tsx` ('use client'), пропсы { attempts: ProgressAttempt[]; colors: TopicColor[]; mode: 'range' | 'day' }. Строки через useMemo из `buildAttemptBars`, config из `buildTopicChartConfig`. Обёртка div `overflow-x-auto`, внутри div со style minWidth = chartMinWidth(rows.length). Композиция один в один с shadcn Bar Chart: ChartContainer config={chartConfig} className="h-72 w-full" role="figure" aria-label="График результатов попыток"; BarChart accessibilityLayer data={rows}; CartesianGrid vertical={false}; XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={10} interval={0} и tickFormatter, который по key возвращает tick строки (Map key → tick); YAxis domain={[0, 100]} ticks 0/25/50/75/100, tickLine={false}, axisLine={false}, tickFormatter `${v}%`; Bar dataKey="percent" radius={4} minPointSize={barMinPointSize}, внутри Cell на каждую строку с fill={`var(--color-${row.topicKey})`}. Подписи, tooltip и легенда — Task 2.
4. `UserProfileAssignmentsPage.tsx`: тип `UserAttempt` заменить на `ProgressAttempt`; `topicColors` = useMemo(assignTopicColors(attempts по назначенным тестам)) — от всех попыток, не от отфильтрованных; оба графика-области (`AreaChart` в режиме периода и в режиме дня) заменить на `<AttemptBarChart>`: в режиме периода attempts = dateRangeFilteredAttempts и mode "range", в режиме дня attempts = filteredAttempts за выбранный день и mode "day". Удалить ставшие ненужными chartData, dayChartData, chartConfig, импорты Area, AreaChart, Legend, ChartContainer, ChartTooltip и комментарии, описывавшие удалённый код. Пустые состояния «Нет данных за выбранный период» и «Нет попыток за выбранный день» сохранить, условие первого — dateRangeFilteredAttempts пуст при непустом filteredAttempts. Точки в списке и в выборе тестов (`CHART_COLORS`) переводит Task 2.
5. `e2e/tests/attempt-chart.spec.ts`, `test.describe.serial('attempt bar chart')`, импорты из `../fixtures/exam` и `../fixtures/accounts`, без комментариев:
   - тест `setup: the student submits the same test twice in one day @progress`: seedTest(projectKey(testInfo), 'seq-d2'); две попытки через takeTest с correctAnswers, каждая в своём контексте newSessionContext(browser, testInfo, 'user') (черновик в localStorage не переносится), контексты закрыть;
   - тест `admin profile shows one visible bar per attempt without hover @progress` (фикстура adminPage): page.goto(`/profile/${sessionAccount(projectKey(testInfo), 'user').login}`), figure = page.getByRole('figure', { name: 'График результатов попыток' }); bars = figure.locator('.recharts-bar-rectangle path'); дождаться toBeVisible у bars.first(), затем число bars не меньше 2. Мышь не двигать, hover не вызывать.
6. `yarn oxfmt` по изменённым файлам.
  </action>
  <verify>
    <automated>yarn workspace @bio-exam/web vitest run lib/progress</automated>
    <fails_when>non-zero exit, "No test files found" в выводе, или в итоговой строке Tests нет "passed"</fails_when>
    <automated>yarn workspace @bio-exam/web typecheck</automated>
    <fails_when>non-zero exit или строка "error TS" в выводе</fails_when>
    <automated>node -e "const fs=require('fs');const r=f=>fs.readFileSync(f,'utf8');const c=r('app/web/components/progress/AttemptBarChart.tsx');const need=['accessibilityLayer','CartesianGrid vertical={false}','tickLine={false}','axisLine={false}','tickMargin={10}','radius={4}','dataKey=\"percent\"','<Cell','role=\"figure\"'];const miss=need.filter(s=>!c.includes(s));if(miss.length){console.error(miss);process.exit(1)}if(/AreaChart/.test(r('app/web/components/users/UserProfileAssignmentsPage.tsx')))process.exit(2);for(const f of ['app/web/lib/progress/attempt-chart.ts','app/web/lib/progress/attempt-chart.test.ts','app/web/components/progress/AttemptBarChart.tsx','e2e/tests/attempt-chart.spec.ts'])if(/^\s*\/\/|\/\*|\s\/\/\s/m.test(r(f))){console.error(f);process.exit(3)}console.log('bar composition ok')"</automated>
    <fails_when>non-zero exit (1 = не хватает элемента композиции shadcn, 2 = в профиле остался график-область, 3 = комментарий в новом файле) или нет строки "bar composition ok"</fails_when>
    <automated>yarn e2e --grep @progress</automated>
    <fails_when>non-zero exit, "No tests found" в выводе, или в итоговой сводке Playwright есть "failed"</fails_when>
  </verify>
  <acceptance_criteria>
    - Vitest зелёный по всем строкам behavior
    - Проверка печатает `bar composition ok`
    - e2e `@progress` зелёный на chromium-desktop и chromium-mobile: две попытки ученика видны в профиле у администратора как два и более столбика без наведения
  </acceptance_criteria>
  <done>В профиле ученика у администратора каждая попытка — видимый столбик цвета своего раздела.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Подписи в столбиках, tooltip, легенда разделов, пресеты периода с месяцем по умолчанию</name>
  <files>app/web/lib/progress/attempt-chart.ts, app/web/lib/progress/attempt-chart.test.ts, app/web/components/progress/AttemptBarChart.tsx, app/web/components/users/UserProfileAssignmentsPage.tsx, app/web/styles/globals.css, e2e/tests/attempt-chart.spec.ts</files>
  <read_first>
    - app/web/lib/progress/attempt-chart.ts и AttemptBarChart.tsx (после Task 1)
    - app/web/components/users/UserProfileAssignmentsPage.tsx (после Task 1: состояние range/from/to/day, handlePresetChange, handleCalendarSelect, handleDaySelect, кнопки «Свой диапазон» и «Один день», список и выбор тестов)
    - app/web/components/ui/chart.tsx строки ChartTooltipContent (labelFormatter, formatter, nameKey) и ChartLegendContent (dataKey → config)
    - app/web/styles/globals.css блоки @theme, :root, [data-theme='dark'] (токены --chart-1…5)
    - e2e/tests/attempt-chart.spec.ts (после Task 1)
  </read_first>
  <behavior>
    - fitBarLabel('Короткий', { barWidth: 120, barHeight: 200, spaceAbove: 10 }) → горизонтально, внутри, текст целиком
    - fitBarLabel(длинное название, { barWidth: 120, barHeight: 200 }) → горизонтально, длина текста ≤ floor((120 - 8) / 7) символов, текст оканчивается на '…'
    - fitBarLabel(название, { barWidth: 30, barHeight: 200 }) → вертикально, внутри, длина ≤ floor((200 - 8) / 7)
    - fitBarLabel(название, { barWidth: 30, barHeight: 20, spaceAbove: 180 }) → вертикально, над столбиком, длина ≤ floor((180 - 8) / 7)
    - fitBarLabel('', …) и fitBarLabel(undefined, …) → null; результат никогда не длиннее вычисленной ёмкости; ёмкость 1 → '…'
    - legendTopics(rows, colors): только разделы, у которых есть строки 'attempt', порядок как в colors, без повторов
    - parsePeriod: null, '', 'garbage' → 'month'; 'week', 'month', '3months', '6months', 'all', 'custom' → как есть
    - parseDayParam: '2026-10-04' → местная полночь 4 октября; '2026-13-45', 'abc', '' → null; parseDateParam: валидный ISO → Date, 'abc' → null
    - resolvePeriodBounds при now = new Date(2026, 9, 4, 15, 0): month → start = startOfDay(4 сентября), end null; 3months → 4 июля; 6months → 4 апреля; week → 27 сентября; all → оба null; custom с валидными from/to → startOfDay(from), endOfDay(to); custom с from 'abc' → start null без исключения; валидный day → startOfDay и endOfDay этого дня, день важнее периода; невалидный day игнорируется
    - filterAttemptsByPeriod: границы включительно, null-граница не ограничивает
  </behavior>
  <action>
1. `attempt-chart.ts`, дополнить:
   - `fitBarLabel(text, { barWidth, barHeight, spaceAbove })` → { text, vertical, placement: 'inside' | 'above' } | null; константы CHAR_PX = 7, PAD_PX = 4, WIDE_BAR_PX = 72, MIN_INSIDE_CHARS = 4, LINE_PX = 14; правила: barWidth ≥ 72 → горизонтально, ёмкость floor((barWidth - 2·PAD) / CHAR), внутри если barHeight ≥ LINE + 2·PAD, иначе над столбиком; уже 72 → вертикально, ёмкость внутри floor((barHeight - 2·PAD) / CHAR), при ≥ 4 — внутри, иначе над столбиком с ёмкостью floor((spaceAbove - 2·PAD) / CHAR); обрезка: длиннее ёмкости → первые ёмкость − 1 символов, trimEnd, '…' (допущение 4);
   - `legendTopics(rows, colors)`;
   - период: тип `PeriodValue`, `PERIOD_PRESETS` = [week 'Неделя', month 'Месяц', 3months '3 месяца', 6months 'Полгода', all 'Всё время'], `DEFAULT_PERIOD = 'month'`, `parsePeriod`, `parseDayParam` (строго yyyy-MM-dd через date-fns parse и isValid, местное время), `parseDateParam`, `resolvePeriodBounds({ period, from, to, day }, now)`, `filterAttemptsByPeriod(attempts, bounds)` (допущение 5). Тесты — строки behavior.
2. `AttemptBarChart.tsx`, дополнить, сохраняя композицию Task 1:
   - внутри Bar: LabelList dataKey="testTitle" с content-рендером: строки 'gap' и пустой value → null; fitBarLabel(value, { barWidth: width, barHeight: height, spaceAbove: y − margin.top }); элемент text с className="attempt-bar-label", fontSize 11, fill="var(--foreground)", stroke="var(--card)", strokeWidth 3, paintOrder="stroke", pointerEvents="none"; вертикальный текст — transform rotate(-90) вокруг точки привязки (внутри — от низа столбика вверх, над столбиком — от верха столбика вверх), горизонтальный — по центру столбика;
   - ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter=… formatter=… />}: labelFormatter из payload[0].payload выводит полное testTitle и дату format(submittedAt, 'd MMMM yyyy, HH:mm', ru); formatter — квадрат цвета row.fill, название раздела (text-muted-foreground) и formatPercent(percent) (font-mono tabular-nums) с баллами earned/total; строки 'gap' в tooltip не попадают: percent у них null, а filterNull у ChartTooltip остаётся по умолчанию (true), не отключать — иначе formatter получит null и на промежутке появится пустой tooltip;
   - ChartLegend verticalAlign="top" payload = legendTopics(...) в виде { value: key, dataKey: key, color: `var(--color-${key})`, type: 'square' } и content={<ChartLegendContent />} — подпись берётся из config[key].label, то есть название раздела;
   - подписи осей: YAxis label «Правильно, %» (angle -90, insideLeft), XAxis label «Дата» в режиме range и «Время» в режиме day; margin BarChart { top: 24, right: 12, bottom: 8, left: 12 }, высоту XAxis увеличить, чтобы подпись не наезжала на тики;
   - у ChartContainer aria-describedby на скрытый абзац (sr-only, id через useId): «Столбик — попытка, высота — процент правильных ответов, цвет — раздел. Попыток: N». Абзац — сосед ChartContainer внутри обёртки overflow-x-auto, не внутри ChartContainer: детей ChartContainer получает ResponsiveContainer, и лишний элемент там ломает рендер.
3. `globals.css`: в @theme добавить --color-chart-6 … --color-chart-10 по образцу существующих; в :root — --chart-6: oklch(0.56 0.09 300), --chart-7: oklch(0.6 0.12 20), --chart-8: oklch(0.52 0.08 265), --chart-9: oklch(0.66 0.1 340), --chart-10: oklch(0.48 0.07 135); в [data-theme='dark'] — var(--color-violet-400), var(--color-rose-400), var(--color-emerald-400), var(--color-amber-400), var(--color-cyan-400). Блоки .theme-container не трогать (в коде не используются).
4. `UserProfileAssignmentsPage.tsx`:
   - range: useQueryState('range', { defaultValue: DEFAULT_PERIOD }), рабочее значение — parsePeriod(range); границы — resolvePeriodBounds({ period, from: customFrom, to: customTo, day: selectedDay }, new Date()); вместо ручного подсчёта dateRangeFilteredAttempts и фильтра дня — filterAttemptsByPeriod; режим графика 'day', если parseDayParam(selectedDay) не null;
   - ToggleGroup aria-label="Период" className с flex-wrap и justify-start (на мобильном пять пресетов переносятся) с элементами из PERIOD_PRESETS (Неделя, Месяц, 3 месяца, Полгода, Всё время); value — период, если он пресет и день не выбран, иначе ''; выбор пресета, как сейчас, очищает from, to и day; выбор дня больше не ставит range в 'all', снятие дня возвращает выбранный период;
   - подпись кнопки «Свой диапазон» и «Один день», заголовок «Попытки за …» и selected у Calendar строятся только из parseDateParam/parseDayParam; при null — исходный текст кнопки (T-Q1-01);
   - точки в списке попыток и в выборе тестов — цвет раздела попытки или теста из topicColors (по topicSlug); `CHART_COLORS` и activeTestList, если стал не нужен, удалить.
5. `e2e/tests/attempt-chart.spec.ts`, тест администратора из Task 1 дополнить (несколько утверждений, поэтому файл в этой задаче): label = figure.locator('text.attempt-bar-label'); не меньше двух подписей, у которых textContent без конечного '…' непуст и является началом seedTest(projectKey(testInfo), 'seq-d2').title, первая из них toBeVisible; легенда — figure.locator('.recharts-legend-wrapper').getByText(seed.topic.title, { exact: true }) видна; page.getByRole('radio', { name: 'Месяц', exact: true }) имеет aria-checked="true", new URL(page.url()).searchParams.get('range') равен null; радио «3 месяца» и «Полгода» видимы; figure.locator('.recharts-tooltip-wrapper') скрыт (toBeHidden), то есть подписи видны без наведения.
6. `yarn oxfmt` по изменённым файлам.
  </action>
  <verify>
    <automated>yarn workspace @bio-exam/web vitest run lib/progress</automated>
    <fails_when>non-zero exit, "No test files found" в выводе, или в итоговой строке Tests нет "passed"</fails_when>
    <automated>yarn workspace @bio-exam/web typecheck</automated>
    <fails_when>non-zero exit или строка "error TS" в выводе</fails_when>
    <automated>node -e "const fs=require('fs');const r=f=>fs.readFileSync(f,'utf8');const c=r('app/web/components/progress/AttemptBarChart.tsx');const need=['accessibilityLayer','CartesianGrid vertical={false}','tickLine={false}','axisLine={false}','tickMargin={10}','radius={4}','dataKey=\"percent\"','<Cell','LabelList','attempt-bar-label','ChartTooltipContent','ChartLegendContent','fitBarLabel','legendTopics','aria-label'];const miss=need.filter(s=>!c.includes(s));if(miss.length){console.error(miss);process.exit(1)}const p=r('app/web/components/users/UserProfileAssignmentsPage.tsx');if(/CHART_COLORS|AreaChart/.test(p))process.exit(2);if(!/DEFAULT_PERIOD/.test(p)||!/PERIOD_PRESETS/.test(p)||!/parseDayParam/.test(p))process.exit(3);const g=r('app/web/styles/globals.css');for(let i=6;i<=10;i++)if(!g.includes('--color-chart-'+i)||(g.match(new RegExp('--chart-'+i+':','g'))||[]).length<2)process.exit(4);for(const f of ['app/web/lib/progress/attempt-chart.ts','app/web/lib/progress/attempt-chart.test.ts','app/web/components/progress/AttemptBarChart.tsx','e2e/tests/attempt-chart.spec.ts'])if(/^\s*\/\/|\/\*|\s\/\/\s/m.test(r(f))){console.error(f);process.exit(5)}const e=r('e2e/tests/attempt-chart.spec.ts');if(!['attempt-bar-label','recharts-legend-wrapper','aria-checked','toBeHidden'].every(s=>e.includes(s)))process.exit(6);console.log('labels legend period ok')"</automated>
    <fails_when>non-zero exit (1 = нет элемента композиции, подписи, tooltip или легенды, 2 = в профиле остались цвета по тестам или график-область, 3 = период не через модуль, 4 = нет токенов --chart-6…10 в @theme, :root и dark, 5 = комментарий в новом файле, 6 = e2e не проверяет подписи, легенду, «Месяц» или скрытый tooltip) или нет строки "labels legend period ok"</fails_when>
    <automated>yarn e2e --grep @progress</automated>
    <fails_when>non-zero exit, "No tests found" в выводе, или в итоговой сводке Playwright есть "failed"</fails_when>
  </verify>
  <acceptance_criteria>
    - Vitest зелёный по строкам behavior Task 1 и Task 2
    - Проверка печатает `labels legend period ok`
    - e2e `@progress` зелёный на обоих проектах: в профиле у администратора подписи тестов в столбиках видны без наведения, легенда показывает раздел, «Месяц» выбран по умолчанию
  </acceptance_criteria>
  <done>В столбиках видны названия тестов, легенда показывает разделы, по умолчанию выбран месяц, доступны 3 месяца и полгода.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: График на дашборде ученика; e2e дашборда; полный прогон</name>
  <files>app/web/lib/progress/my-attempts.ts, app/web/lib/progress/my-attempts.test.ts, app/web/components/progress/StudentProgressSection.tsx, app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx, e2e/tests/attempt-chart.spec.ts</files>
  <read_first>
    - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx (testsQuery с ключом 'dashboard-public-tests', SoftPanel, SectionTitle, EmptyPanel, место закомментированного блока «Динамика результатов»; строки с isAdmin и canReadTests не править)
    - app/web/lib/tests/api.ts (fetchPublicTestsList, fetchMyTestAttempts) и app/web/lib/tests/types.ts (PublicTestListItem, TestAttemptSummary)
    - app/server/src/routes/tests/public.ts обработчик GET /tests/:id/attempts/me (limit не больше 100, сортировка по убыванию) — только чтение
    - e2e/tests/attempt-chart.spec.ts (после Task 1)
  </read_first>
  <behavior>
    - loadMyProgressAttempts([], fetchPage) → [] без вызовов fetchPage
    - тест с total 150: два вызова fetchPage с offset 0 и 100, limit 100; результат — 150 попыток
    - страница вернула 0 строк при total больше собранного → цикл останавливается (нет бесконечного запроса)
    - поля: attemptId = row.id, testId, testTitle, testSlug из теста, topicSlug и topicTitle из теста, submittedAt, earnedPoints, totalPoints, scorePercentage, passed из строки
    - ошибка fetchPage по одному тесту → промис отклоняется этой ошибкой
  </behavior>
  <action>
1. `codegraph impact DashboardClient`: вызывающих запиши в SUMMARY.
2. `app/web/lib/progress/my-attempts.ts`: `MY_ATTEMPTS_PAGE = 100`; `loadMyProgressAttempts(tests, fetchPage)` — по каждому тесту (Promise.all по тестам) страницы limit 100 с offset, пока собрано меньше total и страница не пуста; отображение в ProgressAttempt по behavior. fetchPage передаётся параметром (в компоненте — fetchMyTestAttempts), чтобы тест шёл в Node без сети. `my-attempts.test.ts` — строки behavior.
3. `app/web/components/progress/StudentProgressSection.tsx` ('use client'): useSWR('dashboard-public-tests', fetchPublicTestsList) (тот же ключ, что в DashboardClient, запрос один); useSWR по ключу ['progress-my-attempts', id тестов через запятую] → loadMyProgressAttempts(tests, fetchMyTestAttempts); colors = assignTopicColors(все попытки); попытки за месяц = filterAttemptsByPeriod(все, resolvePeriodBounds({ period: DEFAULT_PERIOD }, new Date())). Разметка как у SoftPanel: section с классами rounded-4xl border border-border/80 bg-card/90 shadow-sm p-unit-mob tab-sm:p-unit; надзаголовок «динамика» (font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase), h2 «Пройденные тесты» (font-serif text-2xl tab-sm:text-3xl), строка «За последний месяц» (text-sm text-muted-foreground). Состояния: загрузка — Skeleton h-72 rounded-3xl; ошибка — p role="alert" «Не удалось загрузить попытки»; попыток нет — «График появится после первой попытки.»; за месяц нет — «За последний месяц попыток нет.» (оформление как EmptyPanel); иначе AttemptBarChart mode "range" (допущение 9).
4. `DashboardClient.tsx`: импорт StudentProgressSection и строка {canReadTests ? null : <StudentProgressSection />} непосредственно перед закомментированным блоком с «Динамика результатов». Больше в файле ничего не менять: закомментированный блок, существующие запросы и строки с isAdmin и canReadTests остаются (общий файл с 04-12).
5. `e2e/tests/attempt-chart.spec.ts`, в serial-блок после теста администратора — новый тест `student dashboard shows each attempt as a labelled bar without hover @progress` (фикстура studentPage): page.goto('/dashboard'), heading «Пройденные тесты» виден, тот же figure по роли и имени, не меньше двух видимых столбиков `.recharts-bar-rectangle path`, проверки подписей `text.attempt-bar-label` и легенды через `.recharts-legend-wrapper` с exact: true — как в тесте администратора из Task 2, figure.locator('.recharts-tooltip-wrapper') скрыт.
6. `yarn oxfmt` по изменённым файлам; `codegraph affected` по всем файлам плана — в SUMMARY; `yarn verify`; `yarn e2e`.
  </action>
  <verify>
    <automated>yarn workspace @bio-exam/web vitest run lib/progress</automated>
    <fails_when>non-zero exit, "No test files found" в выводе, или в итоговой строке Tests нет "passed"</fails_when>
    <automated>node -e "const fs=require('fs');const r=f=>fs.readFileSync(f,'utf8');const d=r('app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx');if(!/<StudentProgressSection \/>/.test(d))process.exit(1);if(!/AttemptBarChart/.test(r('app/web/components/progress/StudentProgressSection.tsx')))process.exit(2);const e=r('e2e/tests/attempt-chart.spec.ts');if((e.match(/@progress/g)||[]).length<3||!/attempt-bar-label/.test(e)||!/aria-checked/.test(e)||!/toBeHidden/.test(e))process.exit(3);for(const f of ['app/web/lib/progress/my-attempts.ts','app/web/lib/progress/my-attempts.test.ts','app/web/components/progress/StudentProgressSection.tsx','e2e/tests/attempt-chart.spec.ts'])if(/^\s*\/\/|\/\*|\s\/\/\s/m.test(r(f))){console.error(f);process.exit(4)}const {execSync}=require('child_process');const ch=execSync('git status --porcelain -- app/server package.json app/web/package.json yarn.lock app/web/components/providers app/web/lib/session app/web/proxy.ts e2e/fixtures e2e/tests/session.spec.ts',{encoding:'utf8'});if(ch.trim()){console.error(ch);process.exit(5)}console.log('dashboard and e2e wired')"</automated>
    <fails_when>non-zero exit (1 = дашборд не монтирует раздел, 2 = раздел не использует график, 3 = в e2e меньше трёх тестов @progress или нет проверок подписи, месяца и скрытого tooltip, 4 = комментарий в новом файле, 5 = изменены сервер, пакеты или файлы фазы 4) или нет строки "dashboard and e2e wired"</fails_when>
    <automated>yarn verify</automated>
    <fails_when>non-zero exit или последняя строка вывода не "yarn verify: OK"</fails_when>
    <automated>yarn e2e</automated>
    <fails_when>non-zero exit или в итоговой сводке Playwright есть "failed" (ожидаемые падения test.fail @known-defect — D1 и D8, пока 04-11 не влит в dev, — Playwright считает пройденными)</fails_when>
  </verify>
  <acceptance_criteria>
    - Vitest зелёный по строкам behavior всех трёх задач
    - Проверка печатает `dashboard and e2e wired`
    - `yarn verify` печатает `yarn verify: OK`; `yarn e2e` без failed, три теста `@progress` зелёные на обоих проектах; в SUMMARY число пройденных тестов
  </acceptance_criteria>
  <done>Ученик и администратор видят одинаковый столбиковый график с подписями; полный прогон зелёный.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| URL → клиент | параметры range, from, to, day задаёт кто угодно ссылкой |
| API → клиент | названия тестов и разделов, slug разделов приходят из БД, их пишут администраторы |
| клиент → API | ученик читает свои попытки, администратор — попытки ученика; маршруты и права существующие |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q1-01 | Denial of service | параметры URL from, to, day в профиле | low | mitigate | даты только через parseDateParam/parseDayParam (null при невалидной), format вызывается только для валидной Date; неизвестный range → parsePeriod → 'month'; тесты Vitest на битые значения |
| T-Q1-02 | Information disclosure | данные дашборда ученика | medium | mitigate | только существующие маршруты: GET /api/tests/public/tests (назначенные) и /tests/:id/attempts/me (по пользователю сессии); новых маршрутов и изменений прав нет, проверку назначения добавит фаза 5 (05-04); проверка 5 в Task 3 ловит правки в app/server |
| T-Q1-03 | Information disclosure | профиль ученика у администратора | low | accept | маршрут /api/users/:id/test-attempts с requirePerm('tests', 'read') не меняется; страница /profile/[id] и её проверка не трогаются |
| T-Q1-04 | Tampering | ChartStyle (dangerouslySetInnerHTML) получает ключи и цвета config | medium | mitigate | ключ раздела — topicConfigKey: только [a-z0-9_-], иначе хеш; цвет — только константы TOPIC_PALETTE; название раздела идёт только в label и выводится React с экранированием; тест на slug с ';', '<', '}' |
| T-Q1-05 | Denial of service | загрузка всех попыток ученика | low | accept | один запрос на назначенный тест и по 100 попыток на страницу; цикл останавливается на пустой странице (тест); ограничение limit на сервере не меняется |
| T-Q1-SC | Tampering | npm/pip/cargo installs | high | mitigate | установок нет; проверка 5 в Task 3 ловит изменения package.json и yarn.lock |
</threat_model>

<verification>
- `yarn workspace @bio-exam/web vitest run lib/progress`, `yarn workspace @bio-exam/web typecheck`, `yarn e2e --grep @progress` после каждой задачи.
- Итог: `yarn verify` печатает `yarn verify: OK`; `yarn e2e` без failed.
</verification>

<success_criteria>
- У ученицы с тремя попытками график показывает три столбика сразу, без наведения, с названиями тестов внутри.
- Цвет столбика — раздел, легенда — разделы, tooltip — полное название, раздел, дата, процент.
- Период по умолчанию — месяц; есть 3 месяца, полгода, всё время, свой диапазон, неделя, один день; поиск, выбор раздела и тестов, список попыток работают.
- Тот же график на дашборде ученика за последний месяц.
- Сервер, пакеты и файлы фазы 4 (кроме одной строки в DashboardClient) не изменены.
</success_criteria>

## UI Considerations

- Стиль: shadcn-карточки проекта (rounded-4xl, border-border/80, bg-card/90), токены `--chart-*`, `--foreground`, `--card`, `--muted-foreground`; тексты по-русски.
- a11y: `role="figure"` и `aria-label` у графика, скрытое описание через `aria-describedby`, `accessibilityLayer` (клавиатура по столбикам), подписи осей «Правильно, %» и «Дата»/«Время», легенда разделов текстом; раздел не передаётся одним цветом — он есть в легенде и в tooltip; подписи с обводкой цвета карточки читаются на любом цвете столбика; `aria-label="Период"` у группы пресетов.
- Узкий экран: при многих попытках график прокручивается по горизонтали (36px на столбик), подписи не сжимаются в нечитаемые.

## Deferred human verification

- Визуальная проверка на живых данных клиента (вертикальные подписи на длинных названиях, цвета разделов) — после выкладки.
- Коммит файлов плана делает пользователь.

## Artifacts this phase produces

- `app/web/lib/progress/attempt-chart.ts`: `ProgressAttempt`, `TopicColor`, `TOPIC_PALETTE`, `topicConfigKey`, `assignTopicColors`, `buildTopicChartConfig`, `AttemptBarRow`, `buildAttemptBars`, `barMinPointSize`, `chartMinWidth`, `fitBarLabel`, `legendTopics`, `PeriodValue`, `PERIOD_PRESETS`, `DEFAULT_PERIOD`, `parsePeriod`, `parseDayParam`, `parseDateParam`, `resolvePeriodBounds`, `filterAttemptsByPeriod`; тесты в `attempt-chart.test.ts`.
- `app/web/lib/progress/my-attempts.ts`: `loadMyProgressAttempts`, `MY_ATTEMPTS_PAGE`; тесты в `my-attempts.test.ts`.
- `app/web/components/progress/AttemptBarChart.tsx`: столбиковый график попыток (пропсы attempts, colors, mode).
- `app/web/components/progress/StudentProgressSection.tsx`: раздел дашборда ученика «Пройденные тесты».
- Токены `--chart-6…--chart-10` и `--color-chart-6…--color-chart-10` в `app/web/styles/globals.css`.
- `e2e/tests/attempt-chart.spec.ts`: тег `@progress`, три теста.

<output>
Создай `.planning/quick/001-topic-charts/001-SUMMARY.md`. Не коммить. В SUMMARY: выводы `codegraph impact` и `codegraph affected`, итог `yarn verify` и `yarn e2e` (число пройденных), раздел `## Deferred human verification`, список допущений, которые клиент ещё должен подтвердить, список файлов к коммиту.
</output>
