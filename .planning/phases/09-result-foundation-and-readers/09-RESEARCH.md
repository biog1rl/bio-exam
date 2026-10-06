# Phase 9: Result foundation and readers - Research

**Researched:** 2026-10-06
**Domain:** хранение результата попытки (неизменяемые автофакты + пересчитываемая проекция), шаблон `open` в `exam-core`, перевод всех читателей результата на состояние «на проверке», входная проверка сдачи, правило удаления пользователя
**Confidence:** HIGH по коду (все точки интеграции прочитаны на `1962edd`, ветка `dev`, дерево чистое); MEDIUM по проектным выборам, помеченным `[ASSUMED]`
**Источники:** только репозиторий и живые пробы на одноразовой базе (`node scripts/with-test-db.mjs`). Внешних пакетов фаза не ставит, поэтому seam `research-plan` и провайдеры документации не запускались: в них нечего искать.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Перенесено из прежних решений (не переспрашивалось):
- **ADR-0002, ADR-0005.** Логика шаблонов — один раз в `packages/exam-core`; модули по понятиям; «оценённая попытка» — модуль `services/scored-attempt` (фаза 5).
- **ADR-0003.** Характеризационные тесты читателей и `scored-attempt` до изменений; `yarn verify` зелёный перед закрытием.
- **Core Value.** Попытка оценена ровно один раз и остаётся такой, какой была оценена: автофакты неизменны, ручные оценки только добавляются.
- **Решения пользователя по вехе (2026-10-06):** открытый вопрос всегда 0–3 балла; после сдачи ученик видит предварительный итог автопроверки «X из Y» без процента; «на проверке» не входит в средние и не рисуется на графиках, после проверки встаёт на дату сдачи; пустой открытый ответ к концу окна получает системный 0 «нет ответа» (запись проверки без проверяющего — фаза 15, но проекция и функция итога её учитывают уже здесь); после финального итога возврат запрещён, только переоценка новой записью.
- **Исследование (`.planning/research/SUMMARY.md`):** `results_version` остаётся 2 (аддитивно), CHECK `IN (1,2)` не трогать; CHECK `review_status = 'pending' ⇔ final_* IS NULL`; миграции с 0026: сначала заполнить существующие попытки (на переезде их было 265), потом включить CHECK; страховка `jobs:run reconcile-outcomes` (команда появится с модулем фоновых задач в фазе 11, здесь — функция сверки); все серверные читатели берут поля результата через один экспорт `attemptResultColumns`; процент на клиенте `number | null`, `clampPercent(null)` и `?? 0` запрещены; в каждом SQL-агрегате явный `review_status <> 'pending'`.
- **Общие правила проекта.** Агенты не коммитят; БД-тесты только через `node scripts/with-test-db.mjs`; применённые миграции не правятся; комментарии в коде не пишутся; тесты по гигиене (серверные интеграционные и e2e, юниты только для логики с вариантами, без хрупких структурных охранников).

Вид «на проверке» в списках:
- **D-01:** В списке и карточке попыток админа и учителя попытка на проверке показывает метку «На проверке» и мелко «авто X из Y» (баллы автопроверки за не-открытые вопросы из их максимума). Процента и «Сдано/Не сдано» нет.
- **D-02:** У ученика («Мои попытки», страница теста, профиль, шапка разбора, экран после сдачи в `TestRunner`) везде одинаково: «На проверке · предварительно X из Y», без процента.
- **D-03:** Попытка, в итоге которой есть оценка учителя, после проверки показывает рядом с процентом небольшую отметку «проверено учителем» (в списках и в шапке разбора). Попытки только с автопроверкой выглядят как сейчас.
- **D-04:** Глобальный поиск: у попытки на проверке вместо «Сдано/Не сдано» — «На проверке»; поиск по проценту её не находит.
- **D-05:** Дашборды и графики: попытка на проверке не входит в средние и не рисуется; после проверки появляется на дате сдачи (`submittedAt`) с итоговым процентом.

Предел длины ответа:
- **D-06:** Текст открытого ответа — до 5 000 знаков, краткий ответ (`short_text`) — до 200 знаков. Пределы — константы в `exam-core`, общие для сервера и web. — **Reversibility:** reversible — константы и проверка, данные не мигрируются.
- **D-07:** Сервер на сдаче отклоняет ответы на вопросы не из теста и тексты сверх предела понятным 4xx (без 500); уже сохранённые попытки не трогаются. Проверка в том же месте, где сдача разбирает ответы; сохранение черновика ограничивается тем же пределом.
- **D-08:** Ученик видит предел так: счётчик «4 100 / 5 000» появляется после 80% предела, на пределе ввод останавливается. Для краткого ответа в этой фазе — ограничение длины поля; счётчик открытого ответа строится вместе с полем в фазе 14 по этому же правилу.

Фильтр и сводка попыток:
- **D-09:** Новый фильтр «Проверка» в списке попыток: «Все» / «На проверке» / «Проверено». «Проверено» = попытки с открытыми вопросами, где все ответы оценены учителем; попытки только с автопроверкой видны в «Все». Параметр запроса — новый (`review`), существующий фильтр `status` (активен ли ученик) не меняется.
- **D-10:** В сводке над списком — карточка «На проверке: N» по всей зоне; нажатие включает фильтр. Средний балл в сводке считается без попыток на проверке.
- **D-11:** Порядок списка не меняется (по дате); попытки на проверке не закрепляются сверху — для работы с ними будет экран «Ждут проверки» в фазе 15.

Удаление пользователя:
- **D-12:** Удаление ученика удаляет всё его: попытки (как сейчас), открытые ответы, фото — сначала файлы, затем строки, — проверки его ответов и его уведомления. Для сохранения истории у админа остаётся отключение пользователя. — **Reversibility:** one-way — удалённые фото и ответы не восстанавливаются, кроме как из резервной копии.
- **D-13:** Удаление учителя оставляет его оценки и комментарии: ссылка на проверяющего обнуляется (`SET NULL`), в истории показывается «проверяющий удалён» — так же, как сейчас авторство тестов и назначений.
- **D-14:** Правило фиксируется тестом-каталогом по схеме: каждый внешний ключ таблиц вехи на `users` либо `cascade` (данные, принадлежащие пользователю; если в цепочке есть файлы — они удаляются явно до удаления строк), либо `set null` (авторство). Фаза 10 и последующие держат тест зелёным. Первый план фазы записывает правило до миграции фазы 10.

### Claude's Discretion
- Цвет и значок меток «На проверке» и «проверено учителем» — по существующим токенам и бейджам, контраст по AA.
- Формат «авто X из Y» в узких колонках и на 375 px.
- Как именно открытый тип не попадает на страницу «Правила баллов» (скрыт или только для чтения) — максимум 3 не редактируется.
- Конкретный 4xx-код и текст ошибки превышения предела и чужих вопросов.
- Состав таблицы-теста «проекция = пересчёт» и сид попыток на проверке для поведенческого теста читателей.

### Deferred Ideas (OUT OF SCOPE)
None — обсуждение не выходило за рамки фазы. Экран «Ждут проверки», плитка на дашборде учителя и уведомления остаются в фазах 15 и 10 по роадмапу.

Что НЕ входит в фазу (раздел Phase Boundary CONTEXT): создание открытых вопросов в редакторе, раннер, фото, QR, сдача с открытыми ответами (фазы 12–14); экран проверки, очередь, возвраты, история, уведомления (10 и 15); счётчик знаков открытого поля (14); журнал уведомлений (10); ZIP-экспорт не читатель результата (`services/question-content` не читает `score_percentage`).

UI-контракт `09-UI-SPEC.md` (approved 2026-10-06) обязателен наравне с решениями: компоненты `ReviewStatusChip`, `TeacherCheckedMark`, `AttemptReviewLine`, чистая функция `lib/tests/attempt-result-view.ts`, 422 `ANSWERS_INVALID`, новая плитка и фильтр `review`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RES-01 | Автофакты попытки (ответы, результаты по вопросам, баллы, процент, `passed` на момент сдачи) после сдачи не переписываются; ручные проверки — добавляемые записи | Раздел «Модель результата»: четыре старых столбца + `results`/`answers` остаются фактами; никто их не пишет после INSERT (`submit.ts:143-161` только INSERT, `.update(testAttempts)` в коде нет). Рекомендация: триггер `BEFORE UPDATE` на столбцы фактов + один интеграционный тест «повторная сдача и UPDATE фактов не меняют строку». Таблицы проверок — не в фазе 9 (Открытый вопрос 1) |
| RES-02 | Итог = автофакты + последняя проверка каждого открытого ответа; одна функция в `exam-core`; проекция всегда равна пересчёту, включая существующие попытки | `computeAttemptOutcome` (раздел «Функция итога»), `projectionOf`, `materializeAttemptOutcome(tx, …)`, `reconcileOutcomes`; миграция 0026/0027 с заполнением и CHECK; таблица-тест в `exam-core` + серверный интеграционный тест + запрос проверки для пользователя |
| RES-03 | Все читатели показывают «на проверке» без процента и «Пройден/Не пройден», не включают в средние, на график попадает только после проверки на дату сдачи | Полный перечень читателей с номерами строк (серверные 12 мест, web 17 мест), `attemptResultColumns`, `attempt-result-view.ts`, один поведенческий серверный тест по 8 читателям + e2e |
| RES-04 | Фильтр списка попыток по состоянию проверки через новый параметр, `status` не меняется | `AttemptsQuerySchema` (`admin/attempts.ts:35-44`) + `attemptFilters` (:48-67); `summary.pendingTotal` считается в охвате `visible`, как `scopeTotal` |
| RES-05 | Сдача принимает ответы только на вопросы теста и отклоняет текст сверх предела (SEC-04/N3) | `scoreSubmission` уже грузит вопросы и типы (`facts.ts:52-69`): проверка встаёт туда; константы и чистая функция в `exam-core`; 422 `ANSWERS_INVALID` на сдаче, 400 на черновике (иначе бесконечный повтор очереди, см. Ловушку 6) |
| OPEN-02 | Открытый вопрос оценивается 0–3 | Шаблон `open`, метрика `manual`, правило `{exact_match, manual, 3}`, `questionStatus` → `pending`, максимум 3 не редактируется (серверные запреты в `question-types.ts`) |
| PLAT-05 | Правило удаления пользователя для новых таблиц | ADR-0006 (первый план) + тест-каталог по `pg_constraint` с явным списком исключений (живая проба, раздел «Правило удаления») |
</phase_requirements>

## Summary

Фаза делает три вещи в строгом порядке зависимостей. Сначала `exam-core`: шестой шаблон `open`, метрика `manual`, `KeyShape='none'`, статус вопроса `pending`, единая функция `computeAttemptOutcome` вместо копии формулы в `facts.ts:139-140`, константы пределов длины и чистая проверка ответов. Затем схема: миграции с 0026 добавляют проекцию на `test_attempts` (`review_status`, `final_*`, `graded_at`, `passing_score`, `submit_source` и, по моей рекомендации, `auto_total_points`), заполняют 265 существующих попыток и только потом включают CHECK; в `question_types` засевается `open` с `is_active = false`. Наконец переводятся читатели: 12 серверных мест (три маршрута, сырой SQL поиска, модуль `scored-attempt`) и 17 мест web, плюс фильтр `review` и сводка `pendingTotal`.

Главные факты, которые меняют план. (1) Попытки на проверке в этой фазе нельзя создать через продукт: тип `open` неактивен, таблиц открытых ответов и проверок нет. Поэтому «последняя проверка» входит в `computeAttemptOutcome` аргументом `finalScores`, а состояние `graded` до фазы 15 достижимо только в чистом тесте функции и в напрямую засеянной строке (Открытый вопрос 1). (2) Строгий CHECK проекции ломает четыре тестовые фикстуры, вставляющие `test_attempts` только со старыми столбцами. (3) `check-exam-core-dist.mjs` сверяет список экспортов ровно, любой новый экспорт `exam-core` надо внести. (4) Шесть мета-тестов `exam-core`, перебирающих `QUESTION_UI_TEMPLATES`, упадут от одного добавления `open`. (5) Draft PATCH с 422 приведёт к бесконечному повтору очереди сохранения: черновик должен отвечать 400. (6) Фаза 10 идёт параллельно и тоже хочет миграцию 0026: нумерацию нужно развести.

**Primary recommendation:** волны в порядке `характеризация + ADR-0006 → exam-core → миграция + schema.ts + манифест → scored-attempt (функция итога, писатель, attemptResultColumns, входная проверка) → серверные читатели и защиты OPEN-02 → web (вид результата, компоненты, читатели, 422) → сид, поведенческий тест, e2e, документы`; читатели переводить только после того, как `exam-core` и миграция собраны и применены в тестовой базе.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Формула итога, шаблон `open`, пределы длины, чистая проверка ответов | `packages/exam-core` | — | ADR-0002: логика шаблонов один раз; web и сервер импортируют те же константы |
| Хранение проекции, CHECK, заполнение, сид типа `open` | Database / Storage (миграции `app/server/drizzle`) | API (`schema.ts`) | Инвариант «pending ⇔ final_* NULL» должна держать база, не код |
| Единственный писатель проекции, сверка | API (`services/scored-attempt`) | — | ADR-0005: модуль «оценённая попытка» |
| Входная проверка сдачи и черновика, 422/400 | API (`scoreSubmission`, `saveSessionDraft`, `routes/tests/public.ts`) | exam-core (чистая функция) | Express владеет данными и доступом (ADR-0001) |
| Агрегаты и фильтры списка, поиск | API (`routes/tests/admin/attempts.ts`, `services/search`) | — | Фильтры и сводка считаются на сервере по всей зоне (befba10) |
| Решение «что показывать» (pending / final) | Browser / Client (`lib/tests/attempt-result-view.ts`) | API (поля) | Сервер присылает поля, web ничего не суммирует; единственное место решения |
| Метки и плитки | Browser / Client (`components/tests/attempt-result/*`) | — | UI-SPEC: копий разметки в читателях нет |
| Запреты включения и правки `open` | API (`question-types.ts`, `shared.ts`) | Browser (скрыть, заблокировать) | Клиентский запрет без серверного обходится прямым запросом |
| Правило удаления пользователя | Database (FK) + тест-каталог | Docs (ADR-0006) | Каскад работает в базе; тест охраняет новые таблицы |

## Standard Stack

Новых пакетов нет. Версии, которыми пользуется фаза, прочитаны из манифестов.

| Библиотека | Версия | Назначение | Источник |
|------------|--------|------------|----------|
| zod | `^3.24.3` | схемы `exam-core`; единственная runtime-зависимость пакета | `[VERIFIED: packages/exam-core/package.json]` `"dependencies": { "zod": "^3.24.3" }` |
| drizzle-orm | `0.45.3` | схема и запросы сервера | `[VERIFIED: app/server/package.json]` `"drizzle-orm": "0.45.3"` |
| drizzle-kit | по lockfile | генерация миграций (`drizzle:generate`) | `[CITED: .agents/skills/bio-exam-data/SKILL.md]` |
| vitest | `5.0.3` | юнит и серверные интеграционные тесты | `[VERIFIED: packages/exam-core/package.json]` |
| Playwright | по lockfile | e2e (`yarn e2e`), Chromium в кэше | `[VERIFIED: ~/Library/Caches/ms-playwright: chromium-1228, chromium-1243]` |
| oxlint | `1.86.0` | линт (`no-unused-vars` = warn) | `[VERIFIED: packages/exam-core/package.json]`, `[VERIFIED: .oxlintrc.json]` |

**Installation:** не требуется.

## Package Legitimacy Audit

Фаза не устанавливает внешних пакетов. Аудит не требуется: `Packages removed due to [SLOP]: none`, `Packages flagged [SUS]: none`. `gsd_run query package-legitimacy check` не запускался.

## Runtime State Inventory

Фаза — миграция схемы с заполнением данных; все пять категорий:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `test_attempts`: 265 строк на переезде `[CITED: ~/.claude/servers/bio-exam.md, итог переезда: «test_attempts 265»]`. Новые столбцы получают значения из старых (`final_* = earned_points, score_percentage, passed`; `auto_total_points = total_points`; `passing_score` из `tests.passing_score`). Строка `question_types` с ключом `open` — новая | **Миграция данных** (UPDATE в 0026) и **правка кода** (новые попытки пишет `projectionOf`). Это два разных шага, оба в плане |
| Live service config | Нет: Caddy, Kuma, Beszel, restic не хранят имён столбцов и типов вопросов. Единственная связь — `deploy.sh`: «незавершённые `test_sessions` за 4 часа → `DEPLOY_STOPPED`» `[CITED: bio-exam.md]` — окно выкатки без сдач | Нет |
| OS-registered state | `bio-exam-autodeploy.timer`, `autodeploy.conf`: `AUTO_MIGRATIONS=0` `[CITED: bio-exam.md]`, значит коммит с новыми файлами в `app/server/drizzle/` сам не выкатывается; приходит сообщение, выкатку делает владелец | Шаг пользователя: ручной запуск `deploy.sh` (он сам делает predeploy-дамп и миграции) |
| Secrets / env vars | Нет: новых ключей окружения нет, `check-env-contract` не затронут | Нет |
| Build artifacts / installed packages | `packages/exam-core/dist` потребляется сервером и web; после правки пакета нужен `yarn workspace @bio-exam/exam-core build`, `yarn test` и `yarn typecheck` собирают его сами (turbo `^build`) `[VERIFIED: turbo.json "dependsOn": ["^build"]]`, `[CITED: bio-exam-api SKILL]`. Образ приложения один на web, API и миграции `[CITED: bio-exam.md]` | Для одиночного `vitest run` сервера — предварительная сборка пакета |

**Шаги пользователя вне репозитория (план должен их выдать):**
1. Перед выкаткой свежая копия: `systemctl start --wait bio-exam-backup.service` (шаг записан в `bio-exam.md` для `inline-images`, тот же подходит), плюс автоматический `predeploy-*.dump` `deploy.sh`.
2. Выкатка вручную (`AUTO_MIGRATIONS=0`): `deploy.sh` применяет 0026/0027.
3. Проверка после выкатки (запрос выдаёт план):
```sql
SELECT count(*) AS attempts,
       count(*) FILTER (WHERE review_status = 'none') AS none_count,
       count(*) FILTER (WHERE final_earned_points IS DISTINCT FROM earned_points
                          OR final_score_percentage IS DISTINCT FROM score_percentage
                          OR final_passed IS DISTINCT FROM passed) AS mismatched
FROM test_attempts;
```
Ожидание: `attempts = none_count`, `mismatched = 0` `[ASSUMED]` (запрос предлагаю я, на живой базе не запускался).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | всё | ✓ | v24.17.0 | — |
| Yarn (Corepack) | всё | ✓ | 4.12.0 | — |
| PostgreSQL 17 | серверные тесты, миграции | ✓ | `with-test-db` поднял кластер `127.0.0.1` из `/opt/homebrew/bin/postgres` (`postgresql@17`) | — |
| Playwright Chromium | `yarn e2e` | ✓ | `chromium-1228`, `chromium-1243` в `~/Library/Caches/ms-playwright` | `yarn playwright install chromium` |
| CodeGraph | навигация | ✓ | `.codegraph/codegraph.db` есть | `rg` |

Блокирующих отсутствующих зависимостей нет. Базовый уровень измерен в этой сессии: `exam-core` 13 файлов / 609 тестов за 0,34 с; сервер `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`: 82 файла / 1702 теста, 64,5 с (всего 1:09); web `yarn workspace @bio-exam/web test`: 81 файл / 1208 тестов, 10 с `[VERIFIED: запуск 2026-10-06]`.

## Verified Facts (источник истины, прочитан в этой сессии)

### Схема и миграции

- Последняя миграция — 0025. `[VERIFIED: app/server/drizzle/meta/_journal.json, хвост]` `"idx": 25, ... "tag": "0025_teacher_zones", "when": 1791139459249`. Следующая получает `idx: 26`; `when` обязан быть строго больше `1791139459249` (проверка этапа `manifest`).
- Манифест: `[VERIFIED: app/server/drizzle/migrations-manifest.json, хвост]` запись `{ "idx": 25, "tag": "0025_teacher_zones", "file": "0025_teacher_zones.sql", "sha256": "2dbe4592…", "when": 1791139459249, "breakpoints": true }`. **Записи пишутся вручную:** в `scripts/check-migrations.mjs` и README писателя нет (проверено поиском `--write`, `writeManifest`), в `git log` манифест правился вместе с каждой миграцией. Рецепт: `drizzle:generate` → правка SQL → `sha256` файла (`shasum -a 256`) → запись манифеста с `when` из журнала → `check-migrations` (этап 1 сверяет sha256, `when`, `breakpoints`; в `__drizzle_migrations.hash` ложится тот же sha256, это проверяет `attempt-session-migration.test.ts:219-224`). Весь рецепт `[ASSUMED]` как последовательность действий, элементы проверки `[VERIFIED: scripts/check-migrations.mjs:138-226]`.
- `test_attempts` (`schema.ts:477-520`): `[VERIFIED]` `answers: jsonb('answers').notNull()`, `results: jsonb('results').notNull()`, `earnedPoints: real('earned_points').notNull()`, `totalPoints: real('total_points').notNull()`, `scorePercentage: real('score_percentage').notNull()`, `passed: boolean('passed').notNull().default(false)`, `submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow()`, `sessionId: uuid('session_id').references((): AnyPgColumn => testSessions.id, { onDelete: 'set null' })`, `resultsVersion: smallint('results_version').notNull().default(1)`, `resultsVersionCheck: check('test_attempts_results_version_check', sql\`${t.resultsVersion} IN (1, 2)\`)` (:506). FK `userIdFk` на `users.id` `.onDelete('cascade')`.
- `tests.passingScore`: `[VERIFIED: schema.ts:256-285]` `passingScore: real('passing_score')` (nullable); при `null` порога `passed = true` (`facts.ts:140`).
- Стиль миграции с заполнением: `[VERIFIED: 0022_attempt_sessions.sql]` первая строка `SET LOCAL lock_timeout = '5s';--> statement-breakpoint`, затем `ALTER TABLE ... ADD COLUMN`, затем `UPDATE`, затем ограничения. Образец сида типа: `[VERIFIED: 0020_short_answer_variants.sql]` `INSERT INTO "question_types" ("key","title","description","ui_template","validation_schema","scoring_rule","is_system","is_active") VALUES (...) ON CONFLICT ("key") DO UPDATE SET ... "is_active" = EXCLUDED."is_active"`. **Для `open` брать `ON CONFLICT ("key") DO NOTHING`**: `DO UPDATE` в стиле 0020 перезаписал бы `is_active`, когда фаза 17 включит тип.
- Живая проба `question_types` после всех миграций (на свежей базе) `[VERIFIED: проба 2026-10-06]`: ключи `checkbox, matching, radio, sequence, short_answer, short_answer_variants`, все `is_system: true`, `is_active: true`. Строки `open` нет. Значит тесты получают типы из миграций, а не из `seed.ts`, и строка `open` должна прийти миграцией.
- Что проверяет `check-migrations`: цепочка против `schema.ts` сравнивается по отпечатку таблиц, колонок, ограничений (`pg_get_constraintdef`), индексов, политик RLS; триггеры и функции в отпечаток **не входят** `[VERIFIED: scripts/lib/schema-fingerprint.mjs: ключи tables/columns/constraints/indexes/policies]`. Следствие: триггер из миграции не ломает этап 2; CHECK обязан быть описан и в `schema.ts` (`check(...)`), иначе этап 2 и этап 4 (`generate` не должен давать diff) упадут.

### Шаблоны `exam-core`

- `[VERIFIED: registry.ts:3-9]` `QUESTION_UI_TEMPLATES = ['single_choice','multi_choice','matching','short_text','sequence_digits'] as const`; `:12-19` `MISTAKE_METRICS = ['boolean_correct','set_distance','pair_mismatch_count','compact_text_equal','compact_text_in_set','hamming_digits'] as const`; `:22-28` `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE: Record<QuestionUiTemplate, MistakeMetric[]>`; `:231-237` `createDefaultScoringRuleForTemplate` («single_choice»/«short_text» → `exact_match`, correctPoints 1, иначе `one_mistake_partial` 2/1).
- `[VERIFIED: adapters/types.ts:61]` `export type KeyShape = 'option_id' | 'option_ids' | 'pairs' | 'text' | 'text_variants' | 'digits'`; `:69-80` интерфейс `TemplateAdapter` (`answerSchema`, `normalizeAnswer`, `countMistakes`, `verdicts`, `isAnswered`, `readKey`, `validateAuthoring`, `keyShape`); `adapters/index.ts:9` `TEMPLATE_ADAPTERS: Record<QuestionUiTemplate, TemplateAdapter>`.
- `[VERIFIED: attempt-result.ts:83-92]` `QuestionStatusSchema = z.enum(['ungraded', 'correct', 'partial', 'wrong'])`; `questionStatus(input: { points; isCorrect; earnedPoints })`: `points === 0` → `ungraded`, `isCorrect` → `correct`, `earnedPoints > 0` → `partial`, иначе `wrong`. `:11-14` `SUBMIT_ERROR_CODES = { alreadySubmitted: 'ATTEMPT_ALREADY_SUBMITTED', timeExpired: 'TIME_EXPIRED' }`; `:23-26` `SubmitAttemptErrorSchema = z.object({ error: z.enum([...]), attemptId: z.string().uuid().nullable().optional() })`; `:16-21` `SubmitAttemptRequestSchema.answers: z.record(z.string().uuid(), AnswerValueSchema)` (длины нет); `:139-147` `AttemptViewSchema` с `scorePercentage: z.number()`, `passed: z.boolean()`; `:94-107` `ScoredQuestionFactSchema` (`template: z.enum(QUESTION_UI_TEMPLATES)`, `metric: z.enum(MISTAKE_METRICS)`, `verdicts: QuestionVerdictsSchema.nullable()`).
- Формула итога сейчас: `[VERIFIED: facts.ts:139-140]` `const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0` и `const passed = passingScore == null ? true : scorePercentage >= Number(passingScore)`. Новая функция обязана повторить её байт в байт (вес 0 → 0 %, нет порога → `true`).
- Уже работает без правок: при `rawKey == null` `scoreQuestionFacts` возвращает `mistakes: null, key: null, verdicts: null` (`scoring.ts:146`), а адаптер с `countMistakes → MISTAKES_UNSCORABLE` даёт `earnedPoints 0`, `isCorrect false`, `maxPoints = rule.correctPoints` (`scoring.ts:98-106`). Обязательные правки: шаблонозависимый `questionStatus`, явный ранний выход `scoreQuestionFacts` для метрики `manual` (на случай случайного `answer_keys` у открытого вопроса) и принудительное `points = 3`.

### Читатели результата на HEAD (серверные)

| Файл:строки | Что читает | Правка |
|-------------|-----------|--------|
| `routes/tests/admin/attempts.ts:81-90` | сводка дашборда: `averageScore: coalesce(round(avg(scorePercentage)::numeric, 1), 0)::float`, `passedAttempts: count(*) filter (where passed)` | читать `final_*`, явный `review_status <> 'pending'`, убрать `coalesce(…, 0)`: `null`, когда нет попыток с итогом |
| `:92-114` | `latestAttempts` (earnedPoints, totalPoints, scorePercentage, passed) | `attemptResultColumns` |
| `:116-126` | `dailyActivity.averageScore` | то же, без pending |
| `:173-183` | сводка списка: `passed`, `averageScore` по `filtered` | то же |
| `:185-189` | `scopeCounts` по `visible` (без `users`) | сюда же `pendingTotal = count(*) filter (where review_status = 'pending')` |
| `:191-215` | строки списка | `attemptResultColumns` |
| `:159-169` | ответ для пустой зоны: `summary: { passed: 0, averageScore: 0 }` | `averageScore: null`, `pendingTotal: 0` |
| `:254-328` | деталь: `readAdminAttemptView` | `AttemptViewSchema` с `reviewStatus`; вопросы со статусом `pending` |
| `routes/tests/public.ts:424-431` | `attempts/me`: `earnedPoints, totalPoints, scorePercentage, passed` | `attemptResultColumns`, pending строки остаются в списке |
| `public.ts:474-489` | `chart-data`: строка `:488` `byDate.get(dateKey)!.scores.push(Math.round(a.scorePercentage ?? 0))` | `WHERE review_status <> 'pending'` + `final_score_percentage`; без `?? 0` |
| `public.ts:596-632` | submit: `scoreSubmission` → `submitAttempt` → `readAttemptView` | функция итога, проекция в INSERT |
| `routes/users/index.ts:340-356` (поля `:347-350`) | профиль: список попыток ученика | `attemptResultColumns` |
| `services/search/database-search.ts:406` | `(te.title \|\| ' · ' \|\| round(ta.score_percentage::numeric)::text \|\| '%') as title` | у pending заголовок без процента |
| `:407-408` | `case when ta.passed then 'Сдано' else 'Не сдано' end` (subtitle, snippet_source) | у pending `'На проверке'` |
| `:418-419, :429-431` | `ta.score_percentage::text` и `case when ta.passed …` в поисковой строке и `similarity` | заменить на `ta.final_score_percentage::text` (NULL у pending: `concat_ws` его пропускает, «85» её не найдёт) и ветку `review_status = 'pending'` |
| `services/scored-attempt/read.ts:63-96` | `readAttemptRow`, `summaryOf` | `attemptResultColumns` + новые поля |
| `scored-attempt/view.ts:25-32, 70-85` | `AttemptSummary`, `buildAttemptView` | nullable поля, `reviewStatus`, авто-баллы, `template` в `ReadableFact` |
| `scored-attempt/facts.ts:96-142` | сумма баллов и формула | `computeAttemptOutcome` |
| `services/attempt-sessions/submit.ts:11-18, 143-161` | `ScoredAttemptFacts`, INSERT четырёх столбцов | + столбцы проекции |

`database-search.ts` — сырой SQL: Drizzle-объект `attemptResultColumns` в нём не применим. Нужен параллельный SQL-фрагмент (константа в `scored-attempt`, например `RESULT_SQL`), либо перевод запроса `searchAttempts` на единый фрагмент `CASE`. `[ASSUMED]` выбор; характеризация поиска (`routes/search-results.characterization.test.ts`, `services/search/database-search.test.ts`) уже есть и не должна измениться для `none`.

### Читатели (web) на HEAD

`[VERIFIED: rg по app/web на 1962edd]`

| Файл:строки | Что |
|-------------|-----|
| `lib/tests/types.ts:62-69` | `TestAttemptSummary { earnedPoints: number; totalPoints: number; scorePercentage: number; passed: boolean }` |
| `lib/progress/attempt-chart.ts:4-16, :92-94, :107` | `ProgressAttempt`, `clampPercent(value: number)`, `percent: clampPercent(attempt.scorePercentage)` |
| `lib/progress/my-attempts.ts:14-28` | `toProgressAttempt` копирует поля без проверки |
| `lib/users/api.ts:17, 69-71` | `UserAttemptsResponse = { attempts: ProgressAttempt[] }` (профиль берёт те же `ProgressAttempt`: нужен отдельный тип строки с `reviewStatus`) |
| `components/progress/AttemptBarChart.tsx:177` | `formatPercent(row.percent ?? 0)` |
| `app/(internal)/(protected)/dashboard/DashboardClient.tsx:75-78, 85, 92, 221, 224, 233, 271, 323, 340-341, 387, 392, 407, 412, 480, 487, 521` | см. ниже |
| `components/tests/TestRunner.tsx:131-134, 268-273, 390-391` | результат после сдачи и «Мои попытки» |
| `components/tests/attempt-review/AttemptReviewHero.tsx:31, 45-47, 52` | шапка разбора |
| `components/tests/attempt-review/attempt-review-utils.ts:350-370` | `getStatusLabel`, `getStatusClass`, `getStatusDotClass`; `NAV_FILTERS` :13-18 |
| `components/tests/attempt-review/AttemptQuestionsList.tsx:58-64`, `AttemptReviewSummary.tsx:42` | плашки статуса и баллов вопроса |
| `components/tests/runner-result-card.ts:5` | `CARDS: Record<QuestionStatus, RunnerResultCard>` |
| `components/users/UserProfileAssignmentsPage.tsx:745-751` | `{earned}/{total} · {N}%`, `Badge` Пройден/Не пройден |
| `tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx:209` | `formatPercent(row.scorePercentage)` |
| `admin/attempts/attempts-types.ts:12-15, 27`, `AdminAttemptsClient.tsx:83-119, 182, 250, 258` | список и сводка |
| `lib/tests/admin-api.ts:145-155` | `parseAdminAttempts`: `typeof summary.averageScore !== 'number'` → `MalformedBodyError` |
| `components/tests/attempt-lifecycle/testing.ts:123-126` | фикстура `AttemptView` |

**Неиспользуемые переменные `DashboardClient` (часть DEBT-02), живой вывод oxlint:** `[VERIFIED: ../../node_modules/.bin/oxlint -c .oxlintrc.json DashboardClient.tsx, 2026-10-06]`
```
DashboardClient.tsx:21:10  Identifier 'Area' is imported but never used
DashboardClient.tsx:21:16  Identifier 'AreaChart' is imported but never used
DashboardClient.tsx:96:7   Variable 'studentChartConfig' is declared but never used
DashboardClient.tsx:103:7  Variable 'adminStudentChartConfig' is declared but never used
DashboardClient.tsx:228:8  Variable 'studentProgress' is declared but never used
DashboardClient.tsx:238:8  Variable 'groupedTests' is declared but never used
DashboardClient.tsx:266:8  Variable 'adminStudentScores' is declared but never used
```
Два из семи (`studentProgress`, `adminStudentScores`) читают `scorePercentage`: их удаление сокращает перевод читателей. Побочно: `:340` `averageScore ? … : '—'` прячет настоящие 0 %: после перевода условие по `null`, а не по truthiness.

### Правило удаления пользователя (живая проба)

`[VERIFIED: pg_constraint на базе после 0025, 2026-10-06]` внешние ключи на `users`: `cascade` у `auth_sessions.user_id, invites.user_id, question_drafts.owner_id, rbac_user_grants.user_id, refresh_tokens.user_id, teacher_topics.teacher_id, test_assignments.user_id, test_attempts.user_id, test_sessions.user_id, user_groups.user_id, user_roles.user_id`; `set null` у всех `created_by`/`updated_by`/`assigned_by`/`owner_id` (answer_keys, invites, question_types, rbac_*, student_groups, teacher_topics, test_assignments, test_question_type_overrides, test_scoring_settings, test_timer_settings, tests, topics). **Единственное исключение:** `users.created_by → users.id` с `no action` (`users_created_by_fk`, `schema.ts:95-99`: `foreignKey({ name: 'users_created_by_fk', columns: [t.createdBy], foreignColumns: [t.id] })` без `onDelete`): удаление пользователя, создавшего других, упирается в 23503. Тест-каталог обязан иметь явный список этого исключения (или фаза решает его отдельно, вне PLAT-05).

Форма теста-каталога (интеграционный, одна временная база, миграции прогнаны):
1. Все FK на `users` из `pg_constraint` (`confrelid = 'users'::regclass`, `contype = 'f'`) имеют `confdeltype IN ('c','n')`, кроме списка `LEGACY_EXCEPTIONS = [['users','created_by']]`.
2. У каждой колонки с `set null` `attnotnull = false` (иначе удаление падает на выполнении: PG разрешает такое объявление).
3. Транзитивность: FK на `test_sessions` и `test_attempts` (таблицы, которые уходят каскадом от пользователя) имеют `c` или `n`. Сегодня: `test_attempts.session_id` и `test_sessions.attempt_id` — оба `set null`.
4. Поведенческий случай: пользователь с попыткой, сессией, назначением, группой и авторством теста удаляется; строки пользователя исчезают, авторство обнуляется.

Условие D-14 «файлы удаляются явно до строк» относится к таблицам, которых ещё нет (фото — фаза 12). В фазе 9 тест покрывает существующие таблицы и столбцы проекции; для новых таблиц он начнёт работать, когда фаза 10 и далее добавят миграции. Правило записывается в **ADR-0006** (формат `status: Accepted` / `date` как у ADR-0005 `[VERIFIED: docs/adr/0005-decompose-by-concept.md]`) и в строку маршрутизации `AGENTS.md`. Тест `check-docs-structure.test.mjs` перечисляет только шаги `verify`, навыки и пять шаблонов; ADR он не считает.

## Architecture Patterns

### Диаграмма потока: сдача и чтение

```
POST /api/tests/public/tests/:id/submit  (routes/tests/public.ts:560)
  │ SubmitAttemptRequestSchema (конверт)                       exam-core
  ▼ checkAttemptAccess → precheckSubmit (submitted/closed/expired)   [реплей возвращается здесь]
  ▼ scoreSubmission (services/scored-attempt/facts.ts)
  │    ├─ грузит questions + getQuestionTypeMapForTest({includeInactive:true})
  │    ├─ findAnswerViolation(answers, questions)  ──► {ok:false, reason} ──► 422 ANSWERS_INVALID
  │    ├─ type_not_configured ─────────────────────► 422 ANSWERS_INVALID/unknown_question_type
  │    ├─ scoreQuestionFacts по вопросам (open → points 3, earned 0, pending)
  │    └─ computeAttemptOutcome({facts, finalScores: пусто, passingScore})
  ▼ submitAttempt (attempt-sessions/submit.ts) — одна транзакция
  │    INSERT test_attempts (факты + projectionOf(outcome))   ◄── CHECK проверяет базу
  ▼ readAttemptView → AttemptView (reviewStatus, nullable итог, автобаллы)

Чтение:  SQL ─ attemptResultColumns (Drizzle) | RESULT_SQL (поиск, сырой SQL)
         ▼ JSON ──► web: attempt-result-view.ts → {kind:'pending'|'final'} → ReviewStatusChip / AttemptReviewLine / TeacherCheckedMark
```

### Рекомендуемая структура

```
packages/exam-core/src/
├── adapters/open.ts            # openAdapter (answerSchema z.string(), keyShape 'none', verdicts бросает)
├── outcome.ts                  # computeAttemptOutcome, projectionOf, типы OutcomeFact/AttemptOutcome
├── answer-limits.ts            # SHORT_TEXT_MAX_LENGTH, OPEN_TEXT_MAX_LENGTH, findAnswerViolation, коды причин
app/server/src/services/scored-attempt/
├── outcome.ts                  # materializeAttemptOutcome(tx, {attemptId, latestScores}), reconcileOutcomes
├── columns.ts                  # attemptResultColumns, RESULT_SQL
app/server/src/services/attempt-sessions/ …           # submit.ts: INSERT с проекцией
app/web/components/tests/attempt-result/{ReviewStatusChip,TeacherCheckedMark,AttemptReviewLine}.tsx
app/web/lib/tests/attempt-result-view.ts
docs/adr/0006-user-deletion-rule.md
```
Имена и размещение — решение планировщика, содержание контрактов — обязательное (UI-SPEC, CONTEXT).

### Модель результата

- **Факты (неизменяемы):** `answers`, `results`, `results_version`, `earned_points`, `total_points`, `score_percentage`, `passed`. `earned_points` для попытки с открытыми вопросами = автобаллы (открытый факт даёт 0); `total_points` включает 3 за каждый открытый вопрос.
- **Проекция (пересчитываемая):** `review_status ('none'|'pending'|'graded')`, `final_earned_points`, `final_score_percentage`, `final_passed`, `graded_at`, `passing_score` (порог на момент сдачи), `submit_source ('client'|'deadline')` из CONTEXT; плюс **`auto_total_points` (моя рекомендация, не в CONTEXT и не в DDL-наброске `ARCHITECTURE.md` §4)**.
- **Почему нужен `auto_total_points`.** UI-SPEC требует `autoEarnedPoints/autoTotalPoints` во всех списках; `autoEarned = earned_points` как есть, а `autoTotal = total_points − Σ points открытых фактов`. Список не может вывести это из `results`: `RESULTS_READ_CHECKS` в `scripts/attempt-integrity-guards.test.mjs` запрещает `testAttempts.results` вне `services/scored-attempt` `[VERIFIED: файл, массив RESULTS_READ_CHECKS]`. Явный столбец, который пишет `projectionOf`, снимает проблему. Для существующих попыток `auto_total_points = total_points` `[ASSUMED]`.
- **CHECK, который я рекомендую** (строже наброска: исключает частично-NULL итог):
```sql
CHECK (
  (("final_earned_points" IS NULL) = ("review_status" = 'pending'))
  AND (("final_score_percentage" IS NULL) = ("review_status" = 'pending'))
  AND (("final_passed" IS NULL) = ("review_status" = 'pending'))
)
```
  Набросок из `ARCHITECTURE.md` (`pending = (a IS NULL AND b IS NULL AND c IS NULL)`) пропускает строку `none` с одним NULL: при `pending = false` левая часть `false` равна `false` правой части, когда хотя бы один столбец не NULL. `[ASSUMED]` вывод по логике выражения, на базе не проверялся.
  Плюс `CHECK (review_status IN ('none','pending','graded'))` и `CHECK (submit_source IN ('client','deadline'))`; опционально `CHECK ((review_status = 'graded') = (graded_at IS NOT NULL))` `[ASSUMED]`.
- **«Единственный писатель».** CHECK немедленный (у CHECK нет `DEFERRABLE`), поэтому INSERT попытки сам обязан нести столбцы проекции. Единственность достигается так: одна чистая `projectionOf(outcome)` в `exam-core` даёт значения столбцов; её применяют INSERT в `submitAttempt` и UPDATE в `materializeAttemptOutcome`. Отдельный UPDATE после INSERT при CHECK невозможен.
- **Заполнение значений для существующих попыток** (`[ASSUMED]`, выбор планировщика): `final_* = earned_points, score_percentage, passed`; `auto_total_points = total_points`; `passing_score = tests.passing_score` на момент миграции (приближение: реальный порог на момент сдачи неизвестен); `graded_at = NULL` у `none`; `submit_source = 'client'`. Риск приближения: если порог теста менялся после сдачи, пересчёт `computeAttemptOutcome` для старой попытки даст другой `passed`, чем сохранённый. Поэтому `reconcileOutcomes` сверяет `none`-попытки с четырьмя фактовыми столбцами, а не с пересчётом по `passing_score`; пересчёт по снимку применяется к попыткам, созданным новым кодом.

### Функция итога

Сигнатура (рекомендация, `[ASSUMED]`):
```ts
type OutcomeFact = { questionId: string; template?: QuestionUiTemplate; points: number; earnedPoints: number }
type AttemptOutcome = {
  reviewStatus: 'none' | 'pending' | 'graded'
  autoEarnedPoints: number
  autoTotalPoints: number
  totalPoints: number
  final: { earnedPoints: number; scorePercentage: number; passed: boolean } | null
}
computeAttemptOutcome(input: { facts: OutcomeFact[]; finalScores: ReadonlyMap<string, number>; passingScore: number | null }): AttemptOutcome
```
Правила: открытый факт = `template === 'open'`; нет открытых → `none`, итог из автофактов; есть открытый без записи в `finalScores` → `pending`, `final: null`; все открытые оценены (в том числе системным нулём `auto_empty`, он приходит как `0`) → `graded`. Балл открытого ограничивается `0..3`. Формула процента и порога — как в `facts.ts:139-140`. У фактов версии 1 (`readLegacyFacts`) `template` отсутствует, они всегда не открытые.

### Входная проверка сдачи (RES-05)

- **Где разбираются ответы.** Конверт: `SubmitAttemptRequestSchema.safeParse(req.body)` в `public.ts:566`; список вопросов и их типов уже загружает `scoreSubmission` (`facts.ts:52-69`). Проверка встаёт между загрузкой типов и подсчётом: `findAnswerViolation({ answers, questions: [{id, template}] })` из `exam-core`. Реплей идемпотентной сдачи возвращается раньше (`public.ts:586-589`) и не перепроверяется.
- **Что пишется сейчас.** `submitAttempt` кладёт в `answers` весь присланный словарь (`submit.ts:150`, `answers` как есть), то есть чужие `questionId` сегодня сохраняются в jsonb. Клиент уже фильтрует `knownAnswers()` по `knownQuestions` (`lifecycle.ts:602-604`), поэтому сервер отклоняет только вопросы, которых клиент не знал.
- **Пределы.** `SHORT_TEXT_MAX_LENGTH = 200`, `OPEN_TEXT_MAX_LENGTH = 5000` (D-06) в `exam-core`; длина — `string.length` (UTF-16, как `maxLength` поля ввода) `[ASSUMED]`. Для `sequence_digits` рекомендую тот же предел 200 только на сервере (UI-SPEC оставляет поле без изменений) `[ASSUMED]`. Ограничение по формату тела — `JSON_BODY_LIMIT` `'10mb'` `[VERIFIED: app.ts:22]`: без предела один ответ может занять до 10 МБ в jsonb.
- **Код ответа.** Сдача: 422 `{ error: 'ANSWERS_INVALID', reason, limit? }`, где `reason ∈ short_text_too_long | open_text_too_long | foreign_question | unknown_question_type` (имена из UI-SPEC, Поверхность 8). Это закрытый enum, который web разбирает: `SUBMIT_ERROR_CODES` (`attempt-result.ts:11-14`) и `SubmitAttemptErrorSchema` (:23-26) расширяются, `classifySubmitFailure` (`attempt-submit-flow.ts:70-79`) получает ветку `answers-invalid` **до** общего `return { kind: 'retry' }`, но порядок существующих 409/`TIME_EXPIRED`/403/404 не меняется.
- **Черновик.** `PATCH …/sessions/:sessionId/answers` пишет любой `questionId/value` (`sessions.ts:121-151`). Предел и чужой вопрос проверяются в `saveSessionDraft` (одна индексированная выборка вопроса теста), результат `'invalid'`. **Ответ — 400**, не 422: `toSaveOutcome` (`lifecycle.ts:145-151`): `400 → reject`, `403/404 → stop`, всё остальное → `retry`; 422 ушёл бы в бесконечный повтор очереди. `[VERIFIED: lifecycle.ts:145-151]` `if (result.status === 400) return { kind: 'reject', status: 400 }`, `if (result.status === 403 || result.status === 404) return { kind: 'stop', status: result.status }`, `return { kind: 'retry' }`.
- **Неизвестный тип (4xx вместо 500).** Сейчас `type_not_configured` → `public.ts:616` `return res.status(500).json({ error: \`Question type is not configured: ${scored.type}\` })`. Отображение: 422 `ANSWERS_INVALID/unknown_question_type`. Серверное условие — вопрос ссылается на ключ, которого нет в `question_types`; другого серверно-обнаружимого признака «старой вкладки» нет (клиент версию не шлёт). `GET`-списки вопросов бросают 500 на том же условии (`public.ts:316`, `:380`: `throw new Error(\`Question type is not configured: ${q.type}\`)`): вне объёма, фиксируется в Открытом вопросе 4.

### Вопросы ученику без эталона и критериев

Оба студенческих списка вопросов (`public.ts:282-334` и `:350-398`) выбирают явные столбцы (`id, type, order, points, options, matchingPairs, promptPath`): ни `explanationPath`, ни `answer_keys` туда не попадают, `criteria_path` пока не существует. Утечка сегодня невозможна; задача — закрепить границу до фазы 14: одна функция-сериализатор `studentQuestionView` с белым списком полей для обоих маршрутов (сейчас блок `questionsWithTexts` продублирован дословно) и интеграционный тест, который засевает вопрос типа `open` с лишними данными и сравнивает точный набор ключей JSON. Структурный охранник «в файле нет слова criteria» запрещён гигиеной тестов.

### Защита типа `open` (OPEN-02)

Живые факты `question-types.ts` (прочитан целиком):
- `POST /question-types` (:127): `uiTemplate: z.enum(QUESTION_UI_TEMPLATES)` — после добавления `open` админ мог бы создать **кастомный** тип с шаблоном `open`. Запретить `uiTemplate === 'open'` при создании.
- `PATCH /question-types/:key` (:182): принимает `isActive`, `scoringRule`, `uiTemplate`. Для `open`: отказ при `isActive: true` (включение только фазой 17 миграцией/ручным шагом), отказ при `scoringRule`, отличном от `{ formula: 'exact_match', mistakeMetric: 'manual', correctPoints: 3 }`. Сохранение с неизменёнными значениями (страница типа шлёт все поля) проходит.
- `PUT /question-types/tests/:id/overrides/:key` (:310) → `validateScoringRuleTemplateCompatibility` (`shared.ts:16-24`) сегодня проверяет только совместимость метрики с шаблоном. Расширить: для шаблона `open` любое `scoringRuleOverride` отклоняется (иначе `applyOverride` подставит `base.scoringRule` с другим максимумом).
- Веб-страница «Правила баллов» при сохранении шлёт `PATCH question-types/:key` по **каждому** типу из состояния `types` `[VERIFIED: admin-api.ts:312-322 saveGlobalScoringRules, ScoringSettingsPageClient.tsx:138-160 handleSave]`: скрывать `open` нужно при загрузке (фильтр по метрике `manual` в `setTypes(fresh.questionTypes…)`), а не только в разметке аккордеона; иначе PATCH для `open` уйдёт всё равно.
- Создание вопроса `open` уже блокирует `validateQuestionWithType`: `if (!resolvedType.isActive) return \`Тип вопроса отключён: ${resolvedType.title}\`` (`question-type-resolver.ts`), вызывается из `write.ts:176` и `tests-core.ts:45`. Редактор показывает `questionTypes.filter((item) => item.isActive || item.key === form.type)` (`QuestionEditor.tsx:59`).

### Фильтр и сводка (RES-04, D-09, D-10)

`AttemptsQuerySchema` (`attempts.ts:35-44`) получает `review: z.enum(['all','pending','graded']).default('all')`; `attemptFilters` (:48-67) — `eq(testAttempts.reviewStatus, query.review)` при не-`all`. Ответ: `summary: { passed, averageScore: number | null, pendingTotal }` и `rows[].reviewStatus`. Web: `AttemptsFilters` и ключ SWR `attemptsKey` (`admin-api.ts:93-106`) получают `review` (при `all` параметр не отправляется), `DEFAULT_ATTEMPTS_FILTERS` и `parseAdminAttempts` обновляются, e2e-мок `attempts-list.spec.ts` (`summary: { passed: 0, averageScore: 50 }`) — тоже.

### Anti-Patterns to Avoid

- **Обновлять `score_percentage`/`passed` после проверки.** Противоречит Core Value; факты читают только фактовые читатели (`readAttemptView` для разбора).
- **`?? 0`, `clampPercent(null)`, `Number(null)`.** `Number(counts?.averageScore ?? 0)` в `attempts.ts:132,142,244` превращает `null` в 0.
- **Фильтр `pending` в UI вместо SQL** — список и сводка считаются по всей зоне на сервере.
- **Копия разметки метки в читателях** (UI-SPEC: три компонента, четвёртого стиля нет).
- **Тесты-охранники по тексту исходников.** Охрана `RESULTS_READ_CHECKS` уже есть; новых не добавлять.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Итог попытки | вторую копию формулы в SQL/маршруте/web | `computeAttemptOutcome` из `exam-core` | ADR-0002; сейчас формула одна в `facts.ts:139-140`, в фазе она переезжает, а не размножается |
| Значения столбцов проекции | `UPDATE` отдельно от INSERT | `projectionOf(outcome)` в обоих местах | CHECK немедленный |
| Список столбцов результата в запросах | россыпь `testAttempts.scorePercentage` | `attemptResultColumns` | единственная защита от забытого читателя без структурных тестов |
| Предел длины, пересчёт «80 % предела» | числа в тексте | константы `exam-core` | UI-SPEC: числа 200 и 5 000 берутся из констант |
| Вид «на проверке» в web | условия `scorePercentage == null` в каждом компоненте | `attempt-result-view.ts` | единственное место решения |
| Каталог FK для PLAT-05 | список таблиц руками | запрос к `pg_constraint` | новые таблицы попадают в проверку без правки теста |
| Миграционный дифф | ручное DDL без `schema.ts` | `drizzle:generate`, затем ручная правка файла | этапы 2 и 4 `check-migrations` |

**Key insight:** фаза не пишет новой инфраструктуры; сложность в количестве мест, где число было `number`, а теперь `number | null`. TypeScript заставит показать все web-места, но не SQL: для SQL опора — `attemptResultColumns` и один поведенческий тест по всем читателям.

## Common Pitfalls

### Ловушка 1: строгий CHECK ломает четыре тестовые фикстуры
**Что идёт не так:** `INSERT INTO test_attempts` только со старыми столбцами даёт `review_status = 'none'` и `final_* NULL`, CHECK падает (23514), а `auto_total_points NOT NULL` (если сделан таким) падает раньше.
**Где:** `[VERIFIED: rg]` `services/question-content/move-remove.test.ts:155`, `routes/tests/admin-attempts-list.test.ts:69` (105 вставок в `beforeAll`), `services/access-policy/zone-store.test.ts:158` (Drizzle `.insert(testAttempts)`), `routes/tests/attempt-review.test.ts:78` (Drizzle). Миграционный тест `attempt-session-migration.test.ts:154` вставляет до миграции и не затронут. Остальные серверные тесты создают попытки HTTP-сдачей (`attempt-world.ts`, `teacher-zone-world.ts`) и пройдут сами.
**Как избежать:** общий помощник `insertAttemptFixture` в `test-support` (проекция `none` из переданных фактов); Drizzle-вставки правятся на уровне типов, SQL-вставки падают в рантайме. Запасной вариант без правки фикстур — триггер `BEFORE INSERT`, достраивающий `final_*`/`auto_total_points` для `review_status = 'none'`: дублирует правило и прячет логику, рекомендую только если пользователь захочет нулевую правку фикстур `[ASSUMED]`.
**Признак:** 23514 `test_attempts_review_projection_check` в первом же серверном прогоне после миграции.

### Ловушка 2: мета-тесты `exam-core`, перебирающие все шаблоны
Добавление `open` ломает шесть мест `[VERIFIED: чтение файлов]`: `registry.test.ts:94-96` (таблица `metricTemplateRows` должна покрывать `MISTAKE_METRICS`, нужна строка `manual → open`) и `:98-100` (`Object.keys(ALLOWED_MISTAKE_METRICS_BY_TEMPLATE)` равно `[...QUESTION_UI_TEMPLATES]` по порядку: `open` последним и там и там); `answer.test.ts:23-35` (≥ 3 строк `ANSWER_SHAPE_CASES` на шаблон, есть принимаемая и отклоняемая); `review.test.ts:158-169` (`isAnswered` true и false на шаблон); `authoring.test.ts:43-56` (группы `AUTHORING_CASE_GROUPS`: проходящая и отклоняющая строка); `invariants.test.ts:202-209` (строка шаблона в `ROWS`) и `:211-229` (у каждого шаблона `mistakes === 0` и `mistakes > 0` — для `open` невозможно); `attempt-result.test.ts:200-203` (`assert.deepEqual(QuestionStatusSchema.options, ['ungraded','correct','partial','wrong'])`).
**Как избежать:** ввести `AUTO_SCORED_TEMPLATES` (шаблоны с автометрикой) в `registry.ts` и перебирать его в `invariants`/`review`-мета-тестах; для `open` — свои строки в `answer`/`authoring`/`isAnswered` таблицах (3–4 строки на каждую), `registry`-таблица получает `manual`, статус-тест — пять значений. Не удалять мета-тесты и не ослаблять их.

### Ловушка 3: точный список экспортов
`scripts/check-exam-core-dist.mjs` `diffNames` падает и на **лишних** экспортах `[VERIFIED: файл, функция diffNames: «лишние экспорты»]`. Каждый новый экспорт (`computeAttemptOutcome`, `projectionOf`, `openAdapter`, `OPEN_TEXT_MAX_LENGTH`, `SHORT_TEXT_MAX_LENGTH`, `findAnswerViolation`, `AUTO_SCORED_TEMPLATES`, …) вносится в `EXPECTED_EXPORTS`; шаг идёт в CI (`check-ci-workflow.mjs:63`), не в `yarn verify`. `scripts/exam-core-no-private-copies.test.mjs` содержит список имён, которых не должно быть в `app/web` и `app/server/src`: новые имена добавить, чтобы копии не появились.

### Ловушка 4: старый тест, считавший `pending` неизвестным статусом
`app/web/components/tests/runner-result-card.test.ts:21-26` проверяет `runnerResultCard('pending' as unknown as QuestionStatus)` → «Без оценки». После добавления `pending` в `QuestionStatus` значение известное: `CARDS: Record<QuestionStatus, RunnerResultCard>` (`runner-result-card.ts:5`) перестаёт компилироваться и тест требует переписать (взять любое другое неизвестное значение, как `'skipped'` в `attempt-result.test.ts`).

### Ловушка 5: `questionStatus` не знает шаблона
`buildQuestionView` вызывает `questionStatus(fact)`, где `fact` — `ReadableFact` без `template` (`view.ts:11-21, 65`). Для `open` вернулось бы `wrong`. Нужны: `template` в `ReadableFact` (`readableFromStored` его знает, `legacyFact` — нет: поле необязательное), ветка `template === 'open' → 'pending'` до `points`-правила (оставить `points === 0 → ungraded`, порядок решает планировщик, UI-SPEC требует нейтральный `pending`). Тип `QuestionStatus` растёт и в `QuestionCard.tsx:34` (рукописное объединение шаблонов).

### Ловушка 6: 422 на черновике = бесконечный повтор
См. «Входная проверка»: черновик отвечает 400.

### Ловушка 7: два параллельных плана за одно имя миграции
`ROADMAP.md`: фазы 9 и 10 идут параллельно; обе хотят следующий номер (0026). Журнал требует строго возрастающий `when` и последовательный `idx`. План 1 фазы 9 фиксирует занятость 0026/0027; фаза 10 берёт 0028+ или пересобирает свой файл поверх (`drizzle:generate` пересчитает снимок). Записать в план как предусловие `[ASSUMED]`.

### Ловушка 8: `averageScore` и `coalesce`
`attempts.ts:85,120,177` `coalesce(round(avg(...)::numeric, 1), 0)::float` — убрать `coalesce`, иначе «нет попыток с итогом» выглядит как 0 %. На web `parseAdminAttempts` (`admin-api.ts:151`) отвергает не-число: парсер и его тест (`admin-api.test.ts:542-557`) обновить. `pendingTotal` считается под `visible`, а не `filtered` (`attempts.ts:185-189`).

### Ловушка 9: сырой SQL поиска
`database-search.ts:406-431`: см. таблицу читателей. Забыть `:418-419` значит, что «85» продолжит находить попытку по предварительному проценту.

### Ловушка 10: `buildAttemptView` и `AdminAttemptViewSchema.parse`
`AttemptViewSchema` (`attempt-result.ts:139-147`) и `AdminAttemptViewSchema` (`:149-154`) растут nullable полями и `reviewStatus`; их разбирает `readAdminAttemptView` через `parse` (`read.ts:112`): неполное значение даёт 500. Фикстуры `AttemptView` в web (`attempt-lifecycle/testing.ts:123-126`) и типы `AttemptReviewData`, `TestAttemptSummary`, `AdminAttemptListItem`, `ProgressAttempt`, `AdminDashboardAttempt` меняются вместе.

### Ловушка 11: `check-exam-core-dist` и сборка пакета перед серверными тестами
Одиночный `vitest run <файл>` сервера потребляет `packages/exam-core/dist`: после правок пакета сначала `yarn workspace @bio-exam/exam-core build`.

### Ловушка 12: неиспользуемые переменные превращаются в ошибки ревью
`no-unused-vars` — `warn` (не падает), но DEBT-02 требует чистого вывода: удалить 7 перечисленных объектов, не заглушать `_`.

## Code Examples

### Заполнение и CHECK в миграции (форма, не буквальный SQL)
```sql
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "final_earned_points" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "final_score_percentage" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "final_passed" boolean;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "passing_score" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "auto_total_points" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "submit_source" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
UPDATE "test_attempts" AS ta SET "final_earned_points" = ta."earned_points", "final_score_percentage" = ta."score_percentage", "final_passed" = ta."passed", "auto_total_points" = ta."total_points", "passing_score" = (SELECT t."passing_score" FROM "tests" t WHERE t."id" = ta."test_id");--> statement-breakpoint
ALTER TABLE "test_attempts" ALTER COLUMN "auto_total_points" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_review_projection_check" CHECK (…);
```
Способ получить такой файл `[ASSUMED]`: `drizzle:generate` после правки `schema.ts` выдаёт `ADD COLUMN` и `ADD CONSTRAINT`; `UPDATE` и `SET NOT NULL` после `ADD COLUMN` (nullable) дописываются вручную **до** применения где-либо, как это сделано в 0022; итоговое состояние совпадает со `schema.ts` (этапы 2 и 4). Разделение на 0026 (столбцы + заполнение) и 0027 (CHECK) допустимо и даёт чище тест «до/после CHECK»; выбор за планировщиком. Сид `open` — отдельным оператором в конце (`INSERT … ON CONFLICT ("key") DO NOTHING`) со значением `scoring_rule` `'{"formula":"exact_match","mistakeMetric":"manual","correctPoints":3}'::jsonb`, `ui_template` `'open'`, `is_system` `true`, `is_active` `false`.

### Тест миграции с данными (образец)
Образец `app/server/src/db/attempt-session-migration.test.ts` `[VERIFIED: файл прочитан]`: временная база, миграции копируются без новых записей журнала (`prepareMigrationsUpToLastApplied`, `LAST_APPLIED_IDX = 21`), вставляются данные, затем `migrateTestDatabase(scratch.url)` применяет остальные. Для новой миграции `LAST_APPLIED_IDX = 25`; вставить попытки с разными `score_percentage`, `passed`, `total_points`, тестами с порогом и без; после миграции: `review_status = 'none'`, `final_* = факты`, `auto_total_points = total_points`, `__drizzle_migrations.hash` = sha256 манифеста, CHECK отвергает `pending` с итогом и `none` без итога (23514), `question_types` содержит `open` с `is_active = false`.

## State of the Art

| Было | Станет | Эффект |
|------|--------|--------|
| Итог попытки = четыре столбца NOT NULL на момент сдачи, формула в `facts.ts` | факты + проекция, одна функция `computeAttemptOutcome` | попытка может быть «на проверке» без процента |
| 4 статуса вопроса | + `pending` | нейтральный вид открытого вопроса |
| Ответы сохраняются как присланы | фильтр по вопросам теста + пределы | закрывает SEC-04/N3 |
| `type_not_configured` → 500 | 422 | понятный отказ |

**Deprecated:** чтение `score_percentage`/`passed` в читателях; `?? 0` на графике.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Столбец `auto_total_points` нужен и записывается проекцией (нет в CONTEXT и в DDL-наброске) | Модель результата | Без него списки не получат «авто X из Y»; альтернатива — SQL-фрагмент по `results` внутри `scored-attempt` |
| A2 | Для существующих попыток `passing_score = tests.passing_score` сейчас, `graded_at = NULL`, `auto_total_points = total_points` | Модель результата | Старые попытки с изменённым порогом дадут расхождение пересчёта; сверка `none` идёт по фактовым столбцам |
| A3 | CHECK из трёх равенств строже наброска `ARCHITECTURE.md` | Модель результата | Если пользователь хочет ровно набросок, частично-NULL итоги разрешены |
| A4 | Рецепт выпуска миграции (generate → правка SQL → sha256 → манифест) и сама правка SQL до применения | Verified Facts | Исполнитель упрётся в этап `manifest`; писателя манифеста в репозитории нет |
| A5 | Таблиц проверок в фазе 9 нет; «последняя проверка» — аргумент `finalScores` (Открытый вопрос 1) | Summary | Если таблица проверок нужна уже здесь, объём фазы вырастает (миграция, триггер append-only, удаление пользователя) |
| A6 | Столбцы `criteria_path`, `photo_upload_window_minutes`, `upload_closes_at` в фазе 9 не добавляются (CONTEXT побеждает `SUMMARY.md`) | Открытые вопросы | Если ожидаются в 9, они аддитивны и добавляются отдельной миграцией |
| A7 | Длина считается по `String.length` (UTF-16), как `maxLength` | Входная проверка | Эмодзи считаются как 2 знака в обоих местах одинаково; расхождение только с точным счётом code point |
| A8 | Для `sequence_digits` серверный предел равен 200 без изменения поля | Входная проверка | UI-SPEC не требует; редкая вставка длиннее предела даст баннер про «краткий ответ» |
| A9 | Черновик отвечает 400 с телом `ANSWERS_INVALID` | Входная проверка | Если выбрать 422, нужно учить `toSaveOutcome` |
| A10 | Серверный триггер `BEFORE UPDATE` на столбцы фактов (RES-01) | RES-01 | Это усиление, не требование; без него RES-01 держится только тестом и отсутствием писателей |
| A11 | Фаза 10 берёт номера миграций после 9 | Ловушка 7 | Конфликт `idx`/`when` при параллельной работе |
| A12 | Запрос проверки после выкатки (см. Runtime State) | Runtime State | Запрос не гонялся на живой базе |

## Open Questions (RESOLVED)

> Все вопросы закрыты решениями D-15…D-22 в `09-CONTEXT.md` (2026-10-06): 1→D-15, 2→D-16, 3→D-17, 4→D-18, 5→D-19, 6→D-20, 7→D-21 (ADR-0007, так как 0006 занят), 8→D-22 (одна миграция 0026, фаза 10 — следующий номер).

1. **(RESOLVED → D-15)** **Таблицы проверок и состояние `graded` в фазе 9.**
   - Что известно: критерий успеха 1 говорит о «последней проверке каждого открытого ответа» и о засеянных попытках с открытыми ответами; `SUMMARY.md` относит `open_answers` к фазе 12, проверки к фазе 15; в границу CONTEXT входят только столбцы проекции.
   - Что неясно: хватит ли чистого входа `finalScores` для RES-01/RES-02.
   - Рекомендация: таблицу проверок в фазе 9 не создавать. Таблица-тест функции в `exam-core` покрывает все состояния (`none`, `pending`, `graded`, системный 0, вес 0, порог `null`); серверный интеграционный тест покрывает `none` (заполненные) и `pending` (строка вставляется напрямую с фактами `open`); `graded` напрямую не достижим до фазы 15, засевать его столбцами проекции допустимо только для читателей (поведенческий тест), без рекомбинации из БД. `materializeAttemptOutcome(tx, { attemptId, latestScores })` принимает загрузчик оценок параметром, фазы 12/15 подставят свой. Написать это в плане явно.

2. **(RESOLVED → D-16)** **Столбец `auto_total_points`.** Рекомендация: добавить (A1). Решение нужно до миграции.

3. **(RESOLVED → D-17)** **Заполнение `passing_score` для старых попыток.** Рекомендация: текущий порог теста (A2); сверка `none` — по фактовым столбцам.

4. **(RESOLVED → D-18)** **Объём «неизвестный тип → 4xx».**
   - Что известно: `type_not_configured` на сдаче даёт 500 (`public.ts:616`); два `GET` бросают ошибку (`public.ts:316`, `:380`).
   - Что неясно: признак «старой вкладки» серверу недоступен.
   - Рекомендация: сдача и черновик → 4xx как в таблице; `GET`-списки оставить, зафиксировать в плане как известное ограничение.

5. **(RESOLVED → D-19)** **Триггер неизменяемости фактов (RES-01).** Рекомендация: добавить `BEFORE UPDATE`, отклоняющий изменение `answers, results, results_version, earned_points, total_points, score_percentage, passed`, пропуская `session_id` (FK `set null`) и столбцы проекции; один интеграционный тест. Триггер не входит в отпечаток `check-migrations`, этапы 2 и 4 не затронуты (A10).

6. **(RESOLVED → D-20)** **Несоответствие `SUMMARY.md` и CONTEXT по столбцам `criteria_path`, `photo_upload_window_minutes`, `upload_closes_at`.** Рекомендация: отложить (A6).

7. **(RESOLVED → D-21)** **Исключение `users.created_by`.** Рекомендация: внести в список исключений теста-каталога (`LEGACY_EXCEPTIONS`) и вынести исправление (`set null`) в фазу 18 или отдельную задачу; PLAT-05 его не требует.

8. **(RESOLVED → D-22)** **Пересечение миграций с фазой 10** (Ловушка 7): координация перед стартом.

## Validation Architecture

> `workflow.nyquist_validation: true` `[VERIFIED: .planning/config.json]`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `5.0.3` (exam-core, server, web), `node --test` (scripts), Playwright (e2e) |
| Config | `app/server/vitest.config.ts` (`include: ['src/**/*.test.ts']`, `env: { BIO_EXAM_ISOLATED_ENV: '1' }`), `app/web/vitest.config.ts` (environment `node`, только `*.test.ts`) |
| Quick run (exam-core) | `yarn workspace @bio-exam/exam-core test` (0,34 с, 609 тестов) |
| Quick run (один файл сервера) | `yarn workspace @bio-exam/exam-core build && node scripts/with-test-db.mjs yarn workspace @bio-exam/server exec vitest run src/<путь>.test.ts` `[ASSUMED]` форма вызова |
| Full server | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` (измерено: 82 файла, 1702 теста, 64,5 с) |
| Full web | `yarn workspace @bio-exam/web test` (81 файл, 1208 тестов, 10 с) |
| Phase gate | `yarn verify` (до `yarn verify: OK`) и отдельно `yarn e2e`; `node scripts/check-exam-core-dist.mjs` в CI |

Гигиена тестов `[CITED: memory test-hygiene]`: новые проверки — серверные интеграционные и e2e; юнит-тесты — только для логики с многими вариантами (формула итога, проверка ответов, вид результата, разбор данных); без структурных охранников.

### Phase Requirements → Test Map

| Req ID | Поведение | Тип | Команда / файл | Файл есть? |
|--------|-----------|-----|----------------|-----------|
| RES-02 | `computeAttemptOutcome`: `none`/`pending`/`graded`, системный 0, вес 0 (процент 0, `passed` по порогу), порог `null` → `true`, балл открытого 0..3, пересчёт `projectionOf` | юнит-таблица `test.each` | `packages/exam-core/src/outcome.test.ts` | ❌ Wave 0 |
| RES-02 | Проекция = пересчёт для `none`: заполненные существующие попытки и попытки новой сдачи; `pending` вставлена напрямую; `reconcileOutcomes` находит расхождение, CHECK отвергает невозможные состояния (23514) | серверный интеграционный | `app/server/src/services/scored-attempt/outcome.test.ts` | ❌ Wave 0 |
| RES-02 | Миграция заполняет существующие попытки, включает CHECK, засевает `open` неактивным, sha256 манифеста | миграционный (образец `attempt-session-migration.test.ts`) | `app/server/src/db/attempt-result-migration.test.ts`, `LAST_APPLIED_IDX = 25` | ❌ Wave 0 |
| RES-01 | Повторная сдача (реплей и конфликт) не меняет строку; `UPDATE` фактов отвергнут триггером (если принят) | серверный интеграционный | расширить `routes/tests/attempt-submit.test.ts`, `attempt-stored-results.test.ts` | ✅ файлы есть, ❌ кейсы Wave 0 |
| RES-03 | **Один** поведенческий тест: попытка `pending`, вставленная напрямую, проходит через 8 читателей — `GET /api/tests/admin/attempts`, `GET /api/tests/admin/attempts/:id`, `GET /api/tests/admin/dashboard`, `GET /api/tests/public/tests/:id/attempts/me`, `GET /api/tests/public/tests/:id/chart-data`, `GET /api/users/:id/test-attempts`, `GET /api/search?scope=attempts`, `readAttemptView` (ответ сдачи/реплей): нет процента и «Сдано/Не сдано», нет в средних и `chart-data`, `pendingTotal` учтён | серверный интеграционный | `app/server/src/routes/tests/attempt-readers-pending.test.ts` | ❌ Wave 0 |
| RES-03 | Критерий 1: те же значения у существующих попыток во всех читателях до и после (характеризация `none`, снятая ДО правок читателей, ADR-0003) | серверный интеграционный | `app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` | ❌ Wave 0 (писать первым) |
| RES-03 | Вид результата `pending/final`, `auto = null` при `autoTotalPoints = 0`, `teacherChecked` | юнит-таблица (логика с вариантами) | `app/web/lib/tests/attempt-result-view.test.ts` | ❌ Wave 0 |
| RES-03 | `toProgressAttempt` и `loadMyProgressAttempts` отбрасывают `pending`, `buildAttemptBars` без `?? 0`; `parseAdminAttempts` принимает `averageScore: null` | юнит | `lib/progress/my-attempts.test.ts`, `attempt-chart.test.ts`, `lib/tests/admin-api.test.ts` | ✅ файлы есть, обновить |
| RES-03 | Web-поверхности: список (метка, `авто X из Y`, нет процента), плитка/фильтр, шапка разбора, «Мои попытки», страница теста, профиль, дашборды, поиск; 375 px | e2e | `e2e/tests/attempt-review-pending.spec.ts` (+ сид, см. ниже) | ❌ Wave 0 |
| RES-04 | `review=pending/graded`, комбинация с `status`, `pendingTotal` по зоне, среднее без pending, пустая зона `averageScore: null` | серверный интеграционный | расширить `routes/tests/admin-attempts-list.test.ts` | ✅ файл есть |
| RES-05 | Чужой вопрос, `short_text` > 200, `open` > 5000 → 422 `ANSWERS_INVALID` с `reason` и `limit`, строка попытки не создана, сессия остаётся открытой; черновик → 400; тип не настроен → 422; реплей не перепроверяется | серверный интеграционный | расширить `attempt-submit.test.ts`, `attempt-time-limit.test.ts` (черновик) | ✅ файлы есть |
| RES-05 | `findAnswerViolation` (шаблоны × границы 200/201, 5000/5001, чужой id, не строка) | юнит-таблица | `packages/exam-core/src/answer-limits.test.ts` | ❌ Wave 0 |
| RES-05 | Баннер `answers-invalid` без «Повторить», кнопка сдачи остаётся доступной (характеризация `lifecycle-submit`), порядок 409/`TIME_EXPIRED`/403/404 не изменился | юнит (lifecycle с портами) | `components/tests/attempt-lifecycle/lifecycle-submit.test.ts` + `attempt-submit-flow` | ✅ файл есть |
| OPEN-02 | Правило `open`: `manual`, максимум 3, `questionStatus` `pending`; создание вопроса типа `open` отклонено; `PATCH isActive:true` и смена правила отклонены; override отклонён; `POST` кастомного типа с шаблоном `open` отклонён; страница «Правила баллов» не шлёт `PATCH open` | серверный интеграционный + web-юнит | `app/server/src/routes/tests/admin-open-type.test.ts`, `exam-core` `scoring.test.ts` (строка `open`) | ❌ Wave 0 |
| (folded) | Студенческий ответ со списком вопросов: точный набор ключей, нет эталона, пояснения, критериев | серверный интеграционный | `app/server/src/routes/tests/student-question-payload.test.ts` | ❌ Wave 0 |
| PLAT-05 | Каталог FK на `users` (`c`/`n`, список исключений, `set null` ⇒ nullable, транзитивность) + удаление пользователя | серверный интеграционный (БД) | `app/server/src/db/user-deletion-rule.test.ts` | ❌ Wave 0 |
| (folded) | `DashboardClient` без неиспользуемых переменных | линт | `yarn workspace @bio-exam/web lint` (в `yarn verify`) | ✅ |

**Критерий 2 / сид попыток «на проверке».** Серверный тест сидирует `pending` прямой вставкой через `insertAttemptFixture` (тот же помощник, что чинит Ловушку 1: параметры `reviewStatus`, факты с `template: 'open'`). Для e2e сид `e2e-seed.ts` (292 строки; пишет роли, тему, тесты, вопросы, ключи, назначения; `getBuiltinQuestionTypeByKey(item.type)` уже примет `open`, когда он появится в `BUILTIN_QUESTION_TYPES`) получает блок `attempts` в `e2e/fixtures/seed.json` и вставку строк `test_attempts` с `review_status = 'pending'`; вопросу типа `open` не нужен `answer_keys` (поле `correct` в `SeedQuestion` сейчас обязательное: потребуется необязательное). Существующие e2e-фикстуры (`SubmitPayload`: `scorePercentage: number`, `passed: boolean`, `POINTS_BY_TYPE`) описывают сдачу без открытых вопросов и не ломаются.

### Существующие тесты, которые изменятся
`exam-core`: `registry.test.ts`, `answer.test.ts`, `review.test.ts`, `authoring.test.ts`, `invariants.test.ts`, `attempt-result.test.ts` (см. Ловушку 2). Сервер: четыре фикстуры с вставкой попыток (Ловушка 1), `admin-attempts-list.test.ts` (`expectedSummary`, форма `summary`). Web: `runner-result-card.test.ts`, `admin-api.test.ts`, `lib/progress/*.test.ts`, `attempt-review-utils.test.ts` (`getStatusLabel`, `getStatusClass`), `review-viewers.test.ts` и его снимок при изменении `AttemptView`, e2e `attempts-list.spec.ts` (мок).

### Sampling Rate
- **После каждой задачи:** файл теста затронутого модуля (`exam-core` — весь пакет, 0,34 с).
- **После каждой волны:** `yarn workspace @bio-exam/exam-core test` + `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` (≈ 65 с) + `yarn workspace @bio-exam/web test` + `yarn typecheck` + `yarn lint`.
- **Phase gate:** `yarn verify: OK` (нулевой запуск тестов считается провалом), затем `yarn e2e` (новый спек на desktop и mobile `Pixel 7`), `node scripts/check-exam-core-dist.mjs` после сборки.

### Wave 0 Gaps
- [ ] `packages/exam-core/src/outcome.test.ts`, `answer-limits.test.ts`
- [ ] `app/server/src/db/attempt-result-migration.test.ts`, `user-deletion-rule.test.ts`
- [ ] `app/server/src/services/scored-attempt/outcome.test.ts`
- [ ] `app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` (до правок), `attempt-readers-pending.test.ts`, `student-question-payload.test.ts`, `admin-open-type.test.ts`
- [ ] помощник `insertAttemptFixture` в `app/server/src/test-support`
- [ ] `app/web/lib/tests/attempt-result-view.test.ts`
- [ ] `e2e/tests/attempt-review-pending.spec.ts` и сид `attempts` в `e2e/fixtures/seed.json` + `e2e-seed.ts`
- [ ] Установка фреймворка не нужна.

## Security Domain

`security_enforcement` в `.planning/config.json` не отключён, раздел включён.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | нет | без изменений |
| V3 Session Management | нет | без изменений |
| V4 Access Control | да | читатели остаются за `testScope`/`canReadTest`/`canReviewAttempt`; новый параметр `review` не расширяет охват; `pendingTotal` считается в `visible`; запрет включения `open` на сервере |
| V5 Input Validation | да | `zod` на конверте и параметре `review` (`z.enum`); `findAnswerViolation` по вопросам теста и пределам |
| V6 Cryptography | нет | — |
| V7 Error Handling | да | понятный 422/400 без 500, без стека |
| V8 Data Protection | да | вопросы ученику только по белому списку полей; критерии/эталон не в студенческих ответах; «предварительно X из Y» — осознанное решение пользователя |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Чужие `questionId` в jsonb `answers` (раздувание, подмена показа в разборе админа) | Tampering | фильтр по вопросам теста, 422 `foreign_question` |
| Ответ в мегабайты внутри лимита `10mb` тела | Denial of Service | пределы `200`/`5000`, 422 |
| Включение `open` или правка максимума прямым запросом к API | Elevation / Tampering | серверные запреты в `question-types.ts` и `shared.ts`, а не только скрытие в UI |
| Процент pending в поиске («85») | Information Disclosure | `final_score_percentage::text` вместо фактового столбца; тест поиска |
| Утечка критериев/эталона студенту | Information Disclosure | `studentQuestionView` + тест точного набора ключей |
| Потеря/перезапись автофактов | Tampering | единственный INSERT, триггер `BEFORE UPDATE`, тест реплея |
| SQL-инъекция в поиске | Tampering | значения параметризованы (`$1…$4`), новая ветка `pending` статическая |

## Project Constraints (from CLAUDE.md)

`CLAUDE.md` → `AGENTS.md`, плюс глобальные правила пользователя. Для плана обязательно:
- CodeGraph первым: `codegraph explore`, `codegraph node`, `codegraph impact <symbol>` перед правкой символа (с отчётом о затронутых вызывающих), `codegraph affected <files>` для выбора тестов.
- Агенты **не коммитят**; изменения остаются в рабочем дереве, готово к коммиту.
- Работа с БД (тесты, миграции, скрипты) только против одноразовой `test_*` через `node scripts/with-test-db.mjs`; `DATABASE_URL` из `.env` не использовать. Применённые миграции не правятся: только новые файлы (`yarn workspace @bio-exam/server drizzle:generate`), запись в `migrations-manifest.json`.
- **Комментарии в коде не писать.** Сообщения и документы на русском; идентификаторы, команды, пути как есть.
- Новый ключ окружения требует записи в `.env.example` (здесь не ожидается).
- В документе команда `yarn …` должна существовать (`scripts/check-docs-commands.mjs`); `jobs:run reconcile-outcomes` в README фазы не упоминать до фазы 11.
- `yarn verify` должен быть зелёным перед закрытием; нулевой запуск тестов — провал.
- Форматирование — отдельным коммитом, не смешивать с поведением (`yarn format` / `yarn format:check`).
- Навыки `bio-exam-api`, `bio-exam-data`, `bio-exam-web` прочитаны и учтены; после фазы обновить: `bio-exam-data` («последняя - 0025»), `bio-exam-api` (модуль `scored-attempt`, пять шаблонов → шесть), `AGENTS.md` (строка про правило удаления), `app/server/README.md` (перечень шаблонов; тест `check-docs-structure` требует лишь пять прежних).
- Тесты: серверные интеграционные и e2e; юниты — для логики с вариантами; `test.each` с таблицами (имена обрезаются Vitest до 40 символов `$name`; в web `%s`), без структурных охранников.
- Охраны, которые план не должен нарушить: `RESULTS_READ_CHECKS` (`testAttempts.results` только в `services/scored-attempt`); в web-коде фазы нет `computeVerdicts(`, `results: unknown[]`, тернара `earnedPoints > 0 ?` (`attempt-integrity-guards.test.mjs`, `WEB_TESTS_DIRS` включает `app/web/lib/tests` и `app/web/components/tests`); `scripts/tests-router-composition.test.mjs` (новых обработчиков в `routes/tests/index.ts` нет); новых маршрутов нет, `route-inventory.txt` не меняется.
- Правило ссылок на UI-SPEC: контраст меток измерять по вычисленным стилям в браузере, не по таблице токенов.
- Flaky: `yarn verify` изредка падает на unhandled 57P01 при зелёных тестах (память `flaky-answer-keys-jsonb`): повторить прогон, не чинить код вслепую.

## Рекомендуемый порядок волн (подсказка планировщику)

| Волна | Содержание | Зависит от |
|-------|-----------|-----------|
| 0 | Характеризация читателей `none` (все 8) и submit до правок; ADR-0006 и тест-каталог PLAT-05; помощник `insertAttemptFixture`; запись об очерёдности миграций с фазой 10 | — |
| 1 | `exam-core`: `open`, `manual`, `KeyShape 'none'`, `pending`, `AUTO_SCORED_TEMPLATES`, `computeAttemptOutcome`, `projectionOf`, пределы, `findAnswerViolation`, коды ошибок, схемы вида; правка мета-тестов; `EXPECTED_EXPORTS`; сборка `dist` | 0 |
| 2 | `schema.ts`, миграция(и) 0026(/0027), манифест, снимок, тест миграции, правка четырёх фикстур | 1 |
| 3 | `scored-attempt`: `facts.ts` через `computeAttemptOutcome`, `outcome.ts` (`materializeAttemptOutcome`, `reconcileOutcomes`), `columns.ts` (`attemptResultColumns`, `RESULT_SQL`), `view/read`; `submit.ts` пишет проекцию; входная проверка и 422/400 | 2 |
| 4 | Серверные читатели (админ-список, дашборд, `attempts/me`, `chart-data`, профиль, поиск), `review`/`pendingTotal`, защиты OPEN-02, `studentQuestionView` (параллельно между собой) | 3 |
| 5 | Web: `attempt-result-view.ts`, три компонента, перевод читателей, `answers-invalid`, `maxLength`, страницы типов и «Правила баллов», чистка `DashboardClient` (параллельно по поверхностям) | 4 |
| 6 | Сид (серверный и e2e), поведенческий тест, e2e-спек (desktop + mobile), документы и навыки, `yarn verify`, `yarn e2e`, шаги пользователя | 5 |

Пока нет попыток «на проверке» (тип неактивен), перевод читателей безопасен в любом порядке, но **фаза 14 не стартует до закрытия всей фазы 9** (ROADMAP).

## Sources

### Primary (HIGH confidence)
- Код на `1962edd` (`dev`), прочитан в этой сессии: `app/server/src/db/schema.ts`, `services/attempt-sessions/{submit,sessions}.ts`, `services/scored-attempt/{facts,read,view,storable-fact,legacy,legacy-fact,index}.ts`, `routes/tests/{public.ts,admin/attempts.ts,admin/question-types.ts,admin/scoring-rules.ts,admin/shared.ts,index.ts}`, `routes/users/index.ts:300-380`, `services/search/database-search.ts:360-470`, `lib/tests/question-type-resolver.ts`, `test-support/{attempt-world,test-database,auth-app}.ts`, `db/attempt-session-migration.test.ts`, `scripts/e2e-seed.ts:1-120`; `packages/exam-core/src/{registry,attempt-result,scoring,review,authoring,attempt-session,telemetry,index}.ts`, `adapters/{types,index,short-text}.ts` и все тесты-перебиратели шаблонов; web: `lib/progress/*`, `lib/tests/{types,api,admin-api,format}.ts`, `components/tests/{TestRunner,QuestionInput,attempt-submit-flow,runner-result-card}.ts(x)`, `attempt-lifecycle/lifecycle.ts` (фрагменты), `attempt-review/*`, `DashboardClient.tsx`, `AdminAttemptsClient.tsx`, `attempts-types.ts`, `TestLandingPageClient.tsx`, `UserProfileAssignmentsPage.tsx` (фрагменты), `ScoringSettingsPageClient.tsx`, `QuestionTypeDetailsPageClient.tsx` (фрагменты).
- Живые пробы 2026-10-06 на одноразовой базе `with-test-db`: `pg_constraint` (FK на `users`), `question_types`, `oxlint` на `DashboardClient.tsx`, базовые прогоны `exam-core` (609), сервер (1702), web (1208).
- `scripts/{check-migrations.mjs,check-exam-core-dist.mjs,attempt-integrity-guards.test.mjs,check-docs-structure.test.mjs,verify.mjs,lib/schema-fingerprint.mjs}`, `app/server/drizzle/{meta/_journal.json,migrations-manifest.json,0020,0022,0023}`, `docs/adr/0005`, `AGENTS.md`, `.agents/skills/*/SKILL.md`, `turbo.json`, `.planning/config.json`.

### Secondary (MEDIUM confidence)
- `.planning/research/{SUMMARY,ARCHITECTURE}.md` (номера строк на `1962edd` сверены с кодом: расхождений в читателях нет; DDL-набросок дополнен).
- `~/.claude/servers/bio-exam.md` (профиль сервера: выкатка, автовыкатка, бэкапы, итог переезда).

### Tertiary (LOW confidence)
- Помечено `[ASSUMED]` в Assumptions Log (A1–A12).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — нового нет, версии из манифестов
- Architecture: HIGH для точек интеграции и ломающихся мест; MEDIUM для проектных выборов (`auto_total_points`, CHECK, триггер, SQL-фрагмент поиска)
- Pitfalls: HIGH — каждая проверена чтением файла или запуском

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (код меняется быстро: сверить `git log` по перечисленным файлам перед стартом; ветка `dev` живая)
