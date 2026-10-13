---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 18
subsystem: e2e
status: complete
tags: [e2e, seed, deadline, upload-window, docs, skills, phase-gate]
requires:
  - phase: 11-22
    provides: submitSession и startAttemptSession в сиде, публичный интерфейс services/attempt-sessions
  - phase: 11-20
    provides: attemptDisplay, STORAGE_EFFECTS в модуле попытки web
  - phase: 11-13
    provides: UnsentTextNote, ключ test-unsent-
  - phase: 11-12
    provides: UploadWindowLine, заголовок «Ответ принят»
provides:
  - "Сид e2e: аккаунты deadline-student-<проект>, тесты deadline-timed-<проект> (лимит 5 мин, окно 120 мин), блок sessions с просроченной сессией и черновиком, счётчик sessions=<n>"
  - "e2e/tests/deadline-finalised.spec.ts: критерии 1-3 ROADMAP на настоящем сервере"
  - "README сервера и навыки bio-exam-api, bio-exam-web, bio-exam-data описывают финализацию, окно для фото, фоновые задачи, остановку, модули web"
affects: [phase-11-verification, 12, 13, 14]
actuals:
  tokens: 11000
  tasks: 3
  commits: 0
plan_head_before: 063d10579fb0fabee1dc7c3d971128ab0714c461
plan_head_after: 063d10579fb0fabee1dc7c3d971128ab0714c461
tech-stack:
  added: []
  patterns:
    - "Просрочка в e2e задаётся сидом (started_at 10 минут назад), без ожидания реальных минут; кэш сессии в localStorage пишет page.addInitScript"
    - "409 финализации подменяется page.route: реальный сервер сдаёт попытку с ответом из черновика, route.fulfill отдаёт 409 с видом этой попытки"
key-files:
  created:
    - e2e/tests/deadline-finalised.spec.ts
  modified:
    - app/server/src/scripts/e2e-seed.ts
    - e2e/fixtures/seed.json
    - e2e/fixtures/accounts.ts
    - app/server/README.md
    - .agents/skills/bio-exam-api/SKILL.md
    - .agents/skills/bio-exam-web/SKILL.md
    - .agents/skills/bio-exam-data/SKILL.md
key-decisions:
  - "Блок sessions сида идёт после блока attempts и до уведомлений, запись сессии прямая (testSessions), вне транзакции тестов; неизвестный тест или ученик - ошибка с именем"
  - "draft_updated_at сессии сида - на минуту позже started_at (девять минут назад): черновик давно устоялся; исход проверяется, а не путь (ленивое чтение судьбы или задача)"
  - "Контраст строки окна и пометки измеряется по вычисленным стилям отдельным помощником спека; lowContrastTexts по всей странице исключает записи кнопок номеров вопросов (см. отклонение 1)"
requirements-completed: [TIME-01, TIME-03, TIME-06, PLAT-01, PLAT-02]
coverage:
  - id: D1
    description: "Критерий 1: засеянная просроченная сессия с черновиком, открытие теста даёт «Ответ принят» без «Начать тест?», одна попытка"
    requirement: TIME-01
    verification:
      - kind: e2e
        ref: "e2e/tests/deadline-finalised.spec.ts#TIME-01, TIME-03"
        status: pass
    human_judgment: false
  - id: D2
    description: "Критерии 2 и 3: строка «Фото можно добавить до», заголовок исхода в фокусе"
    requirement: TIME-03
    verification:
      - kind: e2e
        ref: "e2e/tests/deadline-finalised.spec.ts#TIME-01, TIME-03"
        status: pass
    human_judgment: false
  - id: D3
    description: "Подменённый 409 deadline: «Ответ принят», пометка недошедшего текста, «К вопросу 1», ключ test-unsent-, одна попытка"
    requirement: TIME-06
    verification:
      - kind: e2e
        ref: "e2e/tests/deadline-finalised.spec.ts#TIME-06"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ворота фазы: yarn verify, полный yarn e2e, шаги CI job build"
    verification:
      - kind: command
        ref: "yarn verify; yarn e2e; сборки rbac, exam-core, server, web, editor:budget"
        status: pass
    human_judgment: false
---

# Phase 11 Plan 18: сквозные проверки дедлайна, документация, ворота фазы

**Критерии 1-3 ROADMAP проверены в браузере на настоящем сервере: ученик с засеянной просроченной сессией открывает тест и видит «Ответ принят» и строку окна для фото, а подменённый 409 серверной финализации показывает недошедший текст; README сервера и три навыка описывают модули фазы; `yarn verify`, полный `yarn e2e` и шаги CI job `build` зелёные.**

## Performance

- Задачи: 3 из 3
- Файлы: 7 изменены, 1 создан (плюс `deferred-items.md` и этот SUMMARY в `.planning`)
- Коммитов нет: правило фазы (EXEC-RULES, режим worktree) запрещает исполнителю коммитить, коммит делает ведущая сессия; `commits: 0` при изменениях кода ожидаем, `plan_head_after` равен `plan_head_before`

## Что сделано

### Сид (задача 1)

- `app/server/src/scripts/e2e-seed.ts`: `SeedTest.timeLimitMinutes?`, `SeedTest.photoUploadWindowMinutes?` передаются во вставку теста только когда заданы; тип `SeedSession` и блок `sessions` (прямая вставка `test_sessions`: `id`, `test_id`, `user_id`, `started_at = now - startedMinutesAgo`, `draft_answers` с id вопросов по ключам сида, `draft_updated_at`); строка счётчиков дополнена `sessions=<n>`.
- `e2e/fixtures/seed.json`: аккаунт `deadline-student-<проект>` в конце `accounts`; тест `deadline-timed-<проект>` (тема `e2e-deadline`, лимит 5, окно 120, вопросы `dt-text` короткий текст и `dt-open` открытый, назначен этому ученику); блок `sessions` с фиксированным UUID на проект (`…1d01` desktop, `…1d02` mobile), `startedMinutesAgo: 10`, черновик на оба вопроса.
- `e2e/fixtures/accounts.ts`: типы `SeedSession`, поля теста, `sessions?` проекта.
- Строка счётчиков в живом прогоне: `e2e-seed: users=130 tests=30 questions=48 prompts=48 attempts=4 notifications=42 sessions=2` (до плана было users=128, tests=28, questions=44).
- Расширена существующая шапка-комментарий `e2e-seed.ts` (в строке счётчиков добавлено `sessions=<n>`): новых комментариев в коде нет.

### Спек `e2e/tests/deadline-finalised.spec.ts` (задачи 1 и 2)

- Первый тест (tracer): контекст `deadline-student-<проект>`, id теста через `GET …/tests/<slug>?view=summary`, id ученика `currentUserId`, `page.addInitScript` пишет `test-session-<testId>-<userId>` = `{ sessionId, startedAt }`, переход на `/start`; ждёт «Ответ принят» (в фокусе), «Время вышло, ответы приняты автоматически.», строку «Фото можно добавить до», без диалога «Начать тест?»; `attemptIdsOf` - одна попытка. Затем контраст строки окна и ширина 375 px.
- Второй тест: тест `createOwnTest` с коротким ответом и лимитом 2 мин; первый текст сохранён PATCH 200, связь отключена, поле дописано строкой без пробелов (150 символов), `clock.fastForward` за дедлайн, видна панель сбоя; `page.route` на `/submit` (`times: 1`) вызывает `route.fetch` с телом, где `answers` заменены на `{ <id вопроса>: 'сохранено' }`, и отдаёт 409 `ATTEMPT_ALREADY_SUBMITTED` с `submitSource: 'deadline'` и `attempt` - реальным видом попытки; связь возвращается, автоповтор ловит 409; ждёт «Ответ принят», заголовок пометки «Часть ответа, набранная без связи, не дошла до сервера», блок «Текст вопроса 1 с этого устройства» с полным локальным текстом, одну попытку, один ключ `test-unsent-` в `localStorage`; на 375 px - контраст, `horizontalOverflow`, `lowContrastTexts`; «К вопросу 1» переводит фокус на номер вопроса карточки. `finally`: связь включена, `closeOpenSession`, `deleteOwnTest`.
- Запуск: `yarn e2e tests/deadline-finalised.spec.ts` - `20 passed` (16 setup + по два теста на chromium-desktop и chromium-mobile).

### Документация (задача 3)

- `app/server/README.md`, «Попытка теста»: `serverNow` в `/start` и PATCH, 404 PATCH после льготы, `sessionExpired` как одна формула, финализация по дедлайну (`submit_source = 'deadline'`, `submitted_at` - конец таймера, пустой черновик - `expired`, давность D-21 `DEADLINE_FINALIZE_MAX_AGE_HOURS`, закрытие при ошибке данных, три раунда по изменившемуся черновику), ленивые пути и задача `finalize-deadlines`, маршрут судьбы сессии, расширенное тело 409, окно для фото (`photo_upload_window_minutes`, `upload_closes_at`, `photoUploadWindow`, 422 `UPLOAD_WINDOW_CLOSED` / `UPLOAD_WINDOW_NONE`), сокращение попытки уменьшением лимита. Устаревшая фраза о закрытии просроченной сессии при `start` заменена.
- `bio-exam-api`: список экспортов `services/attempt-sessions` по 11-22 вместо `precheckSubmit`, `submitAttempt`, `closeExpiredSession`; `sendSessionOutcome`; финализация, давность, закрытие при ошибке данных, судьба сессии, 409, окно фото; новый раздел «Фоновые задачи» (`createBackgroundJobs`, замок, старт из `index.ts`, `jobs:run`, отчёт `finalize-deadlines`, остановка `createShutdown`).
- `bio-exam-web`: серверные часы, `deadlinePassed` и `DeadlinePanel`, `attemptDisplay` и `STORAGE_EFFECTS`, чтение судьбы при открытии страницы, «Ответ принят» и `UploadWindowLine`, сверка WAL и ключ `test-unsent-`, `refresh-coordinator.ts`, очистка ключей при выходе, форма настроек теста.
- `bio-exam-data`: последняя миграция `0030_attempt_upload_window`, раздел про столбцы окна.
- Приёмка по документам: `finalizeSessionByDeadline|background-jobs` в навыке api - 3 строки; `DEADLINE_FINALIZE_MAX_AGE_HOURS` - навык api 2, README 1; `0030_attempt_upload_window` в навыке data - 2; `refresh-coordinator|test-unsent-` в навыке web - 2; в добавленных строках адресов вида `N.N.N.N` и `/opt/` нет (0).

## Замеры

Ширина (горизонтальная прокрутка), `horizontalOverflow(page)` на 375 px: пусто в обоих тестах на обоих проектах (в первом тесте при видимой строке окна, во втором при видимых панели исхода и пометке).

Контраст по вычисленным стилям (одинаков на chromium-desktop и chromium-mobile):

| Элемент | Контраст |
|---------|----------|
| строка окна «Фото можно добавить до …» (`text-foreground`) | 12.81 |
| отсчёт «осталось N мин» (`text-muted-foreground`) | 5.00 |
| заголовок пометки «не дошла до сервера» (375 px) | 15.55 |
| текст «с этого устройства» (375 px) | 13.00 |

Все значения не ниже 4.5. Строка без пробелов в 150 символов внутри блока пометки на 375 px не даёт горизонтальной прокрутки (переносится `break-words`).

## Итоги ворот

- `yarn verify`: `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests - все passed).
- Полный `yarn e2e`: `376 passed (7.0m)`, падений нет.
- Шаги CI job `build` локально: `yarn workspace @bio-exam/rbac build` и `check-rbac-dist.mjs`, `yarn workspace @bio-exam/exam-core build` и `check-exam-core-dist.mjs`, `yarn workspace @bio-exam/server build`, `yarn workspace @bio-exam/web build`, `yarn editor:budget` - все с кодом 0; бюджет: `raw 2611371, gzip 730850` на обоих маршрутах редактора, `editor bundle OK`.
- `yarn format:check`: все файлы в формате.
- `11-plan-files.cjs check 11-18` не запускался (режим worktree, проверку делает ведущая сессия).
- `codegraph affected` по `e2e-seed.ts`, `accounts.ts`, `deadline-finalised.spec.ts` (индекс основного checkout, состояние `dev` до правок): тесты `e2e/fixtures/accounts.ts`, `e2e/tests/deadline-finalised.spec.ts`; Markdown и JSON индекс не охватывает, полный e2e прогнан целиком.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `lowContrastTexts` по всей странице падает на кнопках номеров вопросов, а не на поверхностях фазы**
- **Found during:** задача 2
- **Issue:** при отвеченном вопросе `lowContrastTexts(page)` на 375 px возвращает «1.81 «1»» (desktop) и «1.05 «1»» (mobile): кнопка номера вопроса в правой панели (`bg-green-500 text-white` в `TestRunner.tsx`), поверхность, существовавшая до фазы 11 и не входящая в UI-SPEC. План требует пустой результат «для панели исхода и пометки».
- **Fix:** проверка `lowContrastTexts` исключает записи вида «ratio «N»» (кнопки номеров), остальная страница по-прежнему проверяется; панель исхода и пометка дополнительно измерены прямо (таблица выше). Значение 1.05 на mobile не диагностировалось. Дефект записан в `deferred-items.md`; запись в WINDOWS.md не делалась.
- **Files modified:** `e2e/tests/deadline-finalised.spec.ts`

**2. [Rule 2 - Missing critical] Контраст строки окна не виден `lowContrastTexts`**
- **Found during:** задача 1
- **Issue:** видимая строка окна целиком `aria-hidden` (`UploadWindowLine`), а `lowContrastTexts` пропускает `aria-hidden`; требование плана о контрасте строки окна осталось бы непроверенным.
- **Fix:** спек измеряет оба `span` строки окна помощником по вычисленным стилям (локальный `elementContrast`, как в `notifications.spec.ts`).
- **Files modified:** `e2e/tests/deadline-finalised.spec.ts`

**3. Объём документации по списку экспортов.** Вместо строки навыка про `precheckSubmit`, `submitAttempt`, `closeExpiredSession` записан список экспортов из 11-22-SUMMARY; `photoUploadWindow` описана как рассчитанная на вызов из транзакции будущего маршрута фото (маршрутов фото пока нет), а не как существующий вызов.

Прочее: сид, спек и документы выполнены по плану; фактическое число вызовов в сиде и счётчик совпали с планом.

## Шаги пользователя

Вне репозитория, делает пользователь после всей фазы (правила сервера - профиль `bio-exam` и навык `server-deploy`):

1. У сервиса `api` в файле Compose на сервере `stop_grace_period` не меньше 30 с (дренаж API до 25 с; по умолчанию Compose ждёт 10 с), `stop_signal` не переопределён (SIGTERM).
2. До выкатки - в базе прода под ролью API: `SHOW idle_in_transaction_session_timeout;`. Значение `0` (предела нет) или не меньше 30 с - ничего не делать. Меньше 30 с - поднять для роли API (`ALTER ROLE <роль API> SET idle_in_transaction_session_timeout = '60s'`) или сообщить: прогон `finalize-deadlines` держит транзакцию-замок открытой до 20 с, и при меньшем пределе база рвёт соединение задачи (ошибка в логе каждые 30 с).
3. Миграция `0030_attempt_upload_window` выкатывается вручную через `deploy.sh`: автовыкатка пропускает коммиты с изменениями в `app/server/drizzle/`. Если прод ещё не на 0026-0029, все миграции идут одной выкаткой по правилам 0026 из профиля сервера (репетиция на свежем дампе, без отката одного образа).
4. Выкатывать, когда нет идущих попыток с лимитом времени (защита `deploy.sh` по незавершённым сессиям, без `FORCE=1`). После фазы просроченные сессии тестов с лимитом закрывает сервер, а открытые сессии тестов без лимита по-прежнему держат защиту.
5. После выкатки: последняя строка `public.__drizzle_migrations` - запись 0030 (`when` из `app/server/drizzle/migrations-manifest.json`); у тестов `photo_upload_window_minutes = 15`; в логах API раз в 30 с нет ошибок задачи `finalize-deadlines`.
6. После выкатки, через минуту-две (первый прогон задачи - через 30 с после старта), - D-21: `SELECT count(*), min(submitted_at), max(submitted_at) FROM test_attempts WHERE submit_source = 'deadline';`. Ожидание: попытки только по сессиям последних суток - `min(submitted_at)` (конец таймера) не раньше чем примерно за 24 ч до выкатки; более ранних нет. Исторический хвост закрыт без попыток: `SELECT count(*) FROM test_sessions WHERE close_reason = 'expired' AND closed_at >= <время выкатки>;` - примерно число давних открытых сессий тестов с лимитом, бывших до выкатки; `draft_answers` у них не стёрт. Если `min(submitted_at)` старше - остановить API и сообщить: правило D-21 не сработало.
7. Строки `shutdown started` и `shutdown complete` в логе API появляются при остановке контейнера начиная со следующей выкатки: эта выкатка останавливает старый процесс, у которого дренажа ещё нет. Проверка дренажа - при следующей выкатке или ручном `docker compose … stop api`.
8. Ручной разовый запуск задачи - в контейнере `api`: `node dist/scripts/jobs-run.js finalize-deadlines` (или `reconcile-outcomes`); код 75 - задача уже выполняется другим экземпляром. Строку команды с путём файла Compose пользователь записывает в профиль сервера сам.

## Known Stubs

Нет.

## Deferred Issues

- Кнопки номеров вопросов в правой панели страницы попытки (`bg-green-500 text-white` у отвеченного) не проходят AA по `lowContrastTexts`: 1.81 desktop, 1.05 mobile при 375 px. Поверхность до фазы 11, вне UI-SPEC. Подробно - `deferred-items.md` в каталоге фазы.

## Файлы к коммиту

- `app/server/src/scripts/e2e-seed.ts`
- `e2e/fixtures/seed.json`
- `e2e/fixtures/accounts.ts`
- `e2e/tests/deadline-finalised.spec.ts`
- `app/server/README.md`
- `.agents/skills/bio-exam-api/SKILL.md`
- `.agents/skills/bio-exam-web/SKILL.md`
- `.agents/skills/bio-exam-data/SKILL.md`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-18-SUMMARY.md`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/deferred-items.md`

## Self-Check: PASSED
