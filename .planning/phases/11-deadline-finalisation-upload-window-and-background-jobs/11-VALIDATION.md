---
phase: "11"
slug: "deadline-finalisation-upload-window-and-background-jobs"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-06"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Источник: `11-RESEARCH.md` → «Validation Architecture».

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (server, web), `node:test` (scripts), Playwright (e2e) |
| **Config file** | `app/server/vitest.config.*`, `app/web/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Quick run command** | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- <файл>`; web: `yarn workspace @bio-exam/web test -- <файл>` |
| **Full suite command** | `yarn verify` (затем отдельно `yarn e2e`) |
| **Estimated runtime** | server ~70 с, web ~10 с, `yarn verify` ~5 мин, `yarn e2e` ~6 мин |

---

## Sampling Rate

- **After every task commit:** точечный тест файла задачи
- **After every plan wave:** `yarn verify`
- **Before `/gsd-verify-work`:** `yarn verify: OK`, `yarn e2e` зелёный, шаги CI job `build` локально (`node scripts/check-exam-core-dist.mjs`, сборка web, `yarn editor:budget`)
- **Max feedback latency:** 90 seconds для быстрых проверок задач

---

## Per-Task Verification Map

Заполняется по задачам планов при исполнении. Карта требований → тесты из исследования:

| Requirement | Behavior | Test Type | File / command | Exists |
|-------------|----------|-----------|----------------|--------|
| TIME-01 | Фон финализирует просроченную сессию по черновику, `submit_source = 'deadline'`, `client_attempt_id = 'deadline:<sid>'`, `submitted_at` = конец таймера | server integration | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- attempt-deadline` | ❌ Wave 1 (`app/server/src/routes/tests/attempt-deadline.test.ts`) |
| TIME-01 | Гонка: `Promise.all` (ленивая через GET, `runNow`, `/submit`) × 5 раундов → ровно одна попытка, все ответы указывают на неё | server integration | то же, `PG_POOL_MAX: '12'` | ❌ там же или в `attempt-races.test.ts` |
| TIME-01 | Краевой случай: предпроверка `open`, сдвиг за грейс, но в пределах запаса → `runOnce` не трогает, клиент `created` | server integration | то же | ❌ |
| TIME-01 | D-04: пустой черновик → `closed expired`, попыток 0; PATCH после грейса → финализация, 404; PATCH в грейсе → 200 | server integration | `attempt-time-limit.test.ts` (обновить) | ✅ меняются `:88`, `:151`, `:163` (11-06); `:290` остаётся |
| TIME-01 | D-21: сессия, у которой дедлайн плюс грейс прошли 25 ч назад, с непустым черновиком → закрыта `expired`, попытки нет, черновик в строке; 23 ч → попытка `deadline`; задача: нижняя граница выборки и `stale` в отчёте | server integration | `attempt-deadline` (11-04, 11-06, 11-07), `background-jobs` (11-08) | ❌ |
| TIME-01 | Ошибка данных финализации (вопрос типа `'mystery'`) → `/start` 200, прежняя сессия `expired`; задача пропускает битую сессию по памяти сбоев | server integration | `attempt-deadline` (11-06), `background-jobs` (11-08) | ❌ |
| TIME-01 | Черновик с удалённым вопросом финализируется без него | server integration | `attempt-deadline` | ❌ |
| TIME-02/04 | `upload_closes_at` при сдаче клиента и сервера, без лимита, окно 0, без `open` → NULL | server integration (засеянный `open` через `insertAttemptFixture`/`addQuestion`) | `attempt-deadline` | ❌ |
| TIME-04 | Чистое правило окна: таблица вариантов | unit (server) | `yarn workspace @bio-exam/server test -- upload-window` | ❌ |
| TIME-04 | `photoUploadWindow` на `clock_timestamp()`: до и после границы (сдвиг `started_at`) | server integration | `attempt-deadline` | ❌ |
| TIME-02 | Поле окна: 0…120, 121 → 400, тело без поля не меняет значение, по умолчанию 15 | server integration | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- test-settings` | проверить существующий тест настроек |
| TIME-03/06 | Тело 409 финализации и GET судьбы несут `attempt`, `uploadClosesAt`, `serverNow` | server integration | `attempt-deadline` | ❌ |
| TIME-06 | Сверка WAL: таблица вариантов | unit (web) | `yarn workspace @bio-exam/web test -- unsent` | ❌ |
| TIME-06 | Модуль: 409 финализации → `submitted` + `acceptedByServer`, WAL совпал → ключи очищены, не совпал → `test-unsent-…` | unit (web, модуль с фейками) | `yarn workspace @bio-exam/web test -- lifecycle-submit` | ✅ меняется `:266-283` |
| TIME-06 | init с кэшем: GET судьбы `submitted` → без `/start`; `expired` с непустым текстом WAL (и запасной путь по часам) → `time-expired` с пометкой, WAL до «Начать заново»; без текста → «Начать тест?»; замена сессии в `applyServerSession` переносит неподтверждённый текст в `test-unsent-` (11-14) | unit (web) | `lifecycle-restore` | ✅ меняется `:88` |
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

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Перечитать и при необходимости дополнить характеризацию поведения, которое фаза **намеренно** меняет. Сначала закрепить нынешнее поведение, потом менять отдельной задачей, чтобы diff показывал смену поведения:
  - `app/server/src/routes/tests/attempt-time-limit.test.ts:88` (`/start` за грейсом с черновиком `'a'` → `test_attempts = 0`; станет 1);
  - `:151` (PATCH за грейсом → 200 и запись; станет финализация + 404);
  - `:163` (PATCH в сессию, закрытую `/start` за грейсом, с черновиком `'a'`: ждёт `close_reason = 'expired'` и черновик; станет финализацией с попыткой `deadline`, PATCH → 404; сценарий «закрыта expired» переносится на пустой черновик);
  - `:290` (сдача на 13-й минуте → 422; с непустым черновиком станет 409);
  - `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts:266-283` (409 стирает четыре ключа) и `:288-323` (422 стирает четыре ключа);
  - `lifecycle-restore.test.ts:88` (повтор при восстановлении, 409);
  - `lifecycle-time.test.ts:156-212` (автосдача, восстановление в пределах льготы): после смены часов на серверный якорь они должны остаться зелёными без правок ожиданий;
  - `app/web/components/tests/attempt-submit-flow.test.ts` (`STORAGE_KEYS_BY_EVENT`).
- [ ] Недостающая характеризация: модуль после неудачной автосдачи без связи возвращает ввод (фаза `active`, `interactionDisabled = false`). Тест закрепляет нынешнее, D-12 меняет.
- [ ] Порядок контракта: изменения exam-core (`uploadClosesAt` в `AttemptViewObjectSchema`, тело 409, `SessionFate`, `serverNow` в `AttemptSessionSchema`) идут **первым планом**, до серверных и web-планов. Обязательное поле в виде попытки сразу ломает `readAdminAttemptView` (`AdminAttemptViewSchema.parse`, `read.ts:138`) на каждой странице разбора у персонала, пока `buildAttemptView` его не заполняет, а также ручную фикстуру вида в `packages/exam-core/src/attempt-result.test.ts:338-346`, `insertAttemptFixture` (`app/server/src/test-support/attempt-fixture.ts`) и `app/server/src/scripts/e2e-seed.ts` (вызывает `submitAttempt` напрямую, `:124`, `:335`). Тот же план обновляет эти места и `EXPECTED_EXPORTS`.
- [ ] `app/server/src/test-support/attempt-world.ts`: помощник `shiftStartedAt` (сейчас локальный в `attempt-time-limit.test.ts:51-55`), чтение строки попытки с `submit_source`, `client_attempt_id`, `upload_closes_at`.
- [ ] Фреймворк ставить не нужно.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `stop_grace_period` контейнера API не меньше времени дренажа | PLAT-02 | Compose-файл на сервере | Пользователь: проверить и выставить ≥ 30 с до выкатки |
| Выкатка 0030 вне идущей попытки с лимитом | TIME-01 | Сервер вне доступа агентов | Ручной `deploy.sh` (автовыкатка пропускает миграции), защита выкатки ждёт открытые попытки |
| `jobs:run` неизвестное и известное имя | PLAT-01 | Вывод команды записывается в SUMMARY | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server jobs:run finalize-deadlines` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (быстрые проверки задач)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
