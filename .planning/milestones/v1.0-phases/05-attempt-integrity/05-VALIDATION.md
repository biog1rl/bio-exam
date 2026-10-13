---
phase: "5"
slug: "attempt-integrity"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 5 — Validation Strategy

> Контракт проверки фазы: требования ATT-01..ATT-06, SCORE-01..SCORE-05 и критерии успеха SC1..SC5 из ROADMAP.

---

## Test Infrastructure

| Свойство | Значение |
|----------|----------|
| **Фреймворки** | Vitest (exam-core, web, server), `node:test` для проверок репозитория в `scripts/`, Playwright (e2e) |
| **Конфиги** | `packages/exam-core/vitest.config.ts`, `app/web/vitest.config.ts`, `app/server/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Полный набор** | `yarn verify` (без e2e, сам поднимает одноразовый PostgreSQL 17), затем `yarn e2e` |
| **Время** | один воркспейс до 10 с; `yarn verify` 60–120 с; `yarn e2e` несколько минут |

Команды запуска; `<файл>` берётся из колонки «Файл теста»:

| Алиас | Команда |
|-------|---------|
| CORE | `yarn workspace @bio-exam/exam-core vitest run <файл>` |
| WEB | `yarn workspace @bio-exam/web vitest run <файл>` |
| SRV | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run <файл>` |
| GUARD | `node --test scripts/<файл>` |
| E2E | `yarn e2e tests/<файл>.spec.ts` |

---

## Per-Requirement Verification Map

Статус: ✅ есть автотест; ✅ + manual есть автотест и ручной остаток из Manual-Only; manual автотеста нет.

| Требование | Что проверяется | Тип | Файл теста | Команда | Статус |
|------------|-----------------|-----|------------|---------|--------|
| ATT-01 (SC1) | Шесть профилей на двух тестах и семи маршрутах попытки (админ, назначенный ученик, чужой, право `tests.read` с зоной и без, админ с запретом `tests.read`); 403 на start, PATCH и submit без побочных записей; маршруты вызывают `canReadTest` и `testScope` | integration (DB) + static | `app/server/src/routes/tests/attempt-access-matrix.test.ts`, `app/server/src/routes/tests/attempt-known-defects.test.ts`, `scripts/attempt-integrity-guards.test.mjs` | SRV `src/routes/tests/attempt-access-matrix.test.ts src/routes/tests/attempt-known-defects.test.ts`; GUARD `attempt-integrity-guards.test.mjs` | ✅ |
| ATT-01 (SC1) | Снятие назначения или права `tests.read` между start и PATCH или submit даёт 403 | integration (DB) | `app/server/src/routes/tests/attempt-access-revoke.test.ts` | SRV `src/routes/tests/attempt-access-revoke.test.ts` | ✅ |
| ATT-02 (SC2) | Submit без `sessionId` или `clientAttemptId` даёт 400; чужая, чужого теста и случайная сессия 404; закрытая просроченная 422; лимит времени | integration (DB) | `app/server/src/routes/tests/attempt-submit.test.ts`, `app/server/src/routes/tests/attempt-known-defects.test.ts`, `app/server/src/routes/tests/attempt-time-limit.test.ts` | SRV `src/routes/tests/attempt-submit.test.ts src/routes/tests/attempt-known-defects.test.ts src/routes/tests/attempt-time-limit.test.ts` | ✅ |
| ATT-03 | Миграция 0022: чистка дублей детерминирована (`started_at DESC, id DESC`), повтор идемпотентен, строки не удаляются; 23505 на второй открытой сессии и на второй попытке сессии | integration (DB) | `app/server/src/db/attempt-session-migration.test.ts`, `app/server/src/routes/tests/attempt-races.test.ts` | SRV `src/db/attempt-session-migration.test.ts src/routes/tests/attempt-races.test.ts` | ✅ |
| ATT-04 (SC2) | Параллельные submit с одним `clientAttemptId`: все 200, тела равны, попытка одна; с разными: один 200, остальные 409; повтор конверта | integration (DB) | `app/server/src/routes/tests/attempt-races.test.ts`, `app/server/src/routes/tests/attempt-submit.test.ts` | SRV `src/routes/tests/attempt-races.test.ts src/routes/tests/attempt-submit.test.ts` | ✅ + manual |
| ATT-04 (SC2) | Клиент: один `clientAttemptId` на весь цикл повторов, классификация 409, 422, 404 | unit | `app/web/components/tests/client-attempt-id.test.ts`, `app/web/components/tests/attempt-submit-flow.test.ts`, `packages/exam-core/src/attempt-result.test.ts` | WEB `components/tests/client-attempt-id.test.ts components/tests/attempt-submit-flow.test.ts`; CORE `attempt-result.test.ts` | ✅ |
| ATT-04 (SC2) | Ответ submit потерян после записи на сервере, «Повторить» шлёт `sessionId` и тот же `clientAttemptId`, попытка одна | e2e (`@att04`) | `e2e/tests/submit-retry.spec.ts` | E2E `submit-retry` | ✅ |
| ATT-05 (SC3) | Параллельные PATCH ответов и телеметрии не теряют ни одного поля | integration (DB) | `app/server/src/routes/tests/attempt-races.test.ts` | SRV `src/routes/tests/attempt-races.test.ts` | ✅ |
| ATT-06 (SC5) | DB-тесты гонок, доступа и лимита времени идут в шаге `lint-typecheck-test` команды `yarn verify`; структура CI-workflow и шаги `yarn verify` проверены | static + unit | `scripts/check-ci-workflow.mjs`, `scripts/check-ci-workflow.test.mjs`, `scripts/verify.test.mjs` | GUARD `check-ci-workflow.test.mjs verify.test.mjs`; шаг `ci-workflow` в `yarn verify` | ✅ + manual |
| SCORE-01 (SC4) | В строке попытки сохранены ключ и `keyVersion`; правка ключа после сдачи не меняет разбор | integration (DB) + e2e | `app/server/src/routes/tests/attempt-view-leak.test.ts`, `app/server/src/routes/tests/attempt-review.test.ts`, `e2e/tests/review.spec.ts` | SRV `src/routes/tests/attempt-view-leak.test.ts src/routes/tests/attempt-review.test.ts`; E2E `review` | ✅ |
| SCORE-02 | Правило скрытия ключа живёт в одном серверном модуле: 45 строк матрицы (3 вида зрителя × 5 шаблонов × 3 состояния), ключ не утекает для radio, checkbox, matching, смена `showCorrectAnswer` после сдачи; web не гадает о видимости ключа | unit + integration (DB) + static | `app/server/src/services/scored-attempt/view.test.ts`, `app/server/src/routes/tests/attempt-view-leak.test.ts`, `app/web/components/tests/attempt-review/review-viewers.test.ts`, `scripts/attempt-integrity-guards.test.mjs` | SRV `src/services/scored-attempt/view.test.ts src/routes/tests/attempt-view-leak.test.ts`; WEB `components/tests/attempt-review/review-viewers.test.ts`; GUARD `attempt-integrity-guards.test.mjs` | ✅ |
| SCORE-03 (SC4) | D1: ключ, исправленный после сдачи, не меняет разбор прежних попыток у администратора | integration (DB) + e2e | `app/server/src/routes/tests/attempt-known-defects.test.ts`, `app/server/src/routes/tests/attempt-review.test.ts`, `e2e/tests/review.spec.ts` | SRV `src/routes/tests/attempt-known-defects.test.ts src/routes/tests/attempt-review.test.ts`; E2E `review` | ✅ |
| SCORE-04 (SC5) | Результат объявлен одной схемой в `exam-core`; нет `unknown[]`; статус вопроса вычисляется в одном месте и совпадает при 0 баллов; `testAttempts.results` читается только в `scored-attempt` | unit + static | `packages/exam-core/src/attempt-result.test.ts`, `app/server/src/services/scored-attempt/view.test.ts`, `app/web/components/tests/runner-result-card.test.ts`, `scripts/attempt-integrity-guards.test.mjs` | CORE `attempt-result.test.ts`; SRV `src/services/scored-attempt/view.test.ts`; WEB `components/tests/runner-result-card.test.ts`; GUARD `attempt-integrity-guards.test.mjs` | ✅ |
| SCORE-04 (SC5) | Вопрос веса 0 показан «Без оценки» в карточке ученика и в разборе администратора | e2e (`@score04`) | `e2e/tests/zero-weight.spec.ts` | E2E `zero-weight` | ✅ |
| SCORE-05 (SC4) | Старые строки получают `results_version = 1`, CHECK допускает 1 и 2; попытки версии 1 открываются в разборе; результаты не по схеме дают 500 | integration (DB) | `app/server/src/db/attempt-session-migration.test.ts`, `app/server/src/services/scored-attempt/legacy.test.ts`, `app/server/src/routes/tests/attempt-review.test.ts` | SRV `src/db/attempt-session-migration.test.ts src/services/scored-attempt/legacy.test.ts src/routes/tests/attempt-review.test.ts` | ✅ + manual |

Критерии ROADMAP: SC1 = ATT-01; SC2 = ATT-02 и ATT-04; SC3 = ATT-05; SC4 = SCORE-01, SCORE-03, SCORE-05; SC5 = SCORE-04 и ATT-06.

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| Зелёный CI (`verify`, `e2e`) на запушенном коммите | ATT-06 | Внешний прогон GitHub Actions после push; структуру workflow проверяют `check-ci-workflow.test.mjs` и `verify.test.mjs` | Подтверждено пользователем 2026-10-05 |
| Вёрстка на 375 px: плашка ошибки прохождения, диалоги 409 и 422, пометка разбора старой попытки | ATT-04, SCORE-05 | Визуальная оценка | Подтверждено пользователем 2026-10-05 |
| Порядок очистки `localStorage` после автосдачи (ключи `test-session-*`, `test-frozen-*`, `test-answers-wal-*`, `test-client-attempt-*` исчезают до паузы экрана «Время вышло»), CR-01(а) | ATT-04 | Web-тесты без DOM, шва для проверки порядка в `TestRunner` нет | Подтверждено пользователем 2026-10-05 |
| Формат прод-данных результатов: старые попытки открываются в разборе | SCORE-05 | Агенты не подключаются к проду; тесты идут на синтетических строках | Read-only SQL runbook D-25 выполнен пользователем |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест, новый или существующий. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 5 |
| Resolved | 4 |
| Manual-only | 1 |

Закрыто: ATT-01 (снятие назначения и права посреди попытки) — `app/server/src/routes/tests/attempt-access-revoke.test.ts`; ATT-04 (повтор submit после потери ответа из интерфейса) — `e2e/tests/submit-retry.spec.ts`; SCORE-04 (вопрос веса 0 в карточке и в разборе) — `e2e/tests/zero-weight.spec.ts`; ATT-03 (ветка STOP при недетерминированной чистке) отдельного теста не требует: порядок чистки однозначен, повтор чистки доказан `attempt-session-migration.test.ts`. Ручной: зелёный CI на запушенном коммите. Нового тестового кода: три файла.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 11: автоматизировано 11, из них с ручным остатком 3, только ручных 0)
