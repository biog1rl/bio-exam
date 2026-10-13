---
phase: "9"
slug: "result-foundation-and-readers"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Источник: `09-RESEARCH.md` → «Validation Architecture».

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (exam-core, server, web), `node --test` (scripts), Playwright (e2e) |
| **Config file** | `app/server/vitest.config.ts`, `app/web/vitest.config.ts`, `packages/exam-core/vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `yarn workspace @bio-exam/exam-core test` (0,34 с); один файл сервера: `node scripts/with-test-db.mjs yarn workspace @bio-exam/server exec vitest run src/<путь>.test.ts` |
| **Full suite command** | `yarn verify` (затем отдельно `yarn e2e`) |
| **Estimated runtime** | exam-core ~1 с, server ~65 с, web ~10 с, `yarn verify` ~4–5 мин |

---

## Sampling Rate

- **After every task commit:** тест затронутого модуля (exam-core целиком; один файл сервера через `with-test-db`; один файл web)
- **After every plan wave:** `yarn workspace @bio-exam/exam-core test` + `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` + `yarn workspace @bio-exam/web test` + `yarn typecheck` + `yarn lint`
- **Before `/gsd-verify-work`:** `yarn verify: OK`, `yarn e2e` зелёный, `node scripts/check-exam-core-dist.mjs` после сборки
- **Max feedback latency:** 90 seconds для быстрых проверок задач; `yarn verify` (~4–5 мин) и `yarn e2e` — только на границе плана и фазы

---

## Per-Task Verification Map

Заполняется по задачам планов при исполнении (validate-phase). Карта требований → тесты из исследования:

| Requirement | Behavior | Test Type | File | Exists |
|-------------|----------|-----------|------|--------|
| RES-02 | `computeAttemptOutcome`: none/pending/graded, системный 0, вес 0, порог null, 0..3 | unit table | `packages/exam-core/src/outcome.test.ts` | ✅ |
| RES-02 | Проекция = пересчёт, CHECK, `reconcileOutcomes` | server integration | `app/server/src/services/scored-attempt/outcome.test.ts` | ✅ |
| RES-02 | Миграция: заполнение, CHECK, сид `open` неактивным, манифест | migration | `app/server/src/db/attempt-result-migration.test.ts` | ✅ |
| RES-01 | Реплей/конфликт не меняют строку; триггер отвергает UPDATE фактов | server integration | `attempt-submit.test.ts`, `attempt-stored-results.test.ts` (новые кейсы) | ✅ файлы |
| RES-03 | Характеризация `none` во всех читателях до правок | server integration | `app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` | ✅ |
| RES-03 | Один поведенческий тест `pending` по 8 читателям | server integration | `app/server/src/routes/tests/attempt-readers-pending.test.ts` | ✅ |
| RES-03 | Вид результата pending/final/auto/teacherChecked | unit table | `app/web/lib/tests/attempt-result-view.test.ts` | ✅ |
| RES-03 | Web-поверхности, 375 px | e2e | `e2e/tests/attempt-review-pending.spec.ts` + сид | ✅ |
| RES-04 | `review`, `pendingTotal`, среднее без pending, `averageScore: null` | server integration | `admin-attempts-list.test.ts` (расширить) | ✅ |
| RES-05 | 422 `ANSWERS_INVALID`, черновик 400 (чужой вопрос, длина, форма), тип не настроен 422 | server integration | `attempt-submit.test.ts`, `attempt-time-limit.test.ts:195-227` | ✅ |
| RES-05 | `findAnswerViolation` по шаблонам, форме и границам | unit table | `packages/exam-core/src/answer-limits.test.ts` | ✅ |
| RES-05 | Баннер `answers-invalid`, сдача снова доступна | unit (lifecycle с портами) | `lifecycle-submit.test.ts` | ✅ |
| OPEN-02 | Запреты включения/правки `open`, правило `manual` 3 | server integration + unit | `admin-open-type.test.ts`, `exam-core scoring.test.ts` | ✅ |
| (folded) | Вопросы ученику без эталона и критериев | server integration | `student-question-payload.test.ts` | ✅ |
| PLAT-05 | Каталог FK на `users` + удаление пользователя | server integration (DB) | `app/server/src/db/user-deletion-rule.test.ts` | ✅ |
| (folded) | `DashboardClient` без неиспользуемых переменных | lint | `yarn workspace @bio-exam/web lint` | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/exam-core/src/outcome.test.ts`, `answer-limits.test.ts`
- [x] `app/server/src/db/attempt-result-migration.test.ts`, `user-deletion-rule.test.ts`
- [x] `app/server/src/services/scored-attempt/outcome.test.ts`
- [x] `app/server/src/routes/tests/attempt-readers-none.characterization.test.ts` (до правок читателей), `attempt-readers-pending.test.ts`, `student-question-payload.test.ts`, `admin-open-type.test.ts`
- [x] помощник `insertAttemptFixture` в `app/server/src/test-support`
- [x] `app/web/lib/tests/attempt-result-view.test.ts`
- [x] `e2e/tests/attempt-review-pending.spec.ts`, блок `attempts` в `e2e/fixtures/seed.json` и `e2e-seed.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Контраст меток по вычисленным стилям | RES-03 | Правило проекта: контраст мерить в браузере, не по таблице токенов | Открыть список попыток и экран ученика с сидом `pending`, измерить контраст «На проверке» и «проверено учителем» (AA 4,5:1) |
| Колонка результата 10.625rem на 768 и 375 px | RES-03 | Визуальная проверка переполнения | Открыть список попыток на 768 и 375 px, проверить отсутствие горизонтального скролла и обрезки метки |
| Выкатка миграций 0026+ на прод | RES-02 | Сервер вне доступа агентов | Пользователь: свежая резервная копия до выкатки, после — запрос сверки из плана |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s (быстрые проверки задач)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-06 (аудит gsd-nyquist-auditor: MAJOR-пробелов нет; пробел «черновик 400» опровергнут devils-advocate — `attempt-time-limit.test.ts:195-227`)
