---
phase: 05-attempt-integrity
verified: 2026-10-04T14:02:52Z
status: passed
human_verification_confirmed: "2026-10-05, пользователь"
score: 4/5 must-haves verified
covered_files:
  - ".planning/phases/05-attempt-integrity/05-01-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-01-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-02-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-02-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-03-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-03-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-04-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-04-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-05-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-05-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-06-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-06-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-07-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-07-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-08-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-08-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-09-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-09-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-10-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-10-SUMMARY.md"
  - ".planning/phases/05-attempt-integrity/05-11-PLAN.md"
  - ".planning/phases/05-attempt-integrity/05-11-SUMMARY.md"
  - "app/server/README.md"
  - "app/server/drizzle/0022_attempt_sessions.sql"
  - "app/server/drizzle/0023_attempt_results_version.sql"
  - "app/server/drizzle/meta/0022_snapshot.json"
  - "app/server/drizzle/meta/0023_snapshot.json"
  - "app/server/drizzle/meta/_journal.json"
  - "app/server/drizzle/migrations-manifest.json"
  - "app/server/src/db/attempt-session-migration.test.ts"
  - "app/server/src/db/schema.ts"
  - "app/server/src/db/session-backfill.test.ts"
  - "app/server/src/routes/tests/attempt-access-matrix.test.ts"
  - "app/server/src/routes/tests/attempt-known-defects.test.ts"
  - "app/server/src/routes/tests/attempt-races.test.ts"
  - "app/server/src/routes/tests/attempt-review.test.ts"
  - "app/server/src/routes/tests/attempt-submit.test.ts"
  - "app/server/src/routes/tests/attempt-time-limit.test.ts"
  - "app/server/src/routes/tests/attempt-view-leak.test.ts"
  - "app/server/src/routes/tests/exam-flow.test.ts"
  - "app/server/src/routes/tests/index.ts"
  - "app/server/src/routes/tests/public.ts"
  - "app/server/src/services/attempt-sessions/access.ts"
  - "app/server/src/services/attempt-sessions/index.ts"
  - "app/server/src/services/attempt-sessions/sessions.ts"
  - "app/server/src/services/attempt-sessions/submit.ts"
  - "app/server/src/services/scored-attempt/facts.ts"
  - "app/server/src/services/scored-attempt/index.ts"
  - "app/server/src/services/scored-attempt/legacy-fact.ts"
  - "app/server/src/services/scored-attempt/legacy.test.ts"
  - "app/server/src/services/scored-attempt/legacy.ts"
  - "app/server/src/services/scored-attempt/read.ts"
  - "app/server/src/services/scored-attempt/storable-fact.ts"
  - "app/server/src/services/scored-attempt/view.test.ts"
  - "app/server/src/services/scored-attempt/view.ts"
  - "app/server/src/test-support/attempt-world.ts"
  - "app/server/src/test-support/auth-app.ts"
  - "app/web/components/tests/AttemptReview.tsx"
  - "app/web/components/tests/TestRunner.tsx"
  - "app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts"
  - "app/web/components/tests/attempt-review/AttemptQuestionsList.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewHero.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewNav.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewSummary.tsx"
  - "app/web/components/tests/attempt-review/QuestionAnswerReview.tsx"
  - "app/web/components/tests/attempt-review/__snapshots__/review-viewers.test.ts.snap"
  - "app/web/components/tests/attempt-review/attempt-review-utils.test.ts"
  - "app/web/components/tests/attempt-review/attempt-review-utils.ts"
  - "app/web/components/tests/attempt-review/review-viewers.test.ts"
  - "app/web/components/tests/attempt-submit-flow.test.ts"
  - "app/web/components/tests/attempt-submit-flow.ts"
  - "app/web/components/tests/client-attempt-id.test.ts"
  - "app/web/components/tests/client-attempt-id.ts"
  - "app/web/components/tests/runner-result-card.test.ts"
  - "app/web/components/tests/runner-result-card.ts"
  - "app/web/lib/tests/api.ts"
  - "app/web/lib/tests/types.ts"
  - "e2e/fixtures/exam.ts"
  - "e2e/tests/review.spec.ts"
  - "packages/exam-core/src/attempt-result.test.ts"
  - "packages/exam-core/src/attempt-result.ts"
  - "packages/exam-core/src/index.ts"
  - "packages/exam-core/src/scoring.test.ts"
  - "packages/exam-core/src/scoring.ts"
  - "scripts/attempt-integrity-guards.test.mjs"
  - "scripts/check-exam-core-dist.mjs"
  - "scripts/check-migrations.mjs"
  - "scripts/exam-core-no-private-copies.test.mjs"
covered_digest: "v2:sha256:08dd0c3973b8829e16528158bb4ff03776ed3674e0f3dd4ca433622d04bbfdd4"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "«Время вышло» при возврате к тесту с лимитом решает сервер, а не часы клиента (CR-01(б,в), CR-04, CR-05)"
    addressed_in: "Phase 6"
    evidence: "Решение пользователя 2026-10-04 (05-REVIEW-DISPOSITION.md); записано в 06-CONTEXT.md:358 (модуль жизненного цикла повторяет submit с сохранённым clientAttemptId, 200 → результат, 422 → диалог). ROADMAP Phase 6 SC4: «lifecycle module owns draft format, telemetry and reset»"
  - truth: "Свои попытки по снятым назначениям скрыты в глобальном поиске; привилегия поиска через testScope и зону (SEC-01)"
    addressed_in: "Phase 07.1"
    evidence: "Решение пользователя 2026-10-04; 07.1-CONTEXT.md:350 (D-23, охранный тест распространяется на services/search)"
  - truth: "admin/attempts/[id]/page.tsx различает 404 и прочие ошибки, а не сводит всё к notFound()"
    addressed_in: "Phase 8"
    evidence: "ROADMAP Phase 8 SC2 «No protected screen parses a 401, non-OK or malformed body as data»; 08-CONTEXT.md:186 называет admin/attempts/[id]/page.tsx (HTTP-01, HTTP-04)"
coincidental_reliance_items:
  - truth: "SC4: строки версии 1 открываются в разборе с ключом на момент сдачи"
    reason: undeclared-precondition
    harden: "legacy.ts сравнивает answer_keys.created_at (timestamp без пояса) с test_attempts.submitted_at в поясе сессии БД; верно только при TimeZone БД = UTC (CR-06, D-19). Записать допущение «БД в UTC» как предусловие выкатки или сравнивать в UTC явно."
  - truth: "SC4: старые попытки на проде открываются в разборе"
    reason: fixture-only
    harden: "Тесты используют синтетические строки версии 1 в test_*. Форма results и telemetry на проде не проверена: любой не-uuid questionId или telemetry не по TelemetryMapSchema дают 500 (CR-03, принято до read-only SQL п. 7)."
human_verification:
  - test: "CI на b861479: запушить dev и проверить, что job verify (yarn verify с postgres:17) и job e2e зелёные"
    expected: "Оба job зелёные; в verify шаг lint-typecheck-test проходит с DB-тестами фазы 5"
    why_human: "HEAD не запушен, CI на этом коммите не запускался; пуш делает пользователь из своего терминала"
  - test: "Runbook D-25 шаг 1: read-only SQL на проде (05-11-SUMMARY.md): __drizzle_migrations (верхняя строка 0021), <specifics> п. 1-4, п. 6 и запрос R2 из 03-11, п. 7 плюс проверка типов полей results и формы telemetry из 05-08"
    expected: "Верхняя миграция 0021; older_with_fresher_draft решён; одна комбинация типов results (object, string, boolean, number, number), все questionId — uuid; telemetry одной строкой (number, number, number, true)"
    why_human: "Агенты к проду не подключаются; от формы прод-данных зависит, откроются ли старые попытки в разборе (SC4, CR-03)"
  - test: "Runbook D-25 шаг 2: preview до прода — старт, черновик, submit, повтор submit, 409 из второй вкладки, 422 после лимита + 2 мин с «Начать заново», разбор администратора попытки версии 1 и версии 2, «Без оценки» у вопроса с 0 баллов"
    expected: "Поведение по UI-SPEC; повтор не создаёт вторую попытку; разбор версии 1 с пометкой, версии 2 с ключом на момент сдачи"
    why_human: "Живое окружение и визуальная проверка"
  - test: "Runbook D-25 шаги 3-6: тихое окно (active_open_sessions = 0, иначе STOP), миграции 0022 и 0023 непосредственно перед деплоем, web, сразу server, откат только парой server → web"
    expected: "Выкатка без 400 у активных студентов; при 55P03 миграция повторяется в окне"
    why_human: "Операция на проде, выполняет пользователь"
  - test: "Живые проверки 05-04 и 05-05: неназначенный пользователь без tests.read получает 403 на /start, PATCH, submit, /attempts/me, /chart-data; снятие назначения посреди попытки даёт 403; /start закрывает просроченную сессию и открывает новую"
    expected: "Статусы как в DB-тестах на test_*"
    why_human: "Проверка на живом окружении после выкатки"
  - test: "UI-SPEC на 375px (05-09, 05-10): плашка ошибки прохождения, диалоги 409 и 422, пометка разбора старой попытки в /admin/attempts/<id>"
    expected: "Текст переносится, кнопки под текстом или в столбец, KeyRound у первой строки, горизонтального скролла нет"
    why_human: "Визуальная вёрстка"
  - test: "UI-SPEC [авто] подтверждения (05-09, 05-10): h-8 у кнопок плашки, вес 500 у заголовков 409/422, поведение 404 (WAL остаётся), замена ответов при другом sessionId, повторное «Начать тест?», текст пометки «Разбор по частям недоступен…» и размещение карточки «Правильный ответ»; unresolved: 403 при открытии страницы теста показывает «Тест не найден»"
    expected: "Пользователь подтверждает или просит правку"
    why_human: "Решения по тексту и вёрстке за пользователем"
  - test: "CR-01(а): тест с лимитом 1 минута, дождаться автосдачи, в первые 1,5 с экрана «Время вышло» открыть DevTools → localStorage"
    expected: "Ключей test-session-*, test-frozen-*, test-answers-wal-* и test-client-attempt-* этого теста уже нет"
    why_human: "Web-тесты без DOM, шва для проверки порядка нет (05-REVIEW-FIX.md)"
  - test: "Прохибиции планов без тестового механизма. Test-tier, только дифф: 05-01 storage.ts и vi.mock не тронуты; 05-02 и 05-10 снимок не перезаписан; 05-04 новых маршрутов нет, scope.ts не правился. Judgment-tier (вердикт верификатора не авторитетен): 05-04 чтение промптов в public.ts не менялось; 05-06 хранилище не читается в транзакции submit; 05-07 снимок содержимого вопроса не сохраняется; 05-08 в index.ts меняется только обработчик разбора; 05-09 модуль жизненного цикла и WAL не перестраивались; 05-11 агент не подключался к проду; README без истории и env"
    expected: "Пользователь подтверждает; по коду верификатор нарушений не нашёл"
    why_human: "verification: judgment — требует решения человека"
---

# Phase 5: Attempt integrity — отчёт верификации

**Цель фазы:** студент начинает и сдаёт только назначенные тесты, один раз и атомарно, а разбор всегда показывает то, что было оценено.
**Проверено:** 2026-10-04T14:02:52Z
**Статус:** human_needed
**Повторная верификация:** нет, первичная

Код: ветка `dev`, HEAD `b861479`, дифф `3f57bb2..b861479` (66 файлов, 12 коммитов).

## Достижение цели

### Наблюдаемые истины (критерии ROADMAP)

| # | Критерий | Статус | Доказательства |
| --- | --- | --- | --- |
| 1 | Неназначенный пользователь получает 403 на чтение, старт, черновик и submit; назначенный или привилегированный по текущим правам проходит | ✓ VERIFIED | `attempt-sessions/access.ts:49-64`: `checkAttemptAccess` (тест не виден → 404, иначе `canReadTest` или строка `test_assignments`, иначе 403). Вызывается в `public.ts` на `GET /tests/:id` (:374), по slug (:301-304), `/attempts/me` (:439), `/chart-data` (:481), `/start` (:538), PATCH (:582), submit (:618); списки фильтрует `visibleTestsFilter`. `canReadTest` → `hasPermission` → `accessPolicy.accessFor(userId)` с мемоизацией только на запрос (WeakMap), кэша грантов между запросами нет. Тест `attempt-access-matrix.test.ts`: 5 профилей × 2 теста × 7 маршрутов плюс невидимые тесты — прошёл на HEAD |
| 2 | Submit теста с лимитом без точной открытой сессии отклоняется; параллельные /start дают одну открытую сессию; параллельные и повторные submit дают одну попытку с одинаковым ответом, повтор после потери ответа идемпотентен | ✓ VERIFIED | `SubmitAttemptRequestSchema` требует `sessionId` и `clientAttemptId` (uuid). `precheckSubmit` проверяет сессию пары (тест + пользователь), сдана → идемпотентность, закрыта → 404/422, просрочена по часам БД → 422 и закрытие. `submitAttempt` — одна транзакция: `FOR UPDATE` сессии, вставка попытки с `session_id`, `UPDATE` ровно этой сессии с очисткой черновика. `startAttemptSession` — `FOR UPDATE` + `ON CONFLICT DO NOTHING` по частичному индексу. Индексы `test_sessions_open_uniq`, `test_attempts_session_id_uniq` в 0022. Тесты `attempt-races.test.ts` (N параллельных /start → одна сессия; N submit с одним clientAttemptId → все 200, тела равны, попытка одна; разные clientAttemptId → один 200 и 409), `attempt-submit.test.ts`, `attempt-time-limit.test.ts` — прошли на HEAD. Оговорка D-09/D-15: тело повтора отличается, если между сдачей и повтором сменили `showCorrectAnswer` (видимость по текущей настройке, ключ сохранённый); это заявленное поведение, его доказывают тесты NQ-03 в `attempt-view-leak.test.ts` |
| 3 | Параллельные сохранения ответов и телеметрии в черновик не теряют полей | ✓ VERIFIED | `sessions.ts:126-157`: `SELECT … FOR UPDATE` открытой сессии, слияние ответов по ключу и `mergeTelemetryMaps`, `UPDATE`. Тест `гонки PATCH черновика › параллельные PATCH ответов и телеметрии не теряют ни одного поля` прошёл на HEAD |
| 4 | После правки ключа разбор администратора старых попыток не меняется (D1); три вида строятся при чтении из сохранённых фактов; старые попытки открываются в разборе после миграции | ✓ VERIFIED | Обработчик `/admin/attempts/:attemptId` (`routes/tests/index.ts`) больше не читает `answer_keys`: `canReviewAttempt` → `readAdminAttemptView`. Версия 2 хранит `key`, `keyVersion`, `verdicts`, `mistakes` (`facts.ts`); версия 1 — ключ из `correctAnswer` или из `answer_keys` с `created_at <= submitted_at` (`legacy.ts:27-46`), вердикты только при совпадении пересчёта (`legacy-fact.ts`). Один построитель вида для трёх зрителей (`view.ts:36-85`). Тесты `attempt-review.test.ts` (D1 версии 2, версия 1 с двумя версиями ключа, R2), `attempt-known-defects.test.ts` (SCORE-03), `legacy.test.ts`, `view.test.ts` (45 строк) прошли на HEAD; e2e `review.spec.ts:285` «D1: admin review of an earlier attempt is unchanged» — обычный тест, в логе e2e прошёл. Для прод-данных см. coincidental_reliance (UTC, форма старых строк) и пункт human_verification о read-only SQL |
| 5 | Результат читается через одну схему без `unknown[]`-приведений; статус вопроса одинаков во всех видах при `points === 0`; DB-тесты конкурентности, доступа и лимита времени зелёные в `yarn verify` и CI | ? UNCERTAIN (только CI) | Схема одна в `exam-core/attempt-result.ts` (`AttemptFactsSchema`, `LegacyAttemptResultsSchema`, `AttemptViewSchema`, `AdminAttemptViewSchema`); сервер разбирает `results` по `results_version` (`read.ts:27-31`) и проверяет вид (`view.ts:76`, `read.ts:112`). `SubmitResultSchema`, `ResultByQuestion`, `QuestionResult`, `results: unknown[]` в web удалены; охранный тест `attempt-integrity-guards.test.mjs` (16 проверок) прошёл. Статус — `questionStatus` в `exam-core` (`points === 0` → `ungraded`), web читает `status` из вида (`runner-result-card.ts`, разбор); тест `view.test.ts › факт с points 0 даёт ungraded при isCorrect true у всех зрителей` прошёл. Локальный гейт: лог `rf05-verify.log` — `yarn verify: OK`. CI на `b861479` не запускался (коммит не запушен), см. human_verification |

**Счёт:** 4/5 истин подтверждены, 0 present-behavior-unverified, 1 uncertain (только часть «зелёные в CI»).

Про список истин. Таблица содержит только 5 критериев ROADMAP, это контракт фазы. Отдельные `must_haves.truths` 11 планов поштучно не перечислялись. Они покрыты тестовыми файлами планов, прогнанными на HEAD (см. «Поведенческие проверки»). Две backstop-истины (375px) переданы человеку.

### Отложенные пункты

| # | Пункт | Где | Доказательство |
|---|---|---|---|
| 1 | «Время вышло» при восстановлении решает сервер (CR-01(б,в), CR-04, CR-05) | Phase 6 | Решение пользователя; `06-CONTEXT.md:358` |
| 2 | Свои попытки по снятым назначениям в поиске скрыть; привилегия поиска через зону (SEC-01) | Phase 07.1 | Решение пользователя; `07.1-CONTEXT.md:350` (D-23) |
| 3 | `admin/attempts/[id]/page.tsx` сводит любой не-OK к `notFound()` | Phase 8 | ROADMAP Phase 8 SC2; `08-CONTEXT.md:186` |

### Принятые решения пользователя (не gaps)

- Пояснения показываются всегда, и при выключенном показе ответов (SEC-02): как до фазы, без изменений.
- Вопросы видны до старта, пересдачи не ограничены (SEC-05): принято как есть, лимит попыток — PROD-02 (Deferred).
- CR-03 / SEC-03: схемы старых строк выравниваются после read-only SQL п. 7 и проверок типов из 05-08 перед выкаткой.
- Backlog без фазы: SEC-04 / N3 — фильтр сырых `answers` по вопросам теста и предел размера.

### Обязательные артефакты

| Артефакт | Назначение | Статус | Детали |
| --- | --- | --- | --- |
| `app/server/drizzle/0022_attempt_sessions.sql` | `closed_at`, `close_reason`, `session_id`, детерминированная чистка, два частичных уникальных индекса | ✓ VERIFIED | Чистка по `started_at DESC, id DESC`, закрывает как `superseded`, ничего не удаляет; `SET LOCAL lock_timeout = '5s'` первым оператором; тест миграции прошёл |
| `app/server/drizzle/0023_attempt_results_version.sql` | `results_version smallint DEFAULT 1` с CHECK (1, 2) | ✓ VERIFIED | Тесты 0023 прошли |
| `app/server/src/services/attempt-sessions/*` | Доступ, /start, черновик, submit | ✓ VERIFIED | Импортируется только из `public.ts`; маршруты делегируют |
| `app/server/src/services/scored-attempt/*` | Факты, вид для трёх зрителей, чтение версии 1 | ✓ VERIFIED | `scoreSubmission`, `readAttemptView` — из `public.ts`; `readAdminAttemptView` — из `index.ts` |
| `packages/exam-core/src/attempt-result.ts` | Конверт submit, схемы фактов, старой строки и вида, `questionStatus` | ✓ VERIFIED | Импорт в сервере и web; dist пересобран, тесты пакета прошли |
| `app/web/components/tests/client-attempt-id.ts` | Один `clientAttemptId` на сессию в `localStorage` | ✓ VERIFIED | `TestRunner.tsx:527` |
| `app/web/components/tests/runner-result-card.ts` | Карточка по `status`, неизвестный → «Без оценки» | ✓ VERIFIED | `TestRunner.tsx:812`; тест 7/7 |
| `app/web/lib/tests/api.ts` | `submitPublicTestAnswers(testId, SubmitAttemptRequest): AttemptView`, `AttemptRequestError` | ✓ VERIFIED | Используется в `TestRunner.doSubmit` |
| `scripts/attempt-integrity-guards.test.mjs` | Охранный тест | ✓ VERIFIED | В шаге `script-tests` `yarn verify` |

### Проверка связей

| От | К | Через | Статус | Детали |
| --- | --- | --- | --- | --- |
| `public.ts` 7 маршрутов попытки | `checkAttemptAccess` / `isAssignedOrPrivileged` | вызов перед действием | WIRED | Строки 301, 374, 439, 481, 538, 582, 618 |
| `public.ts` submit | `precheckSubmit` → `scoreSubmission` → `submitAttempt` → `readAttemptView` | последовательно, оценка вне транзакции | WIRED | :623-677 |
| `routes/tests/index.ts` разбор | `canReviewAttempt` + `readAdminAttemptView` | без `answer_keys` | WIRED | Охранный тест подтверждает |
| `TestRunner.doSubmit` | `/submit` | `{ sessionId, clientAttemptId, answers, telemetry }` | WIRED | 409/422/403/404 классифицируются `classifySubmitFailure` |
| Разбор web | вид сервера | `keyVisible`, `correctAnswer`, `verdicts`, `status` | WIRED | Снимок 45 случаев не менялся после `c95e9f4` |

### Data-flow (уровень 4)

| Артефакт | Данные | Источник | Реальные данные | Статус |
| --- | --- | --- | --- | --- |
| Ответ submit | `AttemptView` | строка `test_attempts` после commit → `readAttemptView` | Да | ✓ FLOWING |
| Разбор администратора | `AdminAttemptView` | `test_attempts.results` по версии, `answer_keys` истории для версии 1 | Да | ✓ FLOWING |
| Карточка `TestRunner` | `status` | поле вида от сервера | Да | ✓ FLOWING |

### Поведенческие проверки (на HEAD, через `node scripts/with-test-db.mjs`)

| Поведение | Команда | Результат | Статус |
| --- | --- | --- | --- |
| DB-тесты фазы: доступ, гонки, лимит, submit, разбор, утечка, характеризация, миграции, scored-attempt | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run <10 файлов>` | 10 файлов, 138 passed | ✓ PASS |
| Web: карточка, clientAttemptId, поток отправки, разбор | `yarn workspace @bio-exam/web vitest run …` | 6 файлов, 126 passed | ✓ PASS |
| exam-core: схема результата и оценка | `yarn workspace @bio-exam/exam-core vitest run src/attempt-result.test.ts src/scoring.test.ts` | 230 passed | ✓ PASS |
| Охранные тесты | `node --test scripts/attempt-integrity-guards.test.mjs scripts/exam-core-no-private-copies.test.mjs` | 16 pass, 0 fail | ✓ PASS |

Оговорка о доказательствах. В основном дереве `packages/exam-core/dist` (в `.gitignore`) был собран до появления `scoreQuestionFacts`; первый прогон серверных тестов упал с `scoreQuestionFacts is not a function`. Верификатор пересобрал dist (`yarn workspace @bio-exam/exam-core build`), исходники не менялись. Значит, в основном дереве на HEAD полный `yarn verify` не запускался. Логи `yarn verify: OK` и `132 passed` взяты из worktree `wt-phase-05` (его уже нет): `scratchpad/rf05-verify.log`, `scratchpad/rf05-e2e.log`. Коммит `b861479` содержит ровно пять файлов из `05-REVIEW-FIX.md`. Сам верификатор прогнал на HEAD только подмножество выше, полный гейт не запускал.

### Probe execution

Пробы `scripts/*/tests/probe-*.sh` в фазе не объявлены. Шаг пропущен.

### Покрытие требований

| Требование | Планы | Описание | Статус | Доказательства |
| --- | --- | --- | --- | --- |
| ATT-01 | 01, 04, 11 | Одно правило «назначен или привилегирован» по текущим правам | ✓ SATISFIED | SC1 |
| ATT-02 | 01, 06, 09 | Явный `sessionId`, проверка теста, пользователя и открытого состояния | ✓ SATISFIED | SC2; `attempt-submit.test.ts` (сессия другого студента или теста → 404) |
| ATT-03 | 03, 05 | Ограничения БД, детерминированная чистка дубликатов | ✓ SATISFIED | 0022 и `attempt-session-migration.test.ts` (повтор чистки ничего не меняет, 23505 на второй открытой сессии и второй попытке сессии) |
| ATT-04 | 01, 06, 09 | Одна транзакция, один `clientAttemptId` на цикл повторов | ✓ SATISFIED | SC2; `client-attempt-id.ts` |
| ATT-05 | 05 | Атомарное слияние черновика | ✓ SATISFIED | SC3 |
| ATT-06 | 01, 04, 05, 06, 11 | DB-тесты конкурентности, доступа и времени в `yarn verify` и CI | ✓ SATISFIED (CI — ожидает пуша) | Тесты есть и зелёные на HEAD; `ci.yml` запускает `yarn verify` с postgres:17 |
| SCORE-01 | 07 | Факты оценки сохраняются, текущий ключ не подставляется в старую попытку | ✓ SATISFIED | `facts.ts`, `legacy.ts` |
| SCORE-02 | 01, 02, 07, 08, 10, 11 | Вид для трёх зрителей в одном модуле, единственное место правила скрытия ключа | ✓ SATISFIED | `view.ts`; охранный тест: в web нет догадок о видимости ключа |
| SCORE-03 | 01, 08 | D1 закрыт тестом через интерфейс модуля | ✓ SATISFIED | `attempt-review.test.ts`, e2e D1 |
| SCORE-04 | 01, 02, 07, 09, 10, 11 | Одна схема, проверка при чтении, статус в одном месте | ✓ SATISFIED | SC5, первая часть |
| SCORE-05 | 03, 08 | Старые попытки совместимы при чтении, отдельная миграция | ✓ SATISFIED (прод-данные — human) | 0023 + адаптер версии 1, без перезаписи строк |

Сиротских требований нет: все 11 ID фазы из REQUIREMENTS.md заявлены в планах.

### Прохибиции планов

Test-tier (19 шт.). Нарушений нет. Механизм проверки есть не у всех пунктов:

| План | Пункт | Чем проверено | Статус |
| --- | --- | --- | --- |
| 05-01 | Поведение сервера и web не менялось | Характеризация и e2e на HEAD | ✓ |
| 05-01 | Только test_*, DATABASE_URL не читается | Guard `test-database-url.ts`, запуск через `with-test-db.mjs` | ✓ |
| 05-01 | storage.ts и vi.mock в exam-flow не трогались | Только дифф | ⚠️ flagged |
| 05-02 | Видимый разбор не меняется | Снимок `review-viewers.test.ts.snap` (45 случаев) | ✓ |
| 05-02 | Снимок не перезаписывается позже | Только git log: снимок менялся лишь в `c95e9f4` | ⚠️ flagged |
| 05-03 | Миграции 0000-0021 не меняются, push не запускается | Шаг `migrations` в `yarn verify` (манифест sha256) | ✓ |
| 05-03 | Нет DELETE, строки не удаляются | `attempt-session-migration.test.ts` › «no rows are deleted…» | ✓ |
| 05-04 | Новых маршрутов и источников доступа нет | Только дифф | ⚠️ flagged |
| 05-04 | scope.ts не правится | Только дифф | ⚠️ flagged |
| 05-05 | Автосдачи на сервере нет | `attempt-time-limit.test.ts` › «…422, сессия закрыта как expired, попытки нет…» | ✓ |
| 05-05 | Черновик закрытой сессии и строки сессий не удаляются | `attempt-time-limit.test.ts`, тест миграции | ✓ |
| 05-06 | Правила оценки не меняются | `scoring.test.ts`, `exam-flow.test.ts` | ✓ |
| 05-07 | Правила оценки и баллы старых попыток не пересчитываются | `legacy.test.ts` (баллы сохранённые) | ✓ |
| 05-07 | Строка не уходит наружу без вида | `attempt-view-leak.test.ts`, охранный тест | ✓ |
| 05-08 | Старые строки не перезаписываются | `attempt-review.test.ts` › «…строка не переписана» | ✓ |
| 05-08 | Баллы и статус старых попыток не пересчитываются | `attempt-review.test.ts` (R2), `legacy.test.ts` | ✓ |
| 05-09 | Вёрстка и строки e2e прохождения не меняются | e2e `take-test.spec.ts` (лог 132 passed) | ✓ |
| 05-10 | Тексты и подсветка разбора не меняются | Снимок и e2e `review.spec.ts` | ✓ |
| 05-10 | Снимок не перезаписывается | Только git log | ⚠️ flagged |

Пять пунктов без тестового механизма помечены flagged. По диффу нарушений нет. Они включены в пункт human_verification о прохибициях.

Judgment-tier (7 шт.) — нарушений по коду не найдено, вердикт неавторитетный. Вынесены в human_verification.

Backstop-истины планов (2 шт., `verification: backstop`): 375px у плашки и диалогов 409/422 (05-09) и у пометки разбора старой попытки (05-10). По наличию кода не засчитываются, статус `insufficient_spec`. Они входят в пункт human_verification «UI-SPEC на 375px».

### Анти-паттерны

| Файл | Строка | Шаблон | Серьёзность | Влияние |
| --- | --- | --- | --- | --- |
| — | — | TBD/FIXME/XXX/TODO/HACK | — | Во всех 66 файлах фазы маркеров нет |
| `app/server/src/services/attempt-sessions/submit.ts` | 12 | `results: unknown[]` | ℹ️ Info | Тип записи, а не приведение при чтении; чтение идёт через zod по версии |
| `app/server/src/routes/tests/public.ts` | 16 | неиспользуемый импорт `appSettings` | ℹ️ Info | Был до фазы (`deferred-items.md`), предупреждение линтера |
| `app/server/src/services/scored-attempt/read.ts` / `index.ts` разбор | — | `AttemptResultsShapeError`/`ZodError` → 500, web → 404 | ⚠️ Warning | CR-03, принято до read-only SQL; отображение ошибки — Phase 8 |

### Нужна проверка человеком

1. **CI после пуша.** Запушить `dev` (`b861479`) и проверить job `verify` и `e2e`. Ожидается: оба зелёные.
2. **Runbook D-25, шаг 1: read-only SQL на проде.** Список запросов — в `05-11-SUMMARY.md`. Ожидается:
   - верхняя миграция 0021;
   - решение по `older_with_fresher_draft`;
   - у `results` одна комбинация типов, все `questionId` — uuid;
   - `telemetry` одной строкой `number, number, number, true`.

   Иначе старые попытки в разборе ответят 500.
3. **Runbook D-25, шаг 2: preview до прода.** Проверить:
   - старт, черновик, submit и повтор;
   - 409 из второй вкладки;
   - 422 после лимита + 2 минуты и «Начать заново»;
   - разбор попытки версии 1 и версии 2;
   - «Без оценки» у вопроса с 0 баллов.
4. **Runbook D-25, шаги 3-6: выкатка.**
   - Тихое окно: `active_open_sessions` = 0, иначе STOP.
   - 0022 и 0023 непосредственно перед деплоем.
   - Деплой web, сразу за ним server.
   - Откат только парой server → web.
5. **Живые проверки 05-04 и 05-05.**
   - Неназначенный пользователь получает 403 на пяти маршрутах.
   - Снятие назначения посреди попытки даёт 403.
   - `/start` закрывает просроченную сессию и открывает новую.
6. **375px (05-09, 05-10).** Проверить плашку ошибки, диалоги 409 и 422, пометку разбора старой попытки.
7. **UI-SPEC: подтверждения пунктов [авто] и unresolved** из 05-09 и 05-10 (список в frontmatter).
8. **CR-01(а).** После автосдачи, в первые 1,5 с экрана «Время вышло», в `localStorage` уже нет ключей попытки.
9. **Прохибиции планов без тестового механизма.** Подтвердить 7 judgment-пунктов и 5 flagged test-пунктов из frontmatter.

### Итог по gaps

Блокирующих gaps нет. Цель фазы подтверждена кодом и зелёными DB-тестами на HEAD:
- доступ только назначенным или привилегированным;
- одна открытая сессия и одна попытка на сессию;
- атомарный и идемпотентный submit;
- черновик без потерь;
- факты оценки сохраняются, разбор не зависит от последующей правки ключа.

Открыто только то, что требует человека или прода: CI на запушенном коммите, read-only SQL и выкатка по D-25, визуальные проверки UI-SPEC. Восстановление после автосдачи, поиск и страница ошибки разбора по решению пользователя перенесены в фазы 6, 7.1 и 8.

---

_Проверено: 2026-10-04_
_Верификатор: Claude (gsd-verifier)_

## Закрытие

2026-10-05. Код фазы работает на проде (`bio-exam.ru`, свой сервер, ветка `master`). Пункты раздела «Человеческая проверка» пользователь подтвердил как выполненные; пункты про preview Vercel заменены работой на своём сервере.

`covered_digest` пересчитан на `dev` 41f580a (файлы фазы менялись следующими фазами). Верификатор заново не запускался: на этом коде проходят `yarn verify` и e2e.

`covered_digest` пересчитан на `dev` 1962edd после тестов покрытия, уборки web-тестов и удаления мёртвого кода (b720f21, 3513919, 65f04e5).
