# Phase 11: Deadline finalisation, upload window and background jobs - Research

**Researched:** 2026-10-06
**Domain:** серверная финализация попытки по дедлайну (Express 4 + Drizzle 0.45 + PostgreSQL 17), окно дозагрузки фото, фоновые задачи и остановка процесса Node 24, клиентский модуль жизненного цикла попытки (Next.js), обновление сессии во всех вкладках (Web Locks)
**Confidence:** HIGH для кода и гонок (всё прочитано в репозитории), MEDIUM для решений, которые ещё не приняты (форма ответа «ответ принят», маршрут чтения сессии, запас фоновой задачи)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Финализация по дедлайну (TIME-01)
- **D-01 [авто]:** Момент финализации — дедлайн (`started_at + time_limit_minutes`) плюс `ATTEMPT_GRACE_PERIOD_MINUTES` (2 мин), то есть то же условие, что `sessionExpired` в `services/attempt-sessions/sessions.ts`. Текст, набранный без связи до дедлайна и дошедший черновиком в пределах грейса, сохраняется.
- **D-02 [авто]:** Одна функция `finalizeSessionByDeadline(sessionId)` в `services/attempt-sessions`: идемпотентна, `clientAttemptId = deadline:<sessionId>`, `submit_source = 'deadline'`, ответы — серверный черновик сессии (`draft_answers`), оценивание тем же `scoreSubmission`/`submitAttempt`, что и ручная сдача. Вызывается лениво (старт, черновик, сдача, чтение сессии, попадающие на просроченную сессию) и фоновой задачей; гонка двух путей и ручной сдачи даёт ровно одну попытку (серверный тест гонки).
- **D-03 [авто]:** Тесты без лимита времени не финализируются (сессии остаются открытыми, как сейчас).
- **D-04 (решение пользователя):** Если в черновике нет ни одного сохранённого ответа, попытка не создаётся: сессия закрывается как сейчас (`close_reason = 'expired'`, ученик видит «время вышло»), в результатах и на графике ничего. Хотя бы один ответ — попытка сдаётся сервером.
- **D-05 [авто]:** Ручная сдача, пришедшая после серверной финализации той же сессии, получает исход «уже сдано» с id попытки (существующий путь 409 `ATTEMPT_ALREADY_SUBMITTED`), а не «время вышло».

#### Окно дозагрузки фото (TIME-02, TIME-03, TIME-04)
- **D-06 [авто]:** Новое поле теста `photo_upload_window_minutes` (целое, 0…120, 0 — окна нет) и столбец попытки `upload_closes_at` (nullable). Миграция — 0030 (0028–0029 заняты UX-веткой, уже в dev).
- **D-07 (решение пользователя):** По умолчанию окно 15 минут; автор меняет в настройках теста рядом с лимитом времени.
- **D-08 [авто]:** `upload_closes_at` вычисляется один раз при создании попытки: `min(submitted_at, конец таймера) + окно`; у теста без лимита — `submitted_at + окно`. Заполняется только если в тесте есть хотя бы один вопрос шаблона `open`, иначе `NULL` (окна нет). Кнопка «Готово, фото загружены» из фазы 14 будет ставить `now()`.
- **D-09 [авто]:** Одна серверная функция «принимается ли фото сейчас» (`photoUploadOpen`/аналог в `services/attempt-sessions` или модуле попытки) по времени базы (`now()` в SQL), с понятным текстом отказа; маршруты фото (фаза 12–13) будут вызывать только её. В этой фазе — функция, её тесты и поля в ответах API.
- **D-10 [авто]:** Ответы API попытки и сессии отдают `serverNow` и `uploadClosesAt`; web считает «Фото можно добавить до ЧЧ:ММ» и обратный отсчёт от серверного момента (смещение часов), не по часам устройства.
- **D-11 [авто]:** Поле окна в настройках теста показывается только когда в тесте есть открытый вопрос (тип `open` выключен до фазы 17, поэтому сейчас поле не видно авторам); API принимает поле всегда.

#### Страница ученика после дедлайна (TIME-06)
- **D-12 [авто]:** После дедлайна (по серверному времени) поля текста только для чтения; существующая автосдача по таймеру остаётся.
- **D-13 [авто]:** Если сервер уже финализировал попытку, страница показывает «Ответ принят» и, когда есть окно, «Фото можно добавить до ЧЧ:ММ» вместо «ответы не засчитаны»; затем результат как после обычной сдачи.
- **D-14 [авто]:** Неотправленный локальный текст (WAL) не стирается вслепую: модуль сравнивает его с ответами, которые сервер сохранил в попытке; совпало — WAL очищается; не совпало — WAL сохраняется под этой попыткой и ученик видит пометку «Часть ответа, набранная без связи, не дошла до сервера» с этим текстом только для чтения.
- **D-15 [авто]:** CR-03 (bfcache: возврат «назад» на страницу теста из кэша браузера) и CR-05 (повторный старт без сессии) исправляются в модуле `components/tests/attempt-lifecycle` по записям отложенного v1.0; сначала характеризация `lifecycle-submit` и `lifecycle-time` (по ROADMAP).

#### Фоновые задачи и остановка (PLAT-01, PLAT-02)
- **D-16 [авто]:** Модуль `app/server/src/services/background-jobs`: `register({ name, intervalMs, runOnce })`, `start()`/`stop()`; запуск только из `app/server/src/index.ts`, никогда из `app.ts` (тесты и контейнер миграций его не получают). Каждый прогон задачи — под `pg_try_advisory_xact_lock(<ключ имени>)`, поэтому два экземпляра API во время выкатки не выполняют одну задачу дважды. Команда `yarn workspace @bio-exam/server jobs:run <name>` выполняет задачу один раз.
- **D-17 [авто]:** Задачи фазы: `finalize-deadlines` (раз в 30 с, батч просроченных сессий, по одной транзакции на сессию). `reconcile-outcomes` доступна только через `jobs:run` и чинит только попытки `none` (отложенное условие фазы 9), в расписание не ставится.
- **D-18 [авто]:** Остановка по SIGTERM/SIGINT: перестать принимать соединения, дождаться текущих запросов (`server.close` с ожиданием, предел 25 с), остановить таймеры задач и дождаться текущего прогона, только потом `pgPool.end()`, затем выход. Шаг пользователя: `stop_grace_period` контейнера не меньше 30 с.

#### Сессия во всех вкладках и выход (PLAT-03, PLAT-04)
- **D-19 [авто]:** Обновление сессии — под `navigator.locks.request('bio-exam:session-refresh')`; вкладка, получившая замок после другой, сначала проверяет, не обновила ли сессию соседняя (свежий срок доступа), и не шлёт refresh повторно; где Web Locks нет — прежнее поведение одной вкладки. Без повтора refresh-токена при нескольких вкладках (сервер считает повтор угрозой).
- **D-20 [авто]:** Выход стирает в браузере ключи черновиков попыток этого пользователя (сессия, WAL, frozen, clientAttemptId) и копии черновиков вопросов, если ключи содержат id пользователя; на общих школьных компьютерах следующий ученик их не видит.

### Claude's Discretion
- Имена функций и файлов модуля задач и финализации в пределах ADR-0005; интервалы и размер батча задачи финализации.
- Точный текст пометки о недошедшем тексте и отказа фото (в UI-SPEC).
- Как отдавать `serverNow` (заголовок или поле ответа).

### Deferred Ideas (OUT OF SCOPE)
- Расширение защиты выкатки на открытые окна загрузки — шаг владельца сервера (фаза 17).
- Очистка старых событий журнала по `expires_at` — отдельная задача в модуле фоновых задач позже.
- `reconcile-outcomes` в расписании с загрузчиком оценок — фаза 15.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TIME-01 | Сервер сам финализирует попытку с лимитом времени в дедлайн + грейс последними сохранёнными ответами | Раздел «Финализация по дедлайну»: одна функция, точки ленивого вызова, таблица гонок, правка `submitAttempt` (источник, `submittedAt`, `upload_closes_at`), запрет черновика после грейса, фоновая задача с запасом |
| TIME-02 | После дедлайна текст только для чтения; окно загрузки от `min(сдача, конец таймера)`; без таймера — от сдачи | Раздел «Окно загрузки»: столбцы 0030, вычисление в одной вставке, `interactionDisabled` по серверному времени в модуле попытки |
| TIME-03 | Ученик видит «до когда можно добавить фото» по серверному времени | `serverNow` + `uploadClosesAt` в ответах (`/start`, чтение сессии, 409 финализации, вид попытки); якорь серверного времени в модуле попытки |
| TIME-04 | Одно серверное правило по времени базы, отказ с понятным текстом | `photoUploadWindow(executor, { sessionId })` на `clock_timestamp()`; чистое ядро правила с табличным тестом; интеграционный тест границы |
| TIME-06 | При серверной финализации страница пишет «ответ принят…», недошедший текст не стирается без сверки | Расширенное тело 409 (`submitSource: 'deadline'`, вид попытки), маршрут чтения судьбы сессии, сравнение WAL с `results[].userAnswer`, ключ `test-unsent-…` |
| PLAT-01 | Модуль фоновых задач: старт только из точки входа, безопасен при двух экземплярах, остановка до пула, разовый запуск командой | Раздел «Фоновые задачи»: реестр, транзакция-замок на весь прогон, `jobs:run` по образцу `storage:reconcile`, тесты через `runOnce()` |
| PLAT-02 | Остановка ждёт запросы и задачи до закрытия пула | Раздел «Остановка»: `createShutdown` с `server.close`, `closeIdleConnections`, пределом 25 с, `closeAllConnections`, затем `pgPool.end()` |
| PLAT-03 | Одно обновление сессии на браузер, без повтора refresh-токена | Раздел «Обновление сессии»: `navigator.locks` + общая запись `refreshedAt` в `localStorage`; честная оценка того, от чего защищает замок |
| PLAT-04 | Выход стирает ключи черновиков попыток пользователя | Инвентарь пяти префиксов, функция очистки внутри `attempt-lifecycle` (охранник ключей), повторная очистка на `pagehide` |
| DEBT-08 (часть) | CR-03 и CR-05 из v1.0 | Раздел «CR-03 и CR-05»: точные сценарии из `06-REVIEW.md`, правка `save-queue.drain` и повторный `/start` без сессии |
</phase_requirements>

## Summary

Почти всё, что нужно фазе, уже есть в коде, и задача в основном в том, чтобы связать готовые части без новых гонок. Сдача попытки (`precheckSubmit` → `scoreSubmission` → `submitAttempt`) уже идемпотентна: строка сессии блокируется `FOR UPDATE`, на `test_attempts` стоят два уникальных индекса (`session_id` и `(user_id, client_attempt_id)`), повтор с тем же `clientAttemptId` даёт `replayed`. Если серверная финализация пойдёт тем же путём с `clientAttemptId = 'deadline:<sessionId>'`, «ровно одна попытка» обеспечат блокировка строки и уникальные индексы, а advisory lock фоновой задачи только экономит работу. Сейчас `submitAttempt` жёстко пишет `submitSource: 'client'` и `submittedAt` по умолчанию `now()`, поэтому их нужно передавать параметрами. Там же, в одной вставке, вычисляется `upload_closes_at`.

Гонок три. Первая: клиентская сдача прошла предпроверку в последнюю секунду грейса, оценивается долго, а фоновая задача тем временем финализирует черновик. Клиентский текст тогда теряется, и это ровно C1 из PITFALLS. Лечится запасом: фоновая задача берёт сессии только после `дедлайн + грейс + 60 с`, ленивые пути финализируют сразу после грейса. Вторая: вложенная транзакция. `finalizeSessionByDeadline` нельзя вызывать изнутри транзакций `startAttemptSession` и `saveSessionDraft`. Они держат `FOR UPDATE` на той же строке, а `submitAttempt` открывает своё соединение пула (в dev `PG_POOL_MAX` = 2), и вызов зависает до `statement_timeout` 10 с. Финализация идёт до входа в блокирующую транзакцию. Третья: PATCH черновика, начатый до конца грейса и закоммиченный после чтения черновика финализацией. Транзакция финализации заново сверяет `draft_updated_at` под блокировкой.

На клиенте модуль `attempt-lifecycle` сейчас при `409 ATTEMPT_ALREADY_SUBMITTED` и `422 TIME_EXPIRED` стирает все четыре ключа, включая WAL (`STORAGE_KEYS_BY_EVENT`), и показывает «Время вышло, ответы не засчитаны». Есть и тихая ловушка: если сервер уже финализировал сессию, `/start` без вопросов создаёт новую сессию, и ветка `session-replaced` удаляет WAL. Поэтому клиенту нужен способ узнать судьбу своей сессии до `/start`. Маршрута «чтение сессии» в коде нет: есть только `/start`, `PATCH …/answers`, `/submit` и `attempts/me`. Ученик не может прочитать свою попытку по id (`GET /api/tests/admin/attempts/:attemptId` требует `tests.read`). Рекомендация: новый маршрут `GET /api/tests/public/tests/:id/sessions/:sessionId` с ленивой финализацией, который возвращает вид попытки для ученика. Тот же вид кладётся в тело 409 финализации, чтобы показать «Ответ принят» и сверить WAL с `results[].userAnswer`.

**Primary recommendation:** одна функция `finalizeSessionByDeadline` поверх параметризованного `submitAttempt`, вызов строго вне чужих транзакций. Фоновая задача — с запасом 60 с после грейса, под транзакцией-замком на весь прогон. Клиент сначала узнаёт судьбу сессии (новый GET), потом стартует. WAL сверяется с видом попытки, а не стирается.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Решение «сессия просрочена» и финализация | API / Backend (`services/attempt-sessions`) | Database (блокировка строки, уникальные индексы, `now()`) | ADR-0001: данные и правила у Express; время решает база |
| Оценивание черновика | API (`services/scored-attempt.scoreSubmission`) | — | Тот же путь, что ручная сдача (D-02) |
| Окно загрузки (`upload_closes_at`, «принимается ли фото») | Database (`clock_timestamp()`, столбец) | API (одна функция) | D-09: по времени базы; клиент не решает |
| Периодический запуск финализации | API-процесс (`services/background-jobs`, старт из `index.ts`) | Database (`pg_try_advisory_xact_lock`) | D-16 |
| Остановка процесса | API-процесс (`index.ts` + модуль остановки) | Docker Compose (`stop_grace_period`) | Шаг пользователя на сервере |
| Текст только для чтения после дедлайна, «Ответ принят», сверка WAL | Browser (`components/tests/attempt-lifecycle`) | API (серверное время, вид попытки) | ADR-0005: модуль жизненного цикла владеет WAL |
| Одно обновление сессии на браузер | Browser (`lib/session/client.ts`, Web Locks) | API (окно `REFRESH_REUSE_WINDOW_MS`) | PLAT-03 |
| Очистка ключей при выходе | Browser (`AuthProvider.logout` → функции модулей) | — | Ключи живут только в браузере |
| Поле окна в настройках теста | Frontend (редактор) + API (схема, `updateTestSettings`) | Database (CHECK 0…120) | D-06, D-07, D-11 |

## Project Constraints (from CLAUDE.md)

- CodeGraph (`codegraph explore/node/impact/affected`) перед grep. Перед правкой символа: `codegraph impact` и список вызывающих. Результаты `impact` для этой фазы: `submitAttempt` вызывают `POST /api/tests/public/tests/:id/submit` и `app/server/src/scripts/e2e-seed.ts:main`; `startAttemptSession` вызывают `POST …/start` и тот же `e2e-seed.ts`; `precheckSubmit` вызывает только `POST …/submit` [VERIFIED: codegraph impact].
- Работа с базой только через `node scripts/with-test-db.mjs …` (`TEST_DATABASE_URL`, `BIO_EXAM_ISOLATED_ENV=1`); `DATABASE_URL` из `.env` не трогать.
- Применённую миграцию не редактировать, новая — `0030`; `yarn verify` проверяет цепочку с пустой базы.
- Новый ключ окружения добавить в `app/server/.env.example` / `app/web/.env.example` (`scripts/check-env-contract.mjs`). Рекомендация фазы: новых ключей не вводить.
- README и комментарии env-примеров на русском. Команда `yarn …` в документе должна существовать (`scripts/check-docs-commands.mjs`): `yarn workspace @bio-exam/server jobs:run` появится в документации только вместе со скриптом `jobs:run` в `app/server/package.json`.
- `yarn verify` зелёный до завершения фазы; прогон без тестов считается провалом.
- Чисто форматирующие правки отдельным коммитом.
- Глобальные правила пользователя: без комментариев в коде; GSD не коммитит; тесты без хрупких структурных охранников, юниты только для логики с вариантами, новые проверки — серверные интеграционные и e2e (память `test-hygiene`).
- Навыки: `bio-exam-api` (маршруты попытки, `route-inventory.txt`, exam-core как контракт), `bio-exam-data` (манифест миграций, ADR-0007), `bio-exam-web`.
- CI job `build` (не входит в `yarn verify`) проверяет `scripts/check-exam-core-dist.mjs` с жёстким списком `EXPECTED_EXPORTS`: новый рантайм-экспорт exam-core добавить и туда (память `ci-build-job-not-in-verify`).

## Standard Stack

Новых пакетов фаза не ставит. Всё на имеющемся.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node `http` (Node 24) | 24.17.0 локально, `engines.node: "24"` | `server.close`, `closeIdleConnections`, `closeAllConnections` | `server.close` с v19 сам закрывает простаивающие keep-alive соединения [CITED: nodejs.org/docs/latest-v24.x/api/http.html] |
| `pg` | `^8.16.3` | пул, `pgPool.end()` | уже в `app/server/package.json` [VERIFIED: app/server/package.json] |
| `drizzle-orm` | `0.45.3` | транзакции, `.for('update')`, `sql` | там же |
| PostgreSQL | 17 | `pg_try_advisory_xact_lock(int,int)`, `clock_timestamp()` | две формы ключа не пересекаются [CITED: postgresql.org/docs/17/functions-admin.html] |
| Web Locks API | браузерный | `navigator.locks.request` | Baseline с марта 2022, только secure context (HTTPS, localhost) [CITED: developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API] |
| Playwright | из корня репозитория | `page.clock`, `context.setOffline`, `page.route` | уже используется в `timed-attempt.spec.ts`, `submit-retry.spec.ts` [VERIFIED: e2e/tests] |
| Vitest | `5.0.3` (server) | интеграционные тесты сервера | [VERIFIED: app/server/package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_try_advisory_xact_lock` на транзакцию прогона | `pg_try_advisory_lock` на отдельном клиенте | Сессионный замок переживает ошибку при забытом `unlock` и уходит с соединением обратно в пул; xact-замок снимается коммитом. D-16 фиксирует xact |
| Новый `GET …/sessions/:sessionId` | Тело `/start` с `resumeSessionId` | Меняет контракт `/start`, на который опираются e2e и сид; GET проще проверить и он не создаёт сессию |
| `serverNow` полем в теле | HTTP-заголовок `Date` | `Date` даёт точность до секунды и проходит через rewrites Next; поле в теле проще читать и тестировать (решение на усмотрение, рекомендация — поле) |
| Отдельный воркер-контейнер | Таймер в процессе API | Вне объёма вехи (ARCHITECTURE.md) |

**Installation:** не требуется.

## Package Legitimacy Audit

Фаза не устанавливает внешних пакетов.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Опорные значения из кода (verbatim)

Эти строки прочитаны в этой сессии. Значения в примерах ниже берутся только отсюда.

- `app/server/src/services/attempt-sessions/sessions.ts:52-54` [VERIFIED]:
  ```ts
  export function sessionExpired(timeLimitMinutes: number | null): SQL<boolean> {
  	return sql<boolean>`(${timeLimitMinutes}::int IS NOT NULL AND now() > ${testSessions.startedAt} + make_interval(mins => ${timeLimitMinutes}::int + ${ATTEMPT_GRACE_PERIOD_MINUTES}::int))`
  }
  ```
- `packages/exam-core/src/attempt-result.ts:11-17` [VERIFIED]: `export const ATTEMPT_GRACE_PERIOD_MINUTES = 2`; `SUBMIT_ERROR_CODES = { alreadySubmitted: 'ATTEMPT_ALREADY_SUBMITTED', timeExpired: 'TIME_EXPIRED', answersInvalid: 'ANSWERS_INVALID' }`.
- `app/server/src/services/attempt-sessions/submit.ts:166-167` [VERIFIED]: `passingScore: scored.passingScore,` / `submitSource: 'client',`; сессия при сдаче: `submittedAt: sql\`now()\`` (`:187`).
- `app/server/src/db/schema.ts` `testAttempts` [VERIFIED]: `submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),`; `clientAttemptId: text('client_attempt_id'),`; `submitSource: text('submit_source').notNull().default('client'),`; индексы `uniqueIndex('test_attempts_user_client_attempt_idx').on(t.userId, t.clientAttemptId).where(sql\`${t.clientAttemptId} IS NOT NULL\`)` и `uniqueIndex('test_attempts_session_id_uniq').on(t.sessionId).where(sql\`${t.sessionId} IS NOT NULL\`)`; CHECK `sql\`${t.submitSource} IN ('client', 'deadline')\``.
- `app/server/src/db/schema.ts` `testSessions` [VERIFIED]: `draftUpdatedAt: timestamp('draft_updated_at'),` (без часового пояса); `closeReason: text('close_reason'),`; CHECK `sql\`${t.closeReason} IN ('expired', 'superseded')\``; `uniqueIndex('test_sessions_open_uniq').on(t.testId, t.userId).where(sql\`${t.submittedAt} IS NULL AND ${t.closedAt} IS NULL\`)`.
- `app/server/src/db/schema.ts` `tests` [VERIFIED]: `timeLimitMinutes: integer('time_limit_minutes'),`; столбца окна загрузки нет.
- `packages/exam-core/src/registry.ts:3-10` [VERIFIED]: `QUESTION_UI_TEMPLATES = ['single_choice', 'multi_choice', 'matching', 'short_text', 'sequence_digits', 'open']`.
- `app/server/src/db/index.ts:52-57` [VERIFIED]: `max: Number(process.env.PG_POOL_MAX ?? (isDev ? 2 : 20)),`, `connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 5000),`, `statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 10000),`.
- `app/server/src/services/session/index.ts:42` [VERIFIED]: `export const REFRESH_REUSE_WINDOW_MS = 30_000`.
- `app/server/src/services/session/cookies.ts:41-52` [VERIFIED]: куки сессии `'HttpOnly'`, `'SameSite=Lax'`: срок доступа из JS не читается.
- `app/web/components/tests/attempt-lifecycle/storage-keys.ts:16-23` [VERIFIED]: `` session: `test-session-${testId}-${userId}` ``, `` wal: `test-answers-wal-${testId}-${userId}` ``, `` frozen: `test-frozen-${testId}-${userId}` ``, `clientAttemptId: clientAttemptIdKey(testId, userId)`; `app/web/components/tests/client-attempt-id.ts:8-10`: `` `test-client-attempt-${testId}-${userId}` ``; `app/web/lib/drafts/question-draft-copy.ts:24-28`: `const COPY_KEY_PREFIX = 'question-draft-wal-'`, `` `${COPY_KEY_PREFIX}${draftId}-${userId}` ``.
- `app/web/components/tests/attempt-submit-flow.ts:92-102` [VERIFIED]: `const ALL_ATTEMPT_KEYS: readonly AttemptStorageKey[] = ['session', 'wal', 'frozen', 'clientAttemptId']`; `'already-submitted': ALL_ATTEMPT_KEYS,` `'time-expired': ALL_ATTEMPT_KEYS,`.
- `app/web/lib/drafts/question-draft-copy.ts:15` [VERIFIED]: `export function stableSerialize(value: unknown): string`.
- Последняя миграция [VERIFIED: app/server/drizzle/meta/_journal.json]: `"idx": 29`, `"when": 1791268928915`, `"tag": "0029_drop_app_settings"`.
- Сервер бэкенда в e2e [VERIFIED: e2e/playwright.config.ts:66]: `command: 'yarn workspace @bio-exam/server tsx src/index.ts'`, `NODE_ENV: 'development'`: фоновые задачи **работают** во время e2e, пул по умолчанию 2.

## Architecture Patterns

### System Architecture Diagram

```
 Браузер ученика (attempt-lifecycle)                    Express API                               PostgreSQL
 ──────────────────────────────────                     ───────────                               ──────────
 init(): есть кэш сессии теста с лимитом?
   └─да─► GET /tests/:id/sessions/:sid ───────────►  checkAttemptAccess ─► readSessionFate ──┐
                                                       │ open && expired? ──► finalizeSessionByDeadline(sid)
                                                       ▼                                       │
 ◄── {state: open|submitted|expired, serverNow,    ◄── ответ ◄────────────────────────────────┘
      attempt?, uploadClosesAt?}
   open ─► POST /start (как сейчас) ───────────────►  finalizeExpiredOpenSession(test,user) ─► startAttemptSession
   submitted ─► «Ответ принят» + сверка WAL с attempt.results[].userAnswer
   expired ─► «Время вышло» (WAL с текстом сохраняется, см. Open Questions)

 answer() ─► WAL ─► очередь PATCH ─────────────────►  PATCH …/answers
                                                       │ expired? ─► finalize ─► 404
                                                       └─ saveSessionDraft (WHERE NOT expired) ─► draft_answers
 тик таймера (серверное время = якорь serverNow) ─► дедлайн:
   поля только для чтения, автосдача ─────────────►  POST /submit
                                                       │ precheck: open ─► scoreSubmission ─► submitAttempt(client)
                                                       │ precheck: expired ─► finalize ─► 409 {submitSource:'deadline', attempt}
                                                       │ precheck: submitted(deadline) ─► 409 {submitSource:'deadline', attempt}
                                                       └ precheck: submitted(client, другая вкладка) ─► 409 (как сейчас)

 index.ts ─► backgroundJobs.start()
   каждые 30 с: finalize-deadlines.runOnce()
     BEGIN; pg_try_advisory_xact_lock(ns, hashtext('finalize-deadlines'))
       false ─► COMMIT, пропуск
       true  ─► SELECT open sessions WHERE limit IS NOT NULL AND now() > started_at + limit + grace + 60 s LIMIT 50
                 для каждой: finalizeSessionByDeadline(sid)   (своя транзакция, другое соединение пула)
     COMMIT
 SIGTERM ─► shutdown: server.close + closeIdleConnections ─► ждать ≤ 25 с ─► closeAllConnections
            параллельно jobs.stop() (сигнал прерывания между сессиями, ждать текущий прогон)
            ─► pgPool.end() ─► exit
```

### Recommended Project Structure

```
app/server/src/
├── services/attempt-sessions/
│   ├── sessions.ts          # startAttemptSession (без закрытия непустой просроченной), saveSessionDraft (WHERE NOT expired)
│   ├── submit.ts            # precheckSubmit (+ submitSource попытки), submitAttempt (source, submittedAt, uploadWindow)
│   ├── deadline.ts          # finalizeSessionByDeadline, finalizeExpiredOpenSession, readSessionFate, findSessionsDueForFinalization
│   ├── upload-window.ts     # чистое правило окна + photoUploadWindow(executor, { sessionId }) на clock_timestamp()
│   ├── explanations.ts      # explanationReaderFor(test): перенос buildQuestionMarkdownCandidates из routes/tests/public.ts
│   └── index.ts
├── services/background-jobs/
│   ├── registry.ts          # createJobRunner: register/start/stop/runNow, замок, прерывание
│   ├── jobs.ts              # finalize-deadlines, reconcile-outcomes (только none)
│   └── index.ts
├── lib/shutdown.ts          # createShutdown({ server, jobs, pool, drainMs, log })
├── scripts/jobs-run.ts      # jobs:run <name>, образец storage-reconcile.ts
└── index.ts                 # только связывает: listen, jobs.start, сигналы → shutdown

app/web/
├── components/tests/attempt-lifecycle/
│   ├── lifecycle.ts         # серверное время, read-only после дедлайна, исход finalized, CR-05
│   ├── server-clock.ts      # якорь serverNow (чистый)
│   ├── unsent.ts            # сравнение WAL с видом попытки (чистый, табличный тест)
│   ├── storage-keys.ts      # + ключ test-unsent-, clearUserAttemptStorage(storage, userId)
│   └── use-attempt-lifecycle.ts  # + pageshow persisted (CR-03), api.readSession
├── components/tests/attempt-submit-flow.ts   # finalized-by-deadline, тексты, STORAGE_KEYS_BY_EVENT
├── lib/drafts/save-queue.ts                  # CR-03: drain не теряет порядок с запросом в полёте
├── lib/drafts/question-draft-copy.ts         # + forgetUserQuestionDraftCopies(storage, userId)
├── lib/session/refresh-coordinator.ts        # Web Locks + общая запись refreshedAt (чистый, с швами)
└── components/providers/AuthProvider.tsx     # logout: очистка + pagehide-повтор
```

Имена файлов — на усмотрение (Claude's Discretion), с учётом ADR-0005. Неочевидное решение: `explanationReaderFor` переносится из `routes/tests/public.ts` в сервис, потому что фоновая задача не имеет маршрута.

### Pattern 1: Финализация через общий путь сдачи

**What:** `finalizeSessionByDeadline(sessionId)` читает сессию и тест без блокировки, решает, нужно ли что-то делать, оценивает черновик тем же `scoreSubmission` и вставляет попытку тем же `submitAttempt` с `source: 'deadline'`.

**When to use:** любой путь, попавший на открытую сессию с `sessionExpired(limit) = true`. Фоновая задача — только при `now() > дедлайн + грейс + FINALIZE_SETTLE`.

**Алгоритм (рекомендация):**
1. Без транзакции: `SELECT s.id, s.test_id, s.user_id, s.started_at, s.submitted_at, s.closed_at, s.draft_answers, s.draft_updated_at, t.time_limit_minutes, t.passing_score, t.photo_upload_window_minutes, t.slug, topic.slug, <expired> FROM test_sessions s JOIN tests t …`. Сессия не найдена, уже сдана или закрыта → вернуть текущую судьбу (`submitted`/`closed`). Лимита нет (D-03) или срок не истёк → `{ kind: 'open' }`.
2. Отфильтровать черновик по текущим вопросам теста. Каждый ответ проверить по одному через `findAnswerViolation`, нарушителей выбросить с записью в лог. Причина: черновик мог ссылаться на удалённый вопрос (`foreign_question`) или превысить предел, а `scoreSubmission` при любом нарушении возвращает `ok: false` (`facts.ts:73-77`).
3. Пусто (D-04) или `no_questions` → условное `UPDATE test_sessions SET closed_at = now(), close_reason = 'expired' WHERE id = $1 AND submitted_at IS NULL AND closed_at IS NULL`, вернуть `{ kind: 'expired' }`.
4. `scoreSubmission({ testId, answers: filtered, passingScore, readExplanation: explanationReaderFor(test) })`.
5. `submitAttempt({ …, clientAttemptId: \`deadline:${sessionId}\`, source: 'deadline', submittedAt: <started_at + limit>, expectedDraftUpdatedAt, uploadWindowMinutes, hasOpenQuestion })`. Внутри транзакции под `FOR UPDATE`: если черновик изменился после чтения, вернуть `{ kind: 'draft_changed' }`, и функция повторяет шаги 1–5 (не больше 3 раз). Это закрывает гонку с PATCH, начатым до конца грейса. Сравнивать содержимое, а не время: `draft_answers IS NOT DISTINCT FROM ${readDraftJson}::jsonb` (или `draft_updated_at::text` строкой). `draft_updated_at` — `timestamp` без часового пояса, node-pg читает его как местное время в `Date` и передаёт обратно со смещением, поэтому сравнение `Date` на равенство может никогда не совпасть [ASSUMED: поведение node-pg с `timestamp without time zone`; сравнение по содержимому от него не зависит].
6. `created` или `replayed` (второй финализатор) → `{ kind: 'finalized', attemptId }`; `conflict` (клиентская попытка успела раньше) → `{ kind: 'submitted', attemptId }`; `closed` → `{ kind: 'expired' }`.

**`submittedAt` у серверной попытки:** рекомендация — `started_at + time_limit_minutes`, то есть конец таймера, а не `now()`. Ленивая финализация может случиться через дни после дедлайна (ученик вернулся, API простаивал), и история не должна показывать сдачу в момент чтения. `upload_closes_at = min(submitted_at, конец таймера) + окно` от этого не зависит: у серверной попытки обе величины равны концу таймера [ASSUMED: решение планировщика; см. A2].

**`clientAttemptId`:** `SubmitAttemptRequestSchema.clientAttemptId` — `z.string().uuid()` [VERIFIED: attempt-result.ts:19-24], поэтому клиент не может прислать `deadline:…`, а `(user_id, 'deadline:<sid>')` уникален на сессию.

### Pattern 2: Точки ленивой финализации (все вне чужих транзакций)

| Путь | Сейчас | После фазы |
|------|--------|-----------|
| `POST /start` | `startAttemptSession` внутри своей транзакции закрывает просроченную открытую сессию как `expired` и открывает новую (`sessions.ts:94-101`) | Маршрут сначала вызывает `finalizeExpiredOpenSession({ testId, userId, timeLimitMinutes })`, потом `startAttemptSession`. В транзакции старта ветка «открыта и просрочена» закрывает сессию только при пустом черновике, иначе возвращает признак, и маршрут повторяет финализацию один раз |
| `PATCH …/answers` | `openSessionOf` не смотрит на время: черновик пишется и после грейса (`attempt-time-limit.test.ts:151` закрепляет 200) | Маршрут: просрочена → финализация → 404 `Session not found or already submitted`. `saveSessionDraft` получает `timeLimitMinutes` и `NOT sessionExpired(limit)` в WHERE. PATCH в пределах грейса сохраняется, финализации нет (это и есть D-01) |
| `POST /submit` | `precheck.kind === 'expired'` → `closeExpiredSession` → 422 (`public.ts:574-577`) | `expired` → финализация: попытка есть → 409 с телом финализации (D-05), пусто → 422 как сейчас. `submitted` с `submit_source = 'deadline'` → 409 с телом финализации |
| `GET …/sessions/:sessionId` (новый) | маршрута нет | Судьба сессии, при необходимости ленивая финализация (см. Pattern 4) |

`closeExpiredSession` остаётся только как шаг D-04 внутри финализации.

### Pattern 3: Таблица гонок (что получает клиент)

Тест с лимитом, сессия S, непустой черновик D, WAL клиента W ⊇ D.

| # | Порядок | Итог в базе | Клиент получает |
|---|---------|-------------|-----------------|
| 1 | Клиентская автосдача в пределах грейса | Одна попытка `client` с ответами тела (W) | 200, вид попытки; фон позже видит `submitted` и ничего не делает |
| 2 | Клиент без связи дольше грейса, фон через 60 с после грейса | Одна попытка `deadline` по D | Позже: GET судьбы → `submitted`, «Ответ принят», сверка W с D |
| 3 | Сдача приходит после грейса, финализации ещё не было | `precheck = expired` → ленивая финализация → одна попытка `deadline` | 409 `{ submitSource: 'deadline', attempt }` |
| 4 | Ленивая (другая вкладка, GET или `/start`) и фоновая одновременно | Строка S под `FOR UPDATE`: первая вставляет, вторая видит `submittedAt` и тот же `clientAttemptId` → `replayed` | Обе возвращают тот же `attemptId` |
| 5 | Предпроверка клиента прошла на краю грейса, оценка медленная, фон | Фон берёт S только через 60 с после грейса → клиентская попытка создаётся первой | 200 (`attempt-time-limit.test.ts:324` закрепляет «оценка дольше остатка льготы не даёт 422») |
| 6 | То же, но ленивая финализация из другой вкладки того же ученика в ту же секунду | Кто первым возьмёт строку. Если финализация, клиент получит `conflict` → 409 финализации | Узкое окно, принимаем; ответы до грейса уже в D через PATCH |
| 7 | Два экземпляра API (выкатка, ручной `jobs:run`) | Второй не получает advisory lock и пропускает прогон; без замка сработал бы п. 4 | — |
| 8 | Пустой черновик (D-04) | Сессия закрыта `expired`, попытки нет | 422 `TIME_EXPIRED` / GET → `expired` |
| 9 | PATCH начат до конца грейса, закоммичен после чтения финализацией | Транзакция финализации видит другой `draft_updated_at` → повтор с новым D | — |
| 10 | Сессия закрыта `superseded` | Ничего | как сейчас (404 у сдачи) |

### Pattern 4: Судьба сессии для клиента

Рекомендуемая форма (схема в `packages/exam-core/src/attempt-session.ts`, имена на усмотрение) [ASSUMED: форма ответа, решает планировщик]:

```ts
type SessionFate =
	| { state: 'open'; sessionId: string; startedAt: string; serverNow: string }
	| { state: 'submitted'; attemptId: string; submitSource: 'client' | 'deadline'; uploadClosesAt: string | null; serverNow: string; attempt: AttemptView }
	| { state: 'expired'; serverNow: string }
```

- `GET /api/tests/public/tests/:id/sessions/:sessionId`: `validateUUID('id')`, `validateUUID('sessionId')`, `sessionRequired()`, затем `checkAttemptAccess` как у соседних маршрутов ученика. Сессия чужая или `superseded` → 404. Нужны перегенерация `route-inventory.txt` (`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory`) и, когда ADR-0006 (сейчас `Proposed`, файл не в git) будет внедрён, запись в `SCOPED_INLINE` с `checkAttemptAccess`.
- Тело 409 у `/submit` при `submit_source = 'deadline'`: `{ error: 'ATTEMPT_ALREADY_SUBMITTED', attemptId, submitSource: 'deadline', uploadClosesAt, serverNow, attempt }`. `SubmitAttemptErrorSchema` расширяется необязательными полями. Старая вкладка после выкатки читает только `error` и `attemptId` (`api.ts:39-56`), значит изменение обратно совместимо.
- `attempt` — `readAttemptView(attemptId, { kind: 'student', showCorrectAnswer: test.showCorrectAnswer })`, то же, что 200 у `/submit`. Отдельный маршрут «попытка по id для ученика» не нужен: `GET /api/tests/admin/attempts/:attemptId` проверяет `canReviewAttempt` = `zoned(req, 'tests.read', …)` [VERIFIED: scope-rules.ts:128-129], ученику он закрыт.
- `/start` (`AttemptSessionSchema`) получает `serverNow`. Поле объявить необязательным, чтобы новая страница не падала на старом API в момент выкатки.
- `AttemptViewObjectSchema` получает `uploadClosesAt: z.string().nullable()` (читатель `readAttemptRow` добавляет столбец). `serverNow` в 200 у `/submit` — необязательное поле того же объекта. Новые рантайм-экспорты exam-core внести в `EXPECTED_EXPORTS` в `scripts/check-exam-core-dist.mjs`.

### Pattern 5: Окно загрузки

**Вычисление при создании попытки (D-08)** — в той же вставке `submitAttempt`:

```
upload_closes_at =
  CASE WHEN has_open_question AND window_minutes > 0
       THEN LEAST(submitted_at, started_at + make_interval(mins => time_limit_minutes)) + make_interval(mins => window_minutes)
       ELSE NULL END
```

Для теста без лимита `LEAST(submitted_at, NULL)` в PostgreSQL даёт `submitted_at`: NULL в списке игнорируется [VERIFIED: проба на одноразовой базе PG 17 через `with-test-db`: `select least(timestamptz '2026-01-01 10:00+00', null) is not null` → `t`]. Признак `has_open_question` берётся из оценённых фактов (`facts.some((f) => f.template === 'open')`), повторный запрос к вопросам не нужен. Окно 0 даёт `NULL`, как «окна нет» в D-06.

**Правило «принимается ли фото сейчас» (D-09, TIME-04).** Чистое ядро с вариантами и SQL-обёртка:

```ts
type UploadWindowInput = {
	now: Date
	startedAt: Date
	timeLimitMinutes: number | null
	windowMinutes: number
	submittedAt: Date | null
	closedAt: Date | null
	uploadClosesAt: Date | null
}
type UploadWindowState =
	| { open: true; closesAt: Date | null }
	| { open: false; reason: 'session_closed' | 'no_window' | 'window_closed'; closesAt: Date | null }
```

- Сессия закрыта (`expired`/`superseded`) → `session_closed`.
- Сдана → `uploadClosesAt === null` ? `no_window` : `now < uploadClosesAt` ? открыто : `window_closed`.
- Открыта, без лимита → открыто, `closesAt: null`.
- Открыта, с лимитом → граница `started_at + limit + window`. Это покрывает грейс до финализации: окно уже началось от конца таймера.

SQL-обёртка `photoUploadWindow(executor, { sessionId })` читает строку сессии (с `LEFT JOIN test_attempts` по `attempt_id` и `JOIN tests`) и `clock_timestamp() AS db_now` в той же транзакции **после** блокировки строки. `now()` здесь не подходит: это время начала транзакции, и после ожидания блокировки оно устаревает [CITED: postgresql.org/docs/17/functions-datetime.html]. Тексты отказа — в UI-SPEC. Маршрутов фото в этой фазе нет, функция покрывается интеграционным тестом.

**Поле теста.** `UpdateTestSettingsSchema` и `SaveTestSchema`: `photoUploadWindowMinutes: z.number().int().min(0).max(120).optional()`. В `updateTestSettings` (`relocate.ts:466-480`) значение ставится в `values` только если пришло, иначе старый редактор сотрёт его. Drizzle пропускает ключи со значением `undefined` в `.set()` [ASSUMED: поведение drizzle 0.45; проверить тестом «старое тело без поля не меняет значение»]. Редактор: `TestSettingsPanel` уже получает `form.questions` (`TestSettingsPanel.tsx:288`), поле показывается при наличии вопроса с шаблоном `open` (D-11).

### Pattern 6: Модуль фоновых задач

```ts
type Job = { name: string; intervalMs: number; runOnce: (ctx: { signal: AbortSignal }) => Promise<JobReport> }
type JobRunner = {
	register(job: Job): void
	start(): void
	stop(): Promise<void>
	runNow(name: string): Promise<JobReport | { skipped: 'locked' }>
}
```

- **Замок на весь прогон.** `db.transaction(async (lockTx) => { const [row] = await lockTx.execute(sql\`SELECT pg_try_advisory_xact_lock(${JOB_LOCK_NAMESPACE}, hashtext(${name})) AS locked\`); if (!locked) return skipped; return job.runOnce(...) })`. Работа задачи идёт **другими** соединениями пула (по транзакции на сессию, D-17). Транзакция-замок только держит замок и простаивает. Это работает, пока на сервере `idle_in_transaction_session_timeout` = 0 (на одноразовой PG 17 по умолчанию `0` [VERIFIED: проба `current_setting` через `with-test-db`]); если владелец сервера когда-нибудь включит этот предел, он должен быть больше длительности прогона. Если замок взять только на время выборки, второй экземпляр сможет начать тот же прогон после коммита первого, а критерий 4 требует, чтобы этого не было. Правильность «ровно одна попытка» обеспечивают не замок, а `FOR UPDATE` и уникальные индексы (Pattern 3, п. 4).
- **Ключ замка:** форма из двух `int`. В коде уже есть `pg_advisory_xact_lock(hashtext(${key}))` с одним ключом (`asset-index.ts:92`). Пространства одного `bigint` и пары `int` не пересекаются [CITED: postgresql.org/docs/17/functions-admin.html], поэтому `hashtext('finalize-deadlines')` не столкнётся с ключами картинок. Константа пространства — любое фиксированное число [ASSUMED].
- **Цикл:** `setTimeout` после завершения прогона (не `setInterval`), чтобы прогоны не накладывались. `unref()` у таймера. Исключение прогона ловится и пишется в лог, таймер ставится снова. `stop()` снимает таймер, переводит `AbortController` в `abort` и ждёт текущий прогон. `runOnce` проверяет `signal.aborted` между сессиями батча.
- **`finalize-deadlines`:** раз в 30 с, батч 50 сессий [ASSUMED: размер, Claude's Discretion]. Выборка: `test_sessions JOIN tests` где `submitted_at IS NULL AND closed_at IS NULL AND tests.time_limit_minutes IS NOT NULL AND now() > started_at + make_interval(mins => time_limit_minutes + ATTEMPT_GRACE_PERIOD_MINUTES) + interval '60 seconds'`, `ORDER BY started_at LIMIT 50`. Индекс не нужен: открытых сессий единицы (в переносе 227 сессий всего [VERIFIED: ~/.claude/servers/bio-exam.md]), частичный `test_sessions_open_uniq` уже сужает выборку.
- **`reconcile-outcomes`:** только через `jobs:run`. Чинит только попытки `none`: обёртка над `reconcileOutcomes({ loadLatestScores: async () => new Map(), repair })`, которая для строк не `none` только сообщает расхождение и не вызывает `materializeAttemptOutcome`. Иначе `graded` вернётся в `pending` (`09-REVIEW.md:262`, `deferred-items.md:24-26`). Чинить проще параметром `repairOnly: 'none'` в `reconcileOutcomes` (`outcome.ts:164-209`).
- **Старт** только в `index.ts` после `listen`. `app.ts` модуль не импортирует, поэтому его не получают ни тесты (`startAuthApp` импортирует `../app.js`), ни контейнер `migrate` (`node dist/scripts/apply-migration.js` [VERIFIED: ~/.claude/servers/bio-exam.md]).
- **`jobs:run`:** `app/server/src/scripts/jobs-run.ts` по образцу `storage-reconcile.ts`: строгий разбор аргументов, `runNow(name)`, печать отчёта, `pgPool.end()` в `finally`, `process.exitCode = 1` при ошибке, отдельный код выхода (например 75) при `skipped: 'locked'`. В `package.json`: `"jobs:run": "tsx src/scripts/jobs-run.ts"`. На сервере: `docker compose … exec -T api node dist/scripts/jobs-run.js finalize-deadlines` (как `inline-images.js` в профиле сервера).

### Pattern 7: Остановка (PLAT-02)

```ts
type Shutdown = (signal: string) => Promise<void>
function createShutdown(deps: {
	server: http.Server
	jobs: { stop(): Promise<void> }
	pool: { end(): Promise<void> }
	drainMs: number
	log: Logger
	exit: (code: number) => void
}): Shutdown
```

Порядок:
1. Повторный вызов (второй сигнал) — сразу `exit(1)`. Первый ставит флаг.
2. `server.close(cb)`: новые соединения не принимаются, простаивающие keep-alive закрываются сразу (Node ≥ 19) [CITED: nodejs.org/docs/latest-v24.x/api/http.html]. Соединения, освободившиеся после ответа, нужно добивать: раз в 1 с вызывать `server.closeIdleConnections()`, пока не сработает колбэк `close` [ASSUMED: закрывает ли Node keep-alive соединение, ставшее простаивающим после `close()`, без повторного вызова — не проверено; периодический вызов безопасен в любом случае].
3. Параллельно `jobs.stop()`.
4. Ждать обоих не дольше `drainMs` = 25 000 (D-18). По пределу — `server.closeAllConnections()` и лог числа оборванных.
5. `pool.end()`, затем `exit(0)`. Сейчас `index.ts:21-41` закрывает пул сразу после `server.close` без ожидания и выходит через 5 с: в профиле сервера это записано как известный риск («При рестарте возможны ошибки текущих запросов») [VERIFIED: ~/.claude/servers/bio-exam.md:48].

`index.ts` только связывает: `listen`, `jobs.start()`, `process.on('SIGTERM'|'SIGINT', …)`. Модуль остановки тестируется отдельно (Validation Architecture).

Ограничение, которое надо записать честно: Compose при `up -d` пересоздаёт контейнер так — сначала останавливает старый, потом запускает новый. Пока старый дренирует, новые запросы Caddy получат отказ соединения (502). Дренаж спасает запросы в полёте, а не новые. Клиент попытки переживает 502 повторами очереди [ASSUMED: точный порядок пересоздания в Compose v5 не проверен].

### Pattern 8: Клиент — серверное время, текст только для чтения, «Ответ принят»

- **Якорь серверного времени** (`server-clock.ts`, чистый): `anchor = { serverMs: Date.parse(serverNow), localMs: clock.now() }` при каждом ответе с `serverNow`; `serverTime() = anchor.serverMs + (clock.now() - anchor.localMs)`. `deadlineMs()` и `secondsLeft()` в `lifecycle.ts:314-325` считают от `serverTime()`, а не от `clock.now()`. Якорь сохраняется в кэше сессии (`test-session-…`), чтобы `isAbandonedExpired` после перезагрузки не судил по часам устройства. В e2e `page.clock` подменяет и `clock.now()`, поэтому `fastForward` продолжает работать.
- **Только чтение после дедлайна (D-12):** в снимок добавить `pastDeadline`. `interactionDisabled = DISABLED_PHASES.has(phase) || pastDeadline`, `answer()` после дедлайна игнорируется. Если автосдача упала без связи, `failSubmit` возвращает фазу `active` (`lifecycle.ts:580-584`) и сейчас ввод снова включается. После правки поля остаются только для чтения, а кнопка «Повторить» отправки работает. Для текста — `readOnly`, не `disabled`: текст можно выделить и скопировать, контраст не теряется (проверка контраста — в UI-SPEC, память `check-text-contrast`).
- **Новый исход** `classifySubmitFailure`: 409 с `submitSource: 'deadline'` и разобранным `attempt` → `{ kind: 'finalized', attempt, uploadClosesAt, serverNow }`. В модуле — фаза `submitted` с `result = attempt` и признаком `acceptedByServer` плюс `uploadClosesAt` и `unsent` в снимке. Тот же исход даёт GET судьбы со `state: 'submitted'`.
- **Сверка WAL (D-14)** (`unsent.ts`, чистая функция): `unsentAnswers(wal.answers, attempt.results) → Record<questionId, AnswerValue>` — ответы WAL, которые отличаются от `results[].userAnswer` по `stableSerialize` или отсутствуют там. Пусто → ключи очищаются как при успехе. Не пусто → WAL переносится в `test-unsent-${attemptId}-${userId}` (новый префикс внутри `attempt-lifecycle`), а снимок отдаёт `unsent` для блока только для чтения. `STORAGE_KEYS_BY_EVENT` получает событие `finalized` без `wal`, перенос делает модуль.
- **Судьба до `/start`:** в `init()` при кэше сессии теста с лимитом сначала `api.readSession(testId, cached.sessionId)`. `open` → прежний путь `runStart(cached)`. `submitted` → исход выше. `expired` → `time-expired`. Сбой сети → прежний путь. Новый метод API — в `AttemptLifecycleApi` и в `use-attempt-lifecycle.ts`. Охранник `draft-durability-guards.test.mjs` запрещает в `TestRunner.tsx` прямые вызовы API попытки, поэтому вызов делает модуль.

### Pattern 9: Одно обновление сессии на браузер (PLAT-03)

От чего на самом деле защищает замок. Куки общие для всех вкладок, а сервер в окне `REFRESH_REUSE_WINDOW_MS` (30 с) отвечает на повтор того же токена `reused` (только новый access) [VERIFIED: services/session/index.ts:140-175]. Поэтому две вкладки с одновременным refresh обычно получают `reused`, а не `replay`. `replay` с отзывом сессии случается, когда предъявлен старый токен, а преемник уже использован (`state.successor_used`). Типичный сценарий: три и больше вкладок просыпаются вместе (крышка ноутбука), запросы уходят с одним токеном, один ротирует, другой ротирует преемника, третий запоздал. Есть и второй сценарий — `regrant` при повторе вне окна, который отзывает неиспользованных преемников. Замок сериализует refresh внутри браузера: каждый следующий держатель отправляет уже свежую куку. Проверка «соседняя вкладка уже обновила» убирает лишние ротации.

```ts
type RefreshCoordinatorDeps = {
	locks: Pick<LockManager, 'request'> | null
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
	now: () => number
	perform: () => Promise<RefreshOutcome>
}
```

- `refreshOnce()`: `calledAt = now()`. Нет `locks` → прежний `performRefresh` с дедупликацией во вкладке (`client.ts:78-85`). Иначе `locks.request('bio-exam:session-refresh', { signal: AbortSignal.timeout(20_000) }, async () => …)`. Внутри: прочитать `localStorage['bio-exam:session-refresh'] = { refreshedAt, accessExpiresAt }`. Если `refreshedAt >= calledAt` (соседка обновила после того, как мы решили обновлять) → `{ kind: 'ok', accessExpiresAt }` без сети. Иначе `perform()`, при `ok` записать общую запись. Срок доступа из JS не прочитать (кука `HttpOnly`), поэтому сигнал — эта запись.
- Таймаут ожидания замка → `{ kind: 'unavailable' }`; keep-alive повторит через 30 с (`REFRESH_RETRY_MS`). Держатель замка ограничивает свой `fetch` тем же пределом, чтобы зависший запрос не держал замок вечно.
- Подходит обоим вызывающим: keep-alive (`AuthProvider` → `sessionClient.refreshOnce`) и путь 401 в `fetchWithSession`. После пропуска повтор запроса уйдёт с новой кукой.
- Остаток риска: обновление в прокси Next (`proxy.ts:47-48`, при переходе по странице с истёкшим access) идёт на сервере, вне замка. С ним пересекается только первый же refresh клиента в пределах 30 с и получает `reused`. Записать как остаточный риск, без правок.
- Запись `bio-exam:session-refresh` удаляется при выходе.

### Pattern 10: Очистка при выходе (PLAT-04)

- Пять префиксов с суффиксом `-<userId>`: `test-session-`, `test-answers-wal-`, `test-frozen-`, `test-client-attempt-` (все `<prefix><testId>-<userId>`), `question-draft-wal-<draftId>-<userId>`, плюс новый `test-unsent-<attemptId>-<userId>`.
- Охранник `scripts/draft-durability-guards.test.mjs` разрешает литералы `test-answers-wal-`, `test-session-`, `test-frozen-` только в `app/web/components/tests/attempt-lifecycle` [VERIFIED: draft-durability-guards.test.mjs:309-316]. Поэтому `clearUserAttemptStorage(storage, userId)` экспортируется из `attempt-lifecycle/storage-keys.ts`, а `forgetUserQuestionDraftCopies(storage, userId)` — из `lib/drafts/question-draft-copy.ts`, по образцу существующей `forgetQuestionDraftCopies` (обход `storage.length`/`key(i)` с конца). Чистые модули `attempt-lifecycle` не трогают `localStorage` напрямую (тот же охранник): хранилище приходит параметром, а передаёт `window.localStorage` вызывающий `AuthProvider.logout`.
- Ловушка порядка. `logout` → очистка → `window.location.assign(LOGGED_OUT_PATH)` → на странице теста срабатывает `pagehide` → `closeSegment` → `applyTelemetry` → `updateWal`, который создаёт WAL заново из `emptyWal` [VERIFIED: wal.ts:96-105]. Рекомендация: после очистки повесить `window.addEventListener('pagehide', clear, { once: true })`. Слушатель регистрируется после слушателя модуля и сработает после него. То же сделать в других вкладках, получивших событие `storage` с ключом `logout` (`AuthProvider.tsx:126-129`), для их `me.id`.
- Только явный выход. Выход по 401 WAL оставляет (решение v1.0, `06-REVIEW-DISPOSITION.md:33`: «при выходе по 401 WAL оставлять (D-13)»).

### Pattern 11: CR-03 и CR-05

- **CR-03** (`06-REVIEW.md:176-184`) — это не «возврат назад» в общем смысле. `drain()` при `pagehide`/`dispose` шлёт значение ключа параллельно запросу в полёте по тому же ключу. Если старое значение сервер обработал вторым, на сервере остаётся старое. После восстановления из bfcache keepalive-подтверждение снимает `pending`, и после перезагрузки новое значение теряется. Правка в `lib/drafts/save-queue.ts` (`drain`, `settleDrained`, `:258-323`): запомнить, что в момент `drain` по ключу был запрос в полёте со старой версией. При `ok` такого досланного значения не подтверждать, оставить запись `due`, чтобы после ответа старого запроса `pump` отправил последнее значение ещё раз. В хуке `browserVisibility` добавить `pageshow` с `event.persisted` → событие видимости, чтобы очередь сразу повторила отправку, а для теста с лимитом заново узнать судьбу сессии. Очередь общая с автосохранением черновика вопроса: тесты `save-queue.test.ts` закрепляют оба пользователя.
- **CR-05** (`06-REVIEW.md:194-200`): у теста без лимита первый `/start` упал, модуль в `active` с `session === null`, а `online`/`visible` вызывают только `queue.retryNow()` для пустой очереди. Правка: в `onVisibility` для `online`/`visible` и по таймеру с паузами `SAVE_RETRY_DELAYS_MS`, пока `phase === 'active' && session === null && !timeLimitMinutes`, повторять `/start` «на месте». Успех — `applyServerSession(server, null)` + `enqueuePending()` без повторного `enterActive(true)`, иначе вырастет счётчик визитов телеметрии.

### Anti-Patterns to Avoid

- **Финализация внутри чужой транзакции.** Изнутри `startAttemptSession`/`saveSessionDraft` вызов зависнет на `FOR UPDATE` той же строки (Pitfall 1).
- **Финализация в дедлайн, а не после грейса.** Это ровно C1.
- **Стирать WAL при любом 409/422.** Это нынешний `STORAGE_KEYS_BY_EVENT`, его меняет D-14.
- **`now()` для границы окна после ожидания блокировки.** Нужен `clock_timestamp()`.
- **`setInterval` для задач.** Прогоны накладываются, и при остановке не понять, что ждать.
- **Импорт `background-jobs` из `app.ts` или из модулей, которые импортирует `app.ts`.**
- **Сравнение ответа по `JSON.stringify` без сортировки ключей** (ответ `matching` — объект). Использовать `stableSerialize`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Идемпотентность серверной сдачи | свой флаг «финализируется» | `FOR UPDATE` + `test_attempts_session_id_uniq` + `(user_id, client_attempt_id)` | уже доказано тестом `attempt-races.test.ts` |
| Оценка черновика | отдельная оценка для дедлайна | `scoreSubmission` | D-02, один снимок фактов |
| Взаимное исключение задач между процессами | таблица «замков» | `pg_try_advisory_xact_lock(int,int)` | снимается коммитом и при обрыве соединения |
| Координация вкладок | `localStorage`-мьютекс с тайм-аутами | `navigator.locks` | замок снимается при закрытии вкладки, есть очередь [ASSUMED: снятие при закрытии вкладки — по спецификации W3C, на MDN не описано] |
| Сериализация для сравнения | свой `stableJson` | `stableSerialize` (`lib/drafts/question-draft-copy.ts`) | уже есть; в `wal.ts` есть приватный `stableJson`, лучше не плодить третий |
| Дренаж keep-alive | свой учёт сокетов | `server.close` + `closeIdleConnections`/`closeAllConnections` | встроено в Node 24 |
| Время для обратного отсчёта | `Date.now()` устройства | якорь `serverNow` | M6 |

**Key insight:** все опасные места здесь — гонки и порядок шагов, а не алгоритмы. Каждое ручное решение добавляет ещё одно состояние, которое придётся сверять с уникальными индексами и блокировками.

## Common Pitfalls

### Pitfall 1: Вложенная транзакция и пул из двух соединений
**What goes wrong:** финализация, вызванная изнутри `startAttemptSession` или `saveSessionDraft`, ждёт `FOR UPDATE` строки, которую держит внешняя транзакция, на другом соединении пула. Это самоблокировка до `statement_timeout` (10 с). Если свободных соединений нет (dev: `PG_POOL_MAX` 2), ожидание соединения упирается в `connectionTimeoutMillis` (5 с).
**How to avoid:** финализацию вызывать только из маршрута до входа в транзакцию. Внутренние функции получают исход («нужна финализация») и не вызывают её сами. `scoreSubmission` ходит через глобальный `db`, поэтому внутри транзакции его тоже не вызывать.
**Warning signs:** тест гонки висит ~10 с и падает по таймауту, ошибки `timeout exceeded when trying to connect`. Родственная ловушка в той же функции: перепроверка черновика под блокировкой по `draft_updated_at` как `Date` (столбец без часового пояса) может никогда не совпасть, и каждая финализация уйдёт в повторы; сравнивать содержимое `draft_answers` (Pattern 1, шаг 5).

### Pitfall 2: Соединение-замок фоновой задачи
**What goes wrong:** транзакция-замок держит одно соединение весь прогон. В dev и e2e пул 2, значит запросам остаётся одно. Задача работает и в e2e (`tsx src/index.ts`).
**How to avoid:** прогон короткий (батч 50, обычно 0 сессий). Внутри замка не держать блокировки строк. Тест гонки запускать с `PG_POOL_MAX: '12'`, как `attempt-races.test.ts:78`.
**Warning signs:** e2e медленнее на 30-секундных отметках.

### Pitfall 3: Клиентская сдача на краю грейса против фона
**What goes wrong:** см. Pattern 3, п. 5. Без запаса фон финализирует черновик, а более полные ответы клиента получают 409.
**How to avoid:** запас `FINALIZE_SETTLE` = 60 с только для фоновой выборки [ASSUMED: значение; больше `statement_timeout` и типичной оценки]. Тест: предпроверка `open` на 11-й минуте, сдвиг на 12 мин 30 с, `runOnce()` не трогает сессию, `submitAttempt` даёт `created`.

### Pitfall 4: `/start` молча начинает новую сессию с таймером и стирает WAL
**What goes wrong:** кэш сессии есть, часы устройства отстают, сервер уже финализировал. `runStart(cached)` получает новую сессию, ветка `session-replaced` вызывает `clearAttemptKeys(…, 'session-replaced')` (`wal`, `frozen`, `clientAttemptId`), и в фоне начинается новый таймер без «Начать тест?».
**How to avoid:** судьба сессии до `/start` (Pattern 8).

### Pitfall 5: Изменение лимита теста во время попытки
**What goes wrong:** `sessionExpired` берёт **текущий** `time_limit_minutes`. Автор уменьшил лимит, и фон финализирует раньше, чем ожидал ученик.
**How to avoid:** поведение то же, что у нынешней проверки сдачи. Записать в README сервера, не чинить.

### Pitfall 6: Тесты и экземпляры модулей после `vi.resetModules`
**What goes wrong:** `startAuthApp` делает `vi.resetModules()` и заново импортирует `app.js` и `db/index.js`. Модуль задач, импортированный статически в тесте, держит **другой** `db` и пишет не в тестовую базу.
**How to avoid:** в тесте импортировать `services/background-jobs` и `services/attempt-sessions` динамически после `startAuthApp`, как `dbModule`. Вызывать `runOnce()`/`runNow()` напрямую, `start()` в тестах не вызывать. Известный флейк `57P01` при закрытии базы (память `flaky-answer-keys-jsonb`) не ловить своим кодом: таймеры задач в тестах не запускаются.

### Pitfall 7: Таймеры держат процесс
**What goes wrong:** `jobs:run` или тест не завершается: таймер задачи или незакрытый пул.
**How to avoid:** `unref()` у таймера, `pgPool.end()` в `finally` скрипта, `stop()` в `afterAll`, если тест что-то стартовал.

### Pitfall 8: Порядок очистки при выходе
**What goes wrong:** WAL создаётся заново на `pagehide` после очистки (Pattern 10).
**How to avoid:** повтор очистки на `pagehide` с `once`. e2e: после выхода на `/login` в `localStorage` нет ключей с суффиксом `-<userId>`.

### Pitfall 9: Старая вкладка и новый API (M11)
**What goes wrong:** во время выкатки страница со старым кодом получает новое тело 409 или новые поля.
**How to avoid:** только добавлять необязательные поля. Код ошибки и статус 409/422 не менять (D-05).

### Pitfall 10: `submittedAt` серверной попытки и граница окна
**What goes wrong:** `submittedAt = now()` при ленивой финализации через день ставит дату сдачи «сегодня», а `upload_closes_at` всё равно от конца таймера, и окно уже закрыто. Ученик видит сдачу сегодня и закрытое окно.
**How to avoid:** `submittedAt = started_at + limit` (A2). Для фото это корректно: окно от конца таймера (TIME-02).

### Pitfall 11: Черновик, который больше не оценивается
**What goes wrong:** удалённый вопрос или изменённый тип в `draft_answers` → `scoreSubmission` даёт `answers_invalid`, финализация падает на каждом прогоне.
**How to avoid:** фильтрация по текущим вопросам и поштучная проверка (Pattern 1, шаг 2).

### Pitfall 12: Контракт exam-core и сборка
**What goes wrong:** сервер или web не видят новых полей: пакет потребляется из `dist`. CI `build` падает на `check-exam-core-dist.mjs`.
**How to avoid:** `yarn workspace @bio-exam/exam-core build` перед отдельным `yarn workspace @bio-exam/server test`. Новые рантайм-экспорты (схемы) — в `EXPECTED_EXPORTS`. Шаги job `build` прогнать локально до передачи пуша.

### Pitfall 13: Снимок маршрутов и порядок регистрации
**What goes wrong:** новый `GET /tests/:id/sessions/:sessionId` не внесён в `route-inventory.txt` — падает `route-inventory.snapshot.test.ts`.
**How to avoid:** перегенерировать снимок командой из навыка `bio-exam-api` и приложить diff в SUMMARY.

### Pitfall 14: Web Locks и зависший запрос
**What goes wrong:** держатель замка ждёт `fetch` без предела, остальные вкладки ждут замок, keep-alive не срабатывает.
**How to avoid:** `AbortSignal.timeout` на ожидание замка и предел на `fetch` держателя.

## Code Examples

### Параметризованная вставка в `submitAttempt` (эскиз; имена новых параметров — предложение)

```ts
// Источник полей: app/server/src/services/attempt-sessions/submit.ts:151-172, schema.ts testAttempts
const uploadClosesAt = input.uploadWindow.hasOpenQuestion && input.uploadWindow.minutes > 0
	? sql`LEAST(${submittedAtSql}, ${testSessions.startedAt} + make_interval(mins => ${input.uploadWindow.timeLimitMinutes}::int)) + make_interval(mins => ${input.uploadWindow.minutes}::int)`
	: null
const [inserted] = await tx
	.insert(testAttempts)
	.values({
		testId,
		userId,
		sessionId: testSessionId,
		clientAttemptId,
		answers,
		submitSource: input.source,
		submittedAt: submittedAtSql,
		uploadClosesAt,
	})
	.onConflictDoNothing()
	.returning({ id: testAttempts.id })
```

`uploadClosesAt` и `photoUploadWindowMinutes` — новые столбцы 0030 [ASSUMED: имена Drizzle-полей]. `testSessions.startedAt` в подзапросе вставки — эскиз: в реальном коде `started_at` уже прочитан под `FOR UPDATE` и передаётся значением. Остальные поля — как в нынешней вставке.

### Транзакция-замок прогона

```ts
// Источник: drizzle db.transaction (как в submit.ts), PG pg_try_advisory_xact_lock(int, int)
async function runLocked(job: Job, signal: AbortSignal): Promise<JobReport | { skipped: 'locked' }> {
	return db.transaction(async (lockTx) => {
		const result = await lockTx.execute<{ locked: boolean }>(
			sql`SELECT pg_try_advisory_xact_lock(${JOB_LOCK_NAMESPACE}::int, hashtext(${job.name})) AS locked`
		)
		if (!result.rows[0]?.locked) return { skipped: 'locked' as const }
		return job.runOnce({ signal })
	})
}
```

### Остановка

```ts
// Источник: Node 24 http.Server.close/closeIdleConnections/closeAllConnections
export function createShutdown({ server, jobs, pool, drainMs, log, exit }: ShutdownDeps) {
	let started = false
	return async (signal: string) => {
		if (started) return exit(1)
		started = true
		log.info({ signal }, 'shutdown started')
		const closed = new Promise<void>((resolve) => server.close(() => resolve()))
		const reaper = setInterval(() => server.closeIdleConnections(), 1000)
		const drained = Promise.all([closed, jobs.stop()])
		const timedOut = await Promise.race([drained.then(() => false), delay(drainMs).then(() => true)])
		clearInterval(reaper)
		if (timedOut) server.closeAllConnections()
		await pool.end().catch((err) => log.error({ err }, 'pool end failed'))
		exit(0)
	}
}
```

### Сверка WAL

```ts
// Источник: AttemptViewSchema.results[].userAnswer (attempt-result.ts:140-152), stableSerialize
export function unsentAnswers(
	wal: Readonly<Record<string, AnswerValue>>,
	results: readonly { questionId: string; userAnswer: unknown }[]
): Record<string, AnswerValue> {
	const stored = new Map(results.map((r) => [r.questionId, stableSerialize(r.userAnswer ?? null)]))
	return Object.fromEntries(
		Object.entries(wal).filter(([questionId, value]) => stored.get(questionId) !== stableSerialize(value))
	)
}
```

Вопрос, которого больше нет в попытке, тоже попадает в `unsent`: его текст ученик видит. Варианты для табличного теста: совпало, отличается, нет в попытке, `matching` с другим порядком ключей (совпадение), массив с другим порядком (различие).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.close()` + ручной `closeIdleConnections` | `server.close()` сам закрывает простаивающие | Node 19 | меньше кода, но соединения, освободившиеся после `close`, стоит добивать периодически |
| Мьютекс вкладок через `localStorage` | Web Locks | Baseline март 2022 | очередь и снятие замка встроены |
| `now()` для границ | `clock_timestamp()` после блокировки | — | M5 |

**Deprecated/outdated:**
- Закрытие просроченной непустой сессии как `expired` в `startAttemptSession` и 422 у `/submit` для непустого черновика — заменяются финализацией.
- `pgPool.end()` сразу после `server.close` в `index.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Запас фоновой выборки `FINALIZE_SETTLE` = 60 с после грейса | Pattern 6, Pitfall 3 | Меньше — гонка C1 с медленной оценкой; больше — попытка появляется у учителя позже |
| A2 | `submittedAt` серверной попытки = `started_at + limit` | Pattern 1, Pitfall 10 | Если нужен момент финализации, поменяется только эта строка и сортировка истории |
| A3 | Форма `SessionFate` и тела 409 (`submitSource`, `attempt`, `uploadClosesAt`, `serverNow`) | Pattern 4 | Контракт web↔API; меняется в одном месте exam-core |
| A4 | Новый маршрут `GET …/sessions/:sessionId` вместо расширения `/start` | Pattern 4 | Альтернатива — `resumeSessionId` в теле `/start` |
| A6 | Drizzle 0.45 пропускает `undefined` в `.set()` | Pattern 5 | Старый редактор сотрёт окно; ловится тестом |
| A7 | Батч 50 и интервал 30 с | Pattern 6 | Только производительность |
| A8 | Node не добивает соединение, ставшее простаивающим после `close()`, без повторного вызова | Pattern 7 | Периодический вызов безопасен в любом случае |
| A9 | Compose пересоздаёт контейнер «сначала стоп, потом старт» | Pattern 7 | Влияет только на ожидания по 502 во время выкатки |
| A10 | Web Lock снимается при закрытии вкладки | Don't Hand-Roll | По спецификации W3C; на MDN не описано |
| A11 | Константа пространства ключа advisory lock — любое фиксированное число | Pattern 6 | Нет |

## Open Questions

1. **Что делать с WAL при `TIME_EXPIRED` (D-04, пустой серверный черновик), если в WAL есть текст?**
   - What we know: D-04 не создаёт попытку; TIME-06 запрещает стирать недошедший текст без сверки; сейчас `time-expired` стирает все ключи.
   - Recommendation: то же правило D-14. Сервер не сохранил ничего, значит весь текст WAL — недошедший. Он переносится в `test-unsent-…` по id сессии и показывается только для чтения рядом с «Время вышло». Попытка не создаётся.

2. **Финализировать ли сессию ученика, у которого сняли назначение или сняли тест с публикации?**
   - What we know: ленивые пути идут после `checkAttemptAccess` (403 раньше финализации); у фона нет `req` для `canReadTest`.
   - Recommendation: фон финализирует независимо от текущего назначения: сессия открыта законно, работа сделана. Читатели уже фильтруют видимость. Удаление теста каскадом удаляет сессии.

3. **Где показывать недошедший текст после ухода со страницы?**
   - Recommendation: только на странице прохождения в экране результата этой попытки, пока есть ключ `test-unsent-…`. Кнопка «Скрыть» удаляет ключ; новая попытка (`retake`) и выход удаляют тоже. Остальное — в UI-SPEC.

4. **Часовой пояс «до ЧЧ:ММ».**
   - Recommendation: `Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })` в поясе устройства; обратный отсчёт — от якоря `serverNow`. Момент абсолютный, поэтому ошибка возможна только при неверном поясе устройства.

5. **Нужна ли проверка судьбы на `visible` после долгого скрытия?**
   - Recommendation: да для теста с лимитом, если по серверному времени прошёл дедлайн. Иначе только `init` и `pageshow` с `persisted`.

6. **Стоит ли добавить `test-unsent-` в охранник ключей?**
   - Recommendation: да, одной строкой в существующий список `ATTEMPT_KEY_CHECKS`. Нового охранника не заводить (память `test-hygiene`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | всё | ✓ | v24.17.0 | — |
| Yarn (Corepack) | скрипты | ✓ | 4.12.0 | — |
| PostgreSQL 17 (Homebrew) | `with-test-db`, `yarn verify` | ✓ | `postgresql@17`, `pg_ctl`/`postgres`/`psql` в `/opt/homebrew/bin` | — |
| Chromium для Playwright | `yarn e2e` | не проверялось | — | `yarn playwright install chromium` |
| Сервер (Compose, `deploy.sh`) | выкатка | у пользователя | Compose v5.6.0 [VERIFIED: ~/.claude/servers/bio-exam.md] | — |

**Missing dependencies with no fallback:** нет.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (server, web), `node:test` (`scripts/*.test.mjs`), Playwright (e2e) |
| Config file | `app/server/vitest.config.*`, `app/web/vitest.config.ts`, `e2e/playwright.config.ts` |
| Quick run command | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- src/routes/tests/attempt-deadline.test.ts` |
| Full suite command | `yarn verify` (+ `yarn e2e` отдельно) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TIME-01 | Фон финализирует просроченную сессию по черновику, `submit_source = 'deadline'`, `client_attempt_id = 'deadline:<sid>'`, `submitted_at` = конец таймера | server integration | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- attempt-deadline` | ❌ Wave 1 (`app/server/src/routes/tests/attempt-deadline.test.ts`) |
| TIME-01 | Гонка: `Promise.all` (ленивая через GET, `runNow`, `/submit`) × 5 раундов → ровно одна попытка, все ответы указывают на неё | server integration | то же, `PG_POOL_MAX: '12'` | ❌ там же или в `attempt-races.test.ts` |
| TIME-01 | Краевой случай: предпроверка `open`, сдвиг за грейс, но в пределах запаса → `runOnce` не трогает, клиент `created` | server integration | то же | ❌ |
| TIME-01 | D-04: пустой черновик → `closed expired`, попыток 0; PATCH после грейса → финализация, 404; PATCH в грейсе → 200 | server integration | `attempt-time-limit.test.ts` (обновить) | ✅ меняются `:88`, `:151`, `:290` |
| TIME-01 | Черновик с удалённым вопросом финализируется без него | server integration | `attempt-deadline` | ❌ |
| TIME-02/04 | `upload_closes_at` при сдаче клиента и сервера, без лимита, окно 0, без `open` → NULL | server integration (засеянный `open` через `insertAttemptFixture`/`addQuestion`) | `attempt-deadline` | ❌ |
| TIME-04 | Чистое правило окна: таблица вариантов | unit (server) | `yarn workspace @bio-exam/server test -- upload-window` | ❌ |
| TIME-04 | `photoUploadWindow` на `clock_timestamp()`: до и после границы (сдвиг `started_at`) | server integration | `attempt-deadline` | ❌ |
| TIME-02 | Поле окна: 0…120, 121 → 400, тело без поля не меняет значение, по умолчанию 15 | server integration | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- test-settings` | проверить существующий тест настроек |
| TIME-03/06 | Тело 409 финализации и GET судьбы несут `attempt`, `uploadClosesAt`, `serverNow` | server integration | `attempt-deadline` | ❌ |
| TIME-06 | Сверка WAL: таблица вариантов | unit (web) | `yarn workspace @bio-exam/web test -- unsent` | ❌ |
| TIME-06 | Модуль: 409 финализации → `submitted` + `acceptedByServer`, WAL совпал → ключи очищены, не совпал → `test-unsent-…` | unit (web, модуль с фейками) | `yarn workspace @bio-exam/web test -- lifecycle-submit` | ✅ меняется `:266-283` |
| TIME-06 | init с кэшем: GET судьбы `submitted` → без `/start`; `expired` → `time-expired` без нового таймера | unit (web) | `lifecycle-restore` | ✅ меняется `:88` |
| TIME-02 | После дедлайна по серверному времени поля только для чтения, после сбоя автосдачи тоже | unit (web) + e2e | `lifecycle-time`; `yarn e2e -- timed-attempt` | ✅ дополнить |
| TIME-06 | e2e «Ответ принят»: связь пропала до таймера, `page.route` отвечает на `/submit` 409 финализации (`route.fulfill` с телом от сервера) → «Ответ принят», «Фото можно добавить до», блок недошедшего текста | e2e | `yarn e2e -- deadline-finalised` | ❌ (`e2e/tests/deadline-finalised.spec.ts`) |
| TIME-01 | e2e с настоящей серверной финализацией: сид `e2e-seed.ts` создаёт отдельному ученику просроченную сессию с черновиком; спек открывает тест и видит «Ответ принят» (путь — ленивый GET или фон, спек проверяет исход) | e2e | то же | ❌ (правка `app/server/src/scripts/e2e-seed.ts`) |
| PLAT-01 | `runNow` под замком: второй параллельный вызов → `skipped: 'locked'`; `stop()` ждёт текущий прогон и прерывает батч | server integration | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- background-jobs` | ❌ |
| PLAT-01 | `reconcile-outcomes` не трогает `graded`/`pending` | server integration | `outcome.test.ts` (дополнить) | ✅ |
| PLAT-01 | `jobs:run` неизвестное имя → код 1; известное → отчёт | ручная проверка в SUMMARY (`node scripts/with-test-db.mjs yarn workspace @bio-exam/server jobs:run finalize-deadlines`) | — | — |
| PLAT-02 | `createShutdown`: медленный маршрут на `startTestServer`, сигнал во время запроса → ответ 200 дошёл, новое соединение отклонено, `pool.end` вызван после ответа и после `jobs.stop`; предел → `closeAllConnections` | server integration (без БД, фейковый пул) | `yarn workspace @bio-exam/server test -- shutdown` | ❌ |
| PLAT-03 | Координатор: нет `locks` → прежний путь; соседка обновила → без сети; соседка упала → своя попытка; таймаут замка | unit (web) | `yarn workspace @bio-exam/web test -- refresh-coordinator` | ❌ |
| PLAT-03 | Две страницы одного контекста, `page.clock` у обеих, сдвиг к концу access → ровно один `POST /api/auth/refresh`, обе страницы авторизованы | e2e | `yarn e2e -- session` | ✅ дополнить `session.spec.ts` |
| PLAT-04 | Выход на странице теста с черновиком → на `/login` в `localStorage` нет ключей пяти префиксов с `-<userId>` (и `test-unsent-`) | e2e | `yarn e2e -- session` или `answer-durability` | ❌ |
| CR-03 | `drain` при запросе в полёте не подтверждает досланное значение, после ответа старого уходит последнее | unit (web, `save-queue.test.ts`) | `yarn workspace @bio-exam/web test -- save-queue` | ✅ дополнить |
| CR-05 | Тест без лимита, `/start` упал, `online` → повтор `/start`, ответы уходят в очередь, визит не задваивается | unit (web) | `lifecycle.test.ts` | ✅ дополнить |

### Sampling Rate
- **Per task commit:** точечный тест файла задачи (`with-test-db` + `-- <файл>` для сервера, `yarn workspace @bio-exam/web test -- <файл>` для web).
- **Per wave merge:** `yarn verify`.
- **Phase gate:** `yarn verify: OK` + `yarn e2e` зелёный + шаги CI job `build` локально (`node scripts/check-exam-core-dist.mjs`, сборка web, `yarn editor:budget`).

### Wave 0 Gaps (характеризация до правок, по ROADMAP)
- [ ] Перечитать и при необходимости дополнить характеризацию поведения, которое фаза **намеренно** меняет. Сначала закрепить нынешнее поведение, потом менять отдельной задачей, чтобы diff показывал смену поведения:
  - `app/server/src/routes/tests/attempt-time-limit.test.ts:88` (`/start` за грейсом с черновиком `'a'` → `test_attempts = 0`; станет 1);
  - `:151` (PATCH за грейсом → 200 и запись; станет финализация + 404);
  - `:290` (сдача на 13-й минуте → 422; с непустым черновиком станет 409);
  - `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts:266-283` (409 стирает четыре ключа) и `:288-323` (422 стирает четыре ключа);
  - `lifecycle-restore.test.ts:88` (повтор при восстановлении, 409);
  - `lifecycle-time.test.ts:156-212` (автосдача, восстановление в пределах льготы): после смены часов на серверный якорь они должны остаться зелёными без правок ожиданий;
  - `app/web/components/tests/attempt-submit-flow.test.ts` (`STORAGE_KEYS_BY_EVENT`).
- [ ] Недостающая характеризация: модуль после неудачной автосдачи без связи возвращает ввод (фаза `active`, `interactionDisabled = false`). Тест закрепляет нынешнее, D-12 меняет.
- [ ] Порядок контракта: изменения exam-core (`uploadClosesAt` в `AttemptViewObjectSchema`, тело 409, `SessionFate`, `serverNow` в `AttemptSessionSchema`) идут **первым планом**, до серверных и web-планов. Обязательное поле в виде попытки сразу ломает `readAdminAttemptView` (`AdminAttemptViewSchema.parse`, `read.ts:138`) на каждой странице разбора у персонала, пока `buildAttemptView` его не заполняет, а также ручную фикстуру вида в `packages/exam-core/src/attempt-result.test.ts:338-346`, `insertAttemptFixture` (`app/server/src/test-support/attempt-fixture.ts`) и `app/server/src/scripts/e2e-seed.ts` (вызывает `submitAttempt` напрямую, `:124`, `:335`). Тот же план обновляет эти места и `EXPECTED_EXPORTS`.
- [ ] `app/server/src/test-support/attempt-world.ts`: помощник `shiftStartedAt` (сейчас локальный в `attempt-time-limit.test.ts:51-55`), чтение строки попытки с `submit_source`, `client_attempt_id`, `upload_closes_at`.
- [ ] Фреймворк ставить не нужно.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | частично | не менять `rotateRefreshToken`; координация refresh только на клиенте |
| V3 Session Management | да | Web Locks против `replay`; очистка ключей при явном выходе; запись `bio-exam:session-refresh` без токенов |
| V4 Access Control | да | новый GET судьбы через `checkAttemptAccess` + сессия только своего `userId` (`sessionOfPair`); 404 на чужую |
| V5 Input Validation | да | zod: `photoUploadWindowMinutes` 0…120; `validateUUID` на `sessionId`; черновик перед финализацией фильтруется по вопросам теста |
| V6 Cryptography | нет | — |
| V8 Data Protection | да | на общих компьютерах ключи черновиков (копия черновика вопроса содержит `correct`, T-6-09) удаляются при выходе |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Подделка `clientAttemptId = 'deadline:…'` клиентом | Tampering | `SubmitAttemptRequestSchema` требует UUID |
| Чтение чужой судьбы сессии или попытки | Information disclosure | фильтр `test_sessions.user_id = req.authUser.id`, ответ 404 |
| Загрузка фото после окна | Tampering | одно правило на `clock_timestamp()`, решает только сервер |
| Повтор refresh-токена при нескольких вкладках | Spoofing (ложное срабатывание защиты) | Web Locks + проверка «уже обновлено» |
| Данные ученика на школьном ПК после выхода | Information disclosure | очистка пяти префиксов + `test-unsent-` |
| Падение API во время экзамена при выкатке | DoS | дренаж 25 с, `stop_grace_period` ≥ 30 с, защита `deploy.sh` по незавершённым сессиям |

## Выкатка и шаги пользователя

- Миграция `0030` (новая запись в `_journal.json` с `when` > `1791268928915`, запись в `migrations-manifest.json` с `sha256`, снимок `0030_snapshot.json` из `drizzle:generate`). Содержимое: `ALTER TABLE tests ADD COLUMN photo_upload_window_minutes integer DEFAULT 15 NOT NULL`, CHECK `BETWEEN 0 AND 120`, `ALTER TABLE test_attempts ADD COLUMN upload_closes_at timestamptz`. Новых внешних ключей на `users` нет, поэтому каталог ADR-0007 (`user-deletion-rule.test.ts`) не меняется. Существующие тесты получают 15 по умолчанию (D-07), существующие попытки — `NULL`.
- **Автовыкатка пропустит этот релиз:** `autodeploy.sh:26-31` при изменениях в `app/server/drizzle/` и без `AUTO_MIGRATIONS=1` пишет «в $SHA есть изменения базы данных, автообновление пропущено» [VERIFIED: ~/.claude/servers/bio-exam-ops/autodeploy.sh]. Выкатка ручная, `deploy.sh`.
- **Когда выкатывать:** `deploy.sh:56-58` останавливает выкатку при незавершённых `test_sessions` за 4 часа (`DEPLOY_STOPPED`, код 75) [VERIFIED: deploy.sh]. Выкатывать без `FORCE=1`, когда нет идущих попыток с лимитом (шаг ROADMAP). После фазы просроченные сессии с лимитом закрывает сервер, но сессии тестов без лимита остаются открытыми (D-03) и по-прежнему держат защиту 4 часа.
- **`stop_grace_period`:** по умолчанию 10 с [CITED: docs.docker.com/reference/compose-file/services/], а дренаж API — до 25 с. Пользователь ставит у сервиса `api` в файле Compose на сервере `stop_grace_period: 30s` (или больше) и сверяет, что `stop_signal` не переопределён (по умолчанию SIGTERM). API запущен как `node --enable-source-maps dist/index.js` [VERIFIED: ~/.claude/servers/bio-exam.md:75]; явные обработчики `SIGTERM` работают и у PID 1.
- **Ручной запуск задачи на сервере:** команда exec в контейнере api через файл Compose на сервере, запускающая `dist/scripts/jobs-run.js finalize-deadlines` (по образцу `inline-images.js` в профиле сервера). Записать в README сервера и в профиль сервера (это делает пользователь, агент сервер не трогает).
- Защита выкатки на открытые окна загрузки — вне фазы (фаза 17).

## Sources

### Primary (HIGH confidence)
- Код репозитория (прочитан в этой сессии): `app/server/src/services/attempt-sessions/{sessions,submit,index}.ts`, `app/server/src/routes/tests/public.ts`, `app/server/src/services/scored-attempt/{facts,outcome,read,index}.ts`, `app/server/src/db/{schema,index}.ts`, `app/server/src/index.ts`, `app/server/src/app.ts`, `app/server/src/services/session/{index,cookies}.ts`, `app/server/src/routes/auth/refresh.ts`, `app/server/src/services/access-policy/scope-rules.ts`, `app/server/src/services/question-content/{relocate,asset-index}.ts`, `app/server/src/schemas/tests.ts`, `app/server/src/scripts/storage-reconcile.ts`, `app/server/src/test-support/{auth-app,attempt-world}.ts`, `app/server/src/routes/tests/{attempt-time-limit,attempt-races}.test.ts`, `packages/exam-core/src/{attempt-result,attempt-session,registry}.ts`, `app/web/components/tests/attempt-lifecycle/{lifecycle,storage-keys,wal,use-attempt-lifecycle,testing,index}.ts`, `app/web/components/tests/{attempt-submit-flow,client-attempt-id}.ts`, `app/web/lib/drafts/{save-queue,question-draft-copy}.ts`, `app/web/lib/session/{client,keep-alive,access-token,schedule,transport,proxy-refresh}.ts`, `app/web/components/providers/AuthProvider.tsx`, `app/web/lib/tests/api.ts`, `scripts/draft-durability-guards.test.mjs`, `scripts/check-exam-core-dist.mjs`, `e2e/playwright.config.ts`, `e2e/tests/timed-attempt.spec.ts`, `e2e/fixtures/exam.ts`, `app/server/drizzle/meta/_journal.json`, `app/server/drizzle/migrations-manifest.json`.
- Планирование: `11-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `research/{SUMMARY,PITFALLS,ARCHITECTURE}.md`, `research/pwa/SUMMARY.md`, `phases/09-…/deferred-items.md`, `milestones/v1.0-phases/06-draft-durability/{06-REVIEW,06-REVIEW-DISPOSITION}.md`, `docs/adr/0005`, `docs/adr/0006` (Proposed).
- Профиль сервера: `~/.claude/servers/bio-exam.md`, `~/.claude/servers/bio-exam-ops/{deploy,autodeploy}.sh`.
- CodeGraph `impact` для `submitAttempt`, `startAttemptSession`, `precheckSubmit`.

### Secondary (MEDIUM confidence)
- [Node.js 24 http](https://nodejs.org/docs/latest-v24.x/api/http.html) — `server.close`, `closeIdleConnections`, `closeAllConnections`.
- [PostgreSQL 17 Advisory Lock Functions](https://www.postgresql.org/docs/17/functions-admin.html) — `pg_try_advisory_xact_lock`, непересекающиеся пространства ключей.
- [PostgreSQL 17 Date/Time Functions](https://www.postgresql.org/docs/17/functions-datetime.html) — `now()` и `clock_timestamp()`.
- [MDN Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) — доступность, secure context, `signal`.
- [Docker Compose services reference](https://docs.docker.com/reference/compose-file/services/) — `stop_grace_period` 10 с по умолчанию.

### Tertiary (LOW confidence)
- Снятие Web Lock при закрытии вкладки, порядок пересоздания контейнера в Compose v5, `undefined` в Drizzle `.set()`, разбор `timestamp` без пояса в node-pg — см. Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — новых зависимостей нет, версии из `package.json`.
- Architecture: HIGH для серверной части и гонок (код и тесты прочитаны); MEDIUM для формы клиентского контракта (A3, A4).
- Pitfalls: HIGH — каждая ловушка привязана к строкам кода.

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (код меняется быстро; перед планированием сверить строки, если в `dev` появятся новые коммиты в `attempt-sessions` или `attempt-lifecycle`).
