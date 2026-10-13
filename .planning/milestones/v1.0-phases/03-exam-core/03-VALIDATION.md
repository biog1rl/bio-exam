---
phase: "3"
slug: "exam-core"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 3 — Validation Strategy

> Контракт проверки фазы: требования EXAM-01..EXAM-07 и критерии успеха SC1..SC5 из ROADMAP.

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

Статус: ✅ есть автотест; ✅ + manual есть автотест и ручной остаток из Manual-Only; manual автотеста нет. Прогон CI на запушенном коммите записан в Manual-Only без привязки к требованию и ручным остатком требования не считается.

| Требование | Что проверяется | Тип | Файл теста | Команда | Статус |
|------------|-----------------|-----|------------|---------|--------|
| EXAM-01 (SC3) | Пакет импортирует только `zod` и относительные пути, запрещённые библиотеки (React, Lexical, Drizzle, Tiptap) не подключены; собранный `dist` отдаёт ESM, CJS и ожидаемые экспорты | unit + static | `packages/exam-core/src/boundaries.test.ts`, `scripts/check-exam-core-dist.mjs` | CORE `boundaries.test.ts`; `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs` | ✅ |
| EXAM-01 | Оценка не мутирует входы (замороженные объекты), не зависит от порядка вызовов и от параллельного `Promise.all` | unit | `packages/exam-core/src/purity.test.ts` | CORE `purity.test.ts` | ✅ |
| EXAM-02 | По адаптеру на пять шаблонов: форма ключа, проверка при создании, форма ответа, «отвечено», нормализация, число ошибок, вердикты по частям | unit (таблицы) | `packages/exam-core/src/registry.test.ts`, `packages/exam-core/src/answer.test.ts`, `packages/exam-core/src/authoring.test.ts`, `packages/exam-core/src/scoring.test.ts`, `packages/exam-core/src/review.test.ts` | CORE `registry.test.ts answer.test.ts authoring.test.ts scoring.test.ts review.test.ts` | ✅ + manual |
| EXAM-02 | Ключи ответов хранятся в jsonb строкой и читаются через Drizzle строкой (`"3142"`, `"1.50"`, `"true"`, `"митоз"`) | integration (DB) | `app/server/src/db/answer-keys-jsonb.test.ts` | SRV `src/db/answer-keys-jsonb.test.ts` | ✅ |
| EXAM-03 (SC3) | Таблицы «ключ, ответ → балл и вердикты» по каждому шаблону; инвариант «все части верны ⇔ ошибок 0» | unit (таблицы) | `packages/exam-core/src/scoring.test.ts`, `packages/exam-core/src/invariants.test.ts`, `packages/exam-core/src/cases/answer.cases.ts`, `packages/exam-core/src/cases/authoring.cases.ts`, `packages/exam-core/src/cases/review.cases.ts`, `packages/exam-core/src/cases/scoring.cases.ts` | CORE `scoring.test.ts invariants.test.ts` | ✅ |
| EXAM-04 (SC4) | В `app/web` и `app/server` нет собственных копий логики шаблонов; сервер валидирует при сохранении и оценивает при отправке через `exam-core`; редактор и разбор используют адаптеры | static + unit + integration | `scripts/exam-core-no-private-copies.test.mjs`, `app/server/src/routes/tests/exam-flow.test.ts`, `app/server/src/lib/tests/question-type-resolver.test.ts`, `app/server/src/schemas/tests.test.ts`, `app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts`, `app/web/components/tests/attempt-review/attempt-review-utils.test.ts` | GUARD `exam-core-no-private-copies.test.mjs`; SRV `src/routes/tests/exam-flow.test.ts src/lib/tests/question-type-resolver.test.ts src/schemas/tests.test.ts`; WEB `question-validation.test.ts attempt-review-utils.test.ts` | ✅ + manual |
| EXAM-04 (SC4) | Ошибка проверки в редакторе вопроса: один `toast.error`, запрос сохранения не уходит, форма не сбрасывается | e2e | `e2e/tests/editor-validation.spec.ts` | E2E `editor-validation` | ✅ |
| EXAM-04 | Сохранённая строка `test_attempts` не меняется после правки ключа; ключ, невалидный по новым правилам, не ломает разбор | integration (DB) | `app/server/src/routes/tests/attempt-stored-results.test.ts` | SRV `src/routes/tests/attempt-stored-results.test.ts` | ✅ |
| EXAM-05 (SC5) | Схема результата попытки и слияние телеметрии объявлены в пакете; web реэкспортирует `mergeTelemetryMaps`, своих копий нет | unit + static | `packages/exam-core/src/attempt-result.test.ts`, `packages/exam-core/src/telemetry.test.ts`, `scripts/exam-core-no-private-copies.test.mjs`, `app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts` | CORE `attempt-result.test.ts telemetry.test.ts`; GUARD `exam-core-no-private-copies.test.mjs`; WEB `components/tests/attempt-lifecycle/lifecycle-time.test.ts` | ✅ |
| EXAM-06 (SC2) | Ключ `1243`, ответ `1234`: число ошибок на сервере и вердикты разбора совпадают; в разборе нет «Совпало позиций» | unit + integration + e2e | `packages/exam-core/src/scoring.test.ts`, `packages/exam-core/src/review.test.ts`, `packages/exam-core/src/invariants.test.ts`, `app/server/src/routes/tests/exam-flow.test.ts`, `app/web/components/tests/attempt-review/attempt-review-utils.test.ts`, `e2e/tests/review.spec.ts` | CORE `scoring.test.ts review.test.ts invariants.test.ts`; SRV `src/routes/tests/exam-flow.test.ts`; WEB `attempt-review-utils.test.ts`; E2E `review` | ✅ + manual |
| EXAM-06 | Разбор последовательности из 20 цифр на ширине 375 px переносит ячейки без горизонтальной прокрутки, у ученика и у администратора | e2e (mobile) | `e2e/tests/mobile-layout.spec.ts` | E2E `mobile-layout` | ✅ |
| EXAM-07 (SC1) | Редактор сохраняет `short_text` с двумя допустимыми вариантами (desktop и mobile); проверка при создании и на сервере | e2e + unit + integration | `e2e/tests/authoring.spec.ts`, `app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts`, `packages/exam-core/src/authoring.test.ts`, `app/server/src/routes/tests/exam-flow.test.ts` | E2E `authoring`; WEB `question-validation.test.ts`; CORE `authoring.test.ts`; SRV `src/routes/tests/exam-flow.test.ts` | ✅ |

Критерии ROADMAP: SC1 = EXAM-07; SC2 = EXAM-06; SC3 = EXAM-01 и EXAM-03; SC4 = EXAM-04; SC5 = EXAM-05.

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| Read-only SQL по D-11 на прод-базе: `jsonb_typeof(correct_answer)` и `short_text`-ключи, похожие на JSON-литерал | EXAM-02 | Прод-база недоступна агентам | Выполнено при выкатке |
| Число старых попыток `sequence_digits` с 0 баллов и ответом длиннее 3 символов (прод-SQL) | EXAM-06 | Нужен доступ к проду и дата выкатки правки метрики | Выполнено при выкатке; политика старых разборов задана требованием SCORE-05 |
| Правило метрики последовательности D-05 (соседняя перестановка при длине больше 3 даёт одну ошибку) и тексты разбора D-08 («Ошибок: N», подсказка о соседней перестановке) | EXAM-06 | Это решения о правилах оценки и видимых текстах, принимает пользователь | Приняты пользователем 2026-10-05 |
| Более строгая проверка при сохранении D-13: пустые тексты вариантов и пар сопоставления, формулировка из пробелов | EXAM-02 | Решение меняет поведение API и редактора, принимает пользователь | Принято пользователем 2026-10-05 |
| Прогон `yarn verify` и `yarn e2e` в CI на Linux на запушенном коммите | — | Внешний прогон, нужен push | Подтверждено пользователем 2026-10-05 |
| Запреты уровня judgment планов 03-08, 03-09, 03-11: сохранённые результаты не пересчитываются, сохранённые вопросы и ключи не перепроверяются, разбор не подменяет баллы | EXAM-04 | Оценка по диффу кода, вердикт принимает человек; серверные инварианты закрыты `attempt-stored-results.test.ts` | Подтверждено пользователем 2026-10-05 |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 4 |
| Resolved | 4 |
| Manual-only | 0 |

Закрыто: G1 (ветка ошибки валидации в редакторе) — `e2e/tests/editor-validation.spec.ts`; G2 (параллельные submit независимы) — `packages/exam-core/src/purity.test.ts`; G3 (разбор последовательности на 375 px) — `e2e/tests/mobile-layout.spec.ts`; G4 (сохранённые результаты не пересчитываются) — `app/server/src/routes/tests/attempt-stored-results.test.ts`. Нового тестового кода: четыре файла.

Вне требований: D-19 (legacy `TestScoringRules`) отложен решением пользователя; проверка назначения N1 закрыта в фазе 5.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 7: автоматизировано 7, из них с ручным остатком 3, только ручных 0)
