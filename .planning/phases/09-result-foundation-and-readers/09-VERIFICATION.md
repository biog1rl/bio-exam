---
phase: 09-result-foundation-and-readers
verified: 2026-10-06T01:03:00Z
status: passed
score: 11/11 must-haves verified (human items: 09-UAT.md, 5 pass, 2 user deploy steps)
covered_files:
  - ".agents/skills/bio-exam-api/SKILL.md"
  - ".agents/skills/bio-exam-data/SKILL.md"
  - ".agents/skills/bio-exam-web/SKILL.md"
  - ".planning/phases/09-result-foundation-and-readers/09-01-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-01-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-02-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-02-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-03-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-03-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-04-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-04-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-05-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-05-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-06-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-06-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-07-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-07-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-08-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-08-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-09-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-09-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-10-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-10-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-11-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-11-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-12-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-12-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-13-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-13-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-14-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-14-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-15-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-15-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-16-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-16-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-17-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-17-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-18-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-18-SUMMARY.md"
  - ".planning/phases/09-result-foundation-and-readers/09-19-PLAN.md"
  - ".planning/phases/09-result-foundation-and-readers/09-19-SUMMARY.md"
  - "AGENTS.md"
  - "app/server/README.md"
  - "app/server/drizzle/0026_attempt_result_projection.sql"
  - "app/server/drizzle/meta/0026_snapshot.json"
  - "app/server/drizzle/meta/_journal.json"
  - "app/server/drizzle/migrations-manifest.json"
  - "app/server/src/db/attempt-result-migration.test.ts"
  - "app/server/src/db/attempt-session-migration.test.ts"
  - "app/server/src/db/schema.ts"
  - "app/server/src/db/user-deletion-rule.test.ts"
  - "app/server/src/routes/tests/admin-attempts-list.test.ts"
  - "app/server/src/routes/tests/admin-open-type.test.ts"
  - "app/server/src/routes/tests/admin/attempts.ts"
  - "app/server/src/routes/tests/admin/question-types.ts"
  - "app/server/src/routes/tests/admin/shared.ts"
  - "app/server/src/routes/tests/attempt-readers-none.characterization.test.ts"
  - "app/server/src/routes/tests/attempt-readers-pending.test.ts"
  - "app/server/src/routes/tests/attempt-review.test.ts"
  - "app/server/src/routes/tests/attempt-submit.test.ts"
  - "app/server/src/routes/tests/attempt-time-limit.test.ts"
  - "app/server/src/routes/tests/public.ts"
  - "app/server/src/routes/tests/student-question-payload.test.ts"
  - "app/server/src/routes/tests/student-question-view.ts"
  - "app/server/src/routes/users/index.ts"
  - "app/server/src/scripts/e2e-seed.ts"
  - "app/server/src/services/access-policy/zone-store.test.ts"
  - "app/server/src/services/attempt-sessions/sessions.ts"
  - "app/server/src/services/attempt-sessions/submit.ts"
  - "app/server/src/services/question-content/move-remove.test.ts"
  - "app/server/src/services/scored-attempt/columns.ts"
  - "app/server/src/services/scored-attempt/facts.ts"
  - "app/server/src/services/scored-attempt/index.ts"
  - "app/server/src/services/scored-attempt/outcome.test.ts"
  - "app/server/src/services/scored-attempt/outcome.ts"
  - "app/server/src/services/scored-attempt/read.ts"
  - "app/server/src/services/scored-attempt/view.test.ts"
  - "app/server/src/services/scored-attempt/view.ts"
  - "app/server/src/services/search/database-search.ts"
  - "app/server/src/test-support/attempt-fixture.ts"
  - "app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/attempts/attempts-types.ts"
  - "app/web/app/(internal)/(protected)/admin/tests/question-types/QuestionTypesPageClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/types/index.ts"
  - "app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx"
  - "app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx"
  - "app/web/components/progress/AttemptBarChart.tsx"
  - "app/web/components/tests/QuestionInput.tsx"
  - "app/web/components/tests/TestRunner.tsx"
  - "app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts"
  - "app/web/components/tests/attempt-lifecycle/lifecycle.ts"
  - "app/web/components/tests/attempt-lifecycle/testing.ts"
  - "app/web/components/tests/attempt-result/AttemptReviewLine.tsx"
  - "app/web/components/tests/attempt-result/ReviewStatusChip.tsx"
  - "app/web/components/tests/attempt-result/TeacherCheckedMark.tsx"
  - "app/web/components/tests/attempt-review/AttemptQuestionsList.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewHero.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewNav.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewSummary.tsx"
  - "app/web/components/tests/attempt-review/attempt-review-utils.test.ts"
  - "app/web/components/tests/attempt-review/attempt-review-utils.ts"
  - "app/web/components/tests/attempt-review/review-viewers.test.ts"
  - "app/web/components/tests/attempt-submit-flow.test.ts"
  - "app/web/components/tests/attempt-submit-flow.ts"
  - "app/web/components/tests/runner-result-card.test.ts"
  - "app/web/components/tests/runner-result-card.ts"
  - "app/web/components/users/UserProfileAssignmentsPage.tsx"
  - "app/web/lib/progress/attempt-chart.ts"
  - "app/web/lib/progress/my-attempts.test.ts"
  - "app/web/lib/progress/my-attempts.ts"
  - "app/web/lib/tests/admin-api.test.ts"
  - "app/web/lib/tests/admin-api.ts"
  - "app/web/lib/tests/api.ts"
  - "app/web/lib/tests/attempt-result-view.test.ts"
  - "app/web/lib/tests/attempt-result-view.ts"
  - "app/web/lib/tests/attempts-url.test.ts"
  - "app/web/lib/tests/attempts-url.ts"
  - "app/web/lib/tests/types.ts"
  - "app/web/lib/users/api.ts"
  - "docs/adr/0007-user-deletion-rule.md"
  - "e2e/fixtures/accounts.ts"
  - "e2e/fixtures/seed.json"
  - "e2e/tests/attempt-review-pending.spec.ts"
  - "e2e/tests/attempts-list.spec.ts"
  - "packages/exam-core/src/adapters/index.ts"
  - "packages/exam-core/src/adapters/open.ts"
  - "packages/exam-core/src/adapters/types.ts"
  - "packages/exam-core/src/answer-limits.test.ts"
  - "packages/exam-core/src/answer-limits.ts"
  - "packages/exam-core/src/answer.test.ts"
  - "packages/exam-core/src/attempt-result.test.ts"
  - "packages/exam-core/src/attempt-result.ts"
  - "packages/exam-core/src/authoring.test.ts"
  - "packages/exam-core/src/cases/answer.cases.ts"
  - "packages/exam-core/src/cases/authoring.cases.ts"
  - "packages/exam-core/src/cases/review.cases.ts"
  - "packages/exam-core/src/index.ts"
  - "packages/exam-core/src/invariants.test.ts"
  - "packages/exam-core/src/outcome.test.ts"
  - "packages/exam-core/src/outcome.ts"
  - "packages/exam-core/src/registry.test.ts"
  - "packages/exam-core/src/registry.ts"
  - "packages/exam-core/src/review.test.ts"
  - "packages/exam-core/src/scoring.test.ts"
  - "packages/exam-core/src/scoring.ts"
  - "scripts/check-exam-core-dist.mjs"
  - "scripts/check-migrations.mjs"
  - "scripts/exam-core-no-private-copies.test.mjs"
covered_digest: "v2:sha256:2d96051d6308b69c9e749cf326a9a424239e811f1d7be04aad814814da9e8d76"
behavior_unverified: 1
overrides_applied: 0
deferred:
  - truth: "RES-01: ручные проверки хранятся как добавляемые записи"
    addressed_in: "Phase 15"
    evidence: "Phase 15 SC3: «after the attempt has its final result an answer cannot be returned, only re-graded with a new review record; every version and review stays visible ... the final score is the last review». В фазе 9 по D-15 таблицы проверок нет: computeAttemptOutcome принимает последние оценки как finalScores, materializeAttemptOutcome принимает загрузчик оценок параметром."
  - truth: "Статус и баллы открытого вопроса в попытке graded берутся из оценки учителя (WR-02)"
    addressed_in: "Phase 15"
    evidence: "Phase 15 SC4: «when the last open answer is graded the attempt shows its final percentage and passed mark everywhere». В фазе 9 graded достижим только в тестах и сиде; questionStatus('open') всегда 'pending'."
  - truth: "Плановая сверка reconcile-outcomes не переводит graded обратно в pending (IN-06)"
    addressed_in: "Phase 11 / Phase 15"
    evidence: "09-CONTEXT: «страховка jobs:run reconcile-outcomes (команда появится с модулем фоновых задач в фазе 11, здесь — функция сверки)»; загрузчик оценок появляется с таблицей проверок фазы 15. В фазе 9 reconcileOutcomes вызывается только из тестов."
  - truth: "questionId в ответе ANSWERS_INVALID для подсветки вопроса (IN-09)"
    addressed_in: "Phase 14"
    evidence: "deferred-items.md: «Нужен в фазе открытых ответов»; Phase 14 — сдача с открытыми ответами."
prohibitions:
  - statement: "Применённые миграции 0000…0025 и их записи журнала и манифеста не меняются; drizzle-kit push не запускается (09-05)"
    verification: judgment
    status: unverified
    flagged: true
    verdict: "НЕАВТОРИТЕТНО (LLM): соблюдено. git diff 4d8f566^..HEAD по app/server/drizzle/: только A 0026_attempt_result_projection.sql, A meta/0026_snapshot.json, в _journal.json и migrations-manifest.json добавлены записи idx 26, прежние не тронуты; шаг migrations в yarn verify зелёный. Что drizzle-kit push не запускался, по коду не проверить."
    note: "unverified-prohibition — human review recommended"
behavior_unverified_items:
  - truth: "Web-читатели показывают попытку на проверке меткой «На проверке» без процента и без «пройден/не пройден» на всех экранах (список и разбор попыток, дашборды, «Мои попытки», страница теста, профиль, экран после сдачи, глобальный поиск)"
    test: "Запустить yarn e2e e2e/tests/attempt-review-pending.spec.ts (или полный yarn e2e) на desktop и mobile"
    expected: "Четыре теста спека зелёные на chromium-desktop и chromium-mobile; полный прогон без failed и flaky"
    why_human: "Верификатор не запускает серверы. Серверный контракт доказан тестом восьми читателей, attemptResultView — юнит-тестом, разводка во всех компонентах проверена чтением кода; отрисовку подтверждает только e2e, который оркестратор называет зелёным (292 passed), но этот прогон здесь не повторялся."
human_verification:
  - test: "Подтвердить e2e-прогон спека attempt-review-pending и полного набора после 3be6c16"
    expected: "yarn e2e: 292 passed, без failed и flaky на chromium-desktop и chromium-mobile"
    why_human: "Нужно поднять web и API; в верификаторе запуск серверов запрещён"
  - test: "Контраст меток «На проверке» и «проверено учителем» (backstop 09-18) на списке попыток, профиле, странице теста и экране после сдачи"
    expected: "lowContrastTexts по меткам пуст, контраст текста не ниже 4,5:1 по вычисленным стилям"
    why_human: "Истина помечена verification: backstop; присутствие кода не доказывает вид"
  - test: "Ширины 375, 768 и 1280 px (backstop 09-12, 09-18): колонка результата 10.625rem, длинное название теста рядом с меткой"
    expected: "Нет горизонтального скролла, «проверено учителем» помещается, метка не сжимается, название обрезается"
    why_human: "Визуальная вёрстка, verification: backstop"
  - test: "Вставка в краткий ответ текста длиннее 200 знаков (backstop 09-11)"
    expected: "Браузер обрезает по maxLength без сообщения; сдача проходит"
    why_human: "Поведение браузера, verification: backstop"
  - test: "Выкатка: слить всю фазу 9 в master одним пакетом, свежая резервная копия, репетиция 0026 на свежем дампе под ролью bio_exam, ручной deploy.sh вне окна сдач"
    expected: "Миграция 0026 применена; после неё откат одного образа не делается (при сбое — восстановление predeploy-*.dump или выкатка вперёд)"
    why_human: "Шаг пользователя на сервере, доступа у агента нет"
  - test: "Запросы сверки после 0026 на проде (из 09-05 User steps) и проверка строки open до и после (IN-07)"
    expected: "attempts = none_count, mismatched = 0; open есть и is_active = false; триггер test_attempts_facts_immutable есть; CHECK convalidated; users_created_by_fk confdeltype = 'n'; до миграции нет своего типа с ключом open"
    why_human: "Данные прода, выполняет пользователь"
  - test: "Подтвердить запрет 09-05: drizzle-kit push в ходе фазы не запускался"
    expected: "Применённые миграции 0000…0025 не менялись (подтверждено git diff), push не выполнялся"
    why_human: "Запрет уровня judgment; запуск команды по коду не виден"
---

# Phase 9: Result foundation and readers — отчёт верификации

**Цель фазы:** хранимый результат теста — это автофакты попытки плюс добавляемые ручные проверки, итог считает одна общая функция, и каждый читатель результата уже умеет показывать попытку «на проверке» до того, как такая попытка может появиться.
**Проверено:** 2026-10-06T01:03:00Z
**Статус:** passed (ручные пункты закрыты в 09-UAT.md: 5 pass, пункты 5 и 6 — шаги выкатки пользователя)
**Повторная верификация:** нет, первичная

## Что запускалось

| Команда | Результат |
| ------- | --------- |
| `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test` по 11 файлам фазы (user-deletion-rule, attempt-result-migration, scored-attempt/outcome, attempt-readers-pending, attempt-readers-none.characterization, admin-attempts-list, attempt-submit, attempt-time-limit, student-question-payload, admin-open-type, attempt-review) | 11 файлов, 131 тест, все passed |
| `yarn workspace @bio-exam/exam-core test` | 15 файлов, 723 теста, passed |
| `yarn workspace @bio-exam/web test` attempt-result-view и lifecycle-submit | 2 файла, 40 тестов, passed |
| `yarn verify` (один прогон, своя PG17) | `yarn verify: OK`; server 92 файла, web 92, exam-core 15, rbac 1 |

Строки `level:50` в выводе серверных тестов — ожидаемые логи негативных случаев («Тип вопроса отключён: Открытый вопрос», `AttemptResultsShapeError` у испорченной попытки), не падения.

## Достижение цели

### Наблюдаемые истины

| # | Истина | Статус | Доказательство |
| - | ------ | ------ | -------------- |
| 1 | SC1: после миграции существующие попытки выглядят во всех читателях как раньше; проекция (review_status, final_*, процент, passed) равна одному пересчёту `exam-core` для каждого состояния, включая засеянные попытки с открытым ответом | VERIFIED | `0026_attempt_result_projection.sql`: ADD COLUMN, затем UPDATE final_* = факты, auto_total_points = total_points, passing_score = порог теста, затем SET NOT NULL и CHECK. Тесты зелёные: `attempt-result-migration.test.ts` («existing attempts get review_status none, final_* equal to facts…», «reconciliation query … mismatched = 0»), `outcome.test.ts` («новая сдача: none…», «засеянная попытка с открытым ответом: pending…», `reconcileOutcomes` находит и чинит порчу), `attempt-readers-pending.test.ts` («сохранённая проекция равна пересчёту по фактам попытки»), exam-core `outcome.test.ts`. Характеризация 09-02 `attempt-readers-none.characterization.test.ts` имеет единственный коммит d862a67 (не правилась) и зелёная |
| 2 | SC2 (сервер): попытка на проверке у всех читателей без процента и вердикта, вне средних, на графике только после проверки на дату сдачи; один поведенческий тест по всем читателям | VERIFIED | Все серверные читатели идут через `attemptResultColumns`/`attemptResultSql` (`admin/attempts.ts` список, сводка, дашборд; `public.ts` attempts/me; `users/index.ts` профиль; `read.ts` разбор и ответ сдачи; `database-search.ts` поиск). Каждый агрегат с `filter (where review_status <> 'pending')`, `coalesce(…,0)` убран. chart-data: `ne(reviewStatus,'pending')`, `final_score_percentage`, дата `submittedAt`. Поиск: у pending заголовок без процента, статус «На проверке». `attempt-readers-pending.test.ts` проходит восемь читателей (мои попытки, chart-data, профиль, поиск ×2, список, дашборд, разбор, ответ сдачи) — зелёный. ZIP-экспорт: `services/question-content` результаты не читает (grep пуст, `remove.ts` только проверяет наличие попыток) |
| 3 | SC2 (web): все экраны показывают «На проверке» без процента и вердикта | PRESENT_BEHAVIOR_UNVERIFIED | Разводка есть: `attemptResultView` используется в AdminAttemptsClient, DashboardClient, TestLandingPageClient, TestRunner, AttemptReviewHero, UserProfileAssignmentsPage, my-attempts, users/api; `toProgressAttempt` отбрасывает pending; `?? 0` в AttemptBarChart нет; nullable-контракт `AttemptViewSchema` с refine. Юнит `attempt-result-view.test.ts` зелёный, `yarn verify` (typecheck) зелёный. Отрисовку доказывает только e2e `attempt-review-pending.spec.ts`, здесь не запускался — см. ручную проверку |
| 4 | SC3: фильтр списка попыток по проверке (все / на проверке / проверено); фильтр статуса ученика прежний | VERIFIED | `AttemptsQuerySchema.review = z.enum(['all','pending','graded']).default('all')`, фильтр `eq(reviewStatus, review)`, `status` не тронут; `summary.pendingTotal` по зоне. `admin-attempts-list.test.ts`: «review=pending…», «review=graded…», «review комбинируется со status по «И»», прежний «status: active, inactive и all…», «pendingTotal считает всю зону…» — зелёные. Web: параметр `review` в `attempts-url.ts` и ключе SWR |
| 5 | SC4: сдача отклоняет ответы на чужие вопросы и тексты сверх предела понятным 4xx и не переписывает автофакты | VERIFIED | `facts.ts` вызывает `findAnswerViolation` до ключей; `public.ts` 422 `ANSWERS_INVALID` на сдаче, 400 на черновике (`sessions.ts`). После 3be6c16 форма проверяется по `answerSchema` адаптера, элементы ≤ 200 знаков и ≤ 50 штук. Тесты зелёные: `attempt-submit.test.ts` (foreign_question 422 без строки, short_text 200/201, массив на кратком ответе → answer_shape_invalid, unknown_question_type 422 вместо 500, open 5001 → open_text_too_long), `attempt-time-limit.test.ts` (черновик 400). Неизменность фактов: INSERT с `onConflictDoNothing`, триггер `test_attempts_facts_immutable` (23001) проверен `attempt-result-migration.test.ts` по каждому фактовому столбцу; повтор сдачи без изменения фактов — `attempt-readers-pending.test.ts` и характеризация |
| 6 | SC5 / PLAT-05: таблицы вехи следуют одному правилу удаления пользователя, закреплённому тестом-каталогом | VERIFIED | `docs/adr/0007-user-deletion-rule.md`; ссылки в `AGENTS.md` (строка маршрутизации) и `bio-exam-data/SKILL.md`. `user-deletion-rule.test.ts` строит ключи по `pg_constraint`, `LEGACY_EXCEPTIONS = []`, `users_created_by_fk` переведён на `ON DELETE SET NULL` в 0026; поведенческие случаи удаления ученика, автора и пригласившего — зелёные |
| 7 | RES-02: итог считает одна функция `exam-core`, проекцию пишет один писатель | VERIFIED | `computeAttemptOutcome`/`projectionOf` в `packages/exam-core/src/outcome.ts`; сервер не держит своей формулы (`facts.ts:142` берёт `outcome.submitted`); при сдаче проекция пишется той же вставкой (`submit.ts`), после — только `materializeAttemptOutcome(tx)` (`outcome.ts`); `outcome.test.ts` «materializeAttemptOutcome» зелёный |
| 8 | OPEN-02: открытый вопрос оценивается 0–3, тип `open` засеян неактивным и не включается раньше фазы 17 | VERIFIED | `registry.ts` правило `{exact_match, manual, 3}`, `scoring.ts` ранний выход для `manual`; `assertOpenScore` бросает RangeError вне 0..points. Миграция сеет `open` с `is_active=false` `ON CONFLICT DO NOTHING` — тесты «open is seeded inactive…» и «running the seed again keeps an enabled open type enabled». `admin-open-type.test.ts` (запрет включения, правки максимума, кастомного шаблона open, правила для теста) зелёный |
| 9 | Вложено: неиспользуемые переменные `DashboardClient` удалены | VERIFIED | grep по `Area`, `AreaChart`, `studentChartConfig`, `adminStudentChartConfig`, `studentProgress`, `groupedTests`, `adminStudentScores`, «Динамика результатов» в `DashboardClient.tsx` пуст; lint в `yarn verify` зелёный |
| 10 | Вложено: вопросы ученику не несут эталон и критерии | VERIFIED | `student-question-view.ts` — белый список (id, type, questionUiTemplate, questionTypeTitle, order, points, options, matchingPairs, promptText), используется в `public.ts:332` и `:386`; `student-question-payload.test.ts` сверяет точный набор ключей — зелёный |
| 11 | Вложено: неизвестный тип вопроса из старой вкладки получает 4xx вместо 500 | VERIFIED | Сдача 422 `unknown_question_type` (тест зелёный), черновик 400 (`sessions.ts`, причина `unknown_question_type` при `template === null`). GET-списки вопросов остаются 500 по D-18 — граница объёма, записана в 09-07 |

**Счёт:** 10/11 истин проверено (1 присутствует и подключена, поведение не подтверждено здесь)

### Запреты (must_haves.prohibitions)

| Запрет | Уровень | Вердикт | Флаг |
| ------ | ------- | ------- | ---- |
| Применённые миграции 0000…0025, их журнал и манифест не меняются; `drizzle-kit push` не запускается (09-05) | judgment | НЕАВТОРИТЕТНО: соблюдено — `git diff --name-status 4d8f566^ HEAD -- app/server/drizzle/` даёт только добавление 0026 и его снимка, в журнале и манифесте только новые записи idx 26; шаг `migrations` в `yarn verify` зелёный. Запуск `push` по коду не проверить | unverified-prohibition — human review recommended |

### Отложенные пункты

| # | Пункт | Где | Доказательство |
|---|-------|-----|----------------|
| 1 | Ручные проверки как добавляемые записи (часть RES-01) | Phase 15 | SC3 фазы 15: переоценка новой записью проверки, итог — последняя проверка. В фазе 9 по D-15 таблицы нет, функция и писатель уже принимают оценки |
| 2 | Статус открытого вопроса в попытке graded (WR-02) | Phase 15 | SC4 фазы 15: после оценки последнего ответа итог виден везде |
| 3 | Сверка по расписанию без возврата graded в pending (IN-06) | Phase 11 / 15 | 09-CONTEXT: команда `reconcile-outcomes` появится с модулем фоновых задач фазы 11 |
| 4 | `questionId` в ответе ANSWERS_INVALID (IN-09) | Phase 14 | deferred-items.md: «Нужен в фазе открытых ответов» |

### Требуемые артефакты

| Артефакт | Назначение | Статус | Подробности |
| -------- | ---------- | ------ | ----------- |
| `app/server/drizzle/0026_attempt_result_projection.sql` | проекция, заполнение, CHECK, триггер, неактивный open, FK SET NULL | VERIFIED | порядок ADD → UPDATE → NOT NULL → CHECK; `lock_timeout 5s`; без DROP COLUMN/RENAME |
| `packages/exam-core/src/outcome.ts` | `computeAttemptOutcome`, `projectionOf` | VERIFIED | none/pending/graded, формула процента и порога как в прежнем `facts.ts` |
| `packages/exam-core/src/answer-limits.ts` | пределы и `findAnswerViolation` | VERIFIED | 200/5000, форма по адаптеру, 200×50 для элементов |
| `app/server/src/services/scored-attempt/columns.ts` | `attemptResultColumns`, `attemptResultSql` | VERIFIED | используется всеми серверными читателями |
| `app/server/src/services/scored-attempt/outcome.ts` | `materializeAttemptOutcome`, `reconcileOutcomes` | VERIFIED | `FOR UPDATE`, один UPDATE проекции, сравнение через `Math.fround` |
| `app/server/src/routes/tests/student-question-view.ts` | белый список полей вопроса ученику | VERIFIED | подключён в двух GET |
| `app/web/lib/tests/attempt-result-view.ts` и `components/tests/attempt-result/*` | единственная точка решения «что показывать» и метки | VERIFIED (код), отрисовка — ручная проверка | подключены в 8 местах web |
| `app/server/src/db/user-deletion-rule.test.ts`, `docs/adr/0007-user-deletion-rule.md` | правило удаления | VERIFIED | исключений нет |
| `app/server/src/routes/tests/attempt-readers-pending.test.ts` | поведенческий тест читателей | VERIFIED | 8 читателей + настоящая сдача открытого вопроса |
| `e2e/tests/attempt-review-pending.spec.ts` | e2e всех экранов | PRESENT | 4 теста; прогон не повторялся |

### Проверка связей

| От | К | Через | Статус |
| -- | - | ----- | ------ |
| `facts.ts` scoreSubmission | `computeAttemptOutcome` | `outcome.submitted` для четырёх фактовых столбцов | WIRED |
| `submit.ts` submitAttempt | `projectionOf` | той же вставкой, CHECK немедленный | WIRED |
| `facts.ts`, `sessions.ts` | `findAnswerViolation` | 422 сдача / 400 черновик в `public.ts` | WIRED |
| читатели сервера | `attemptResultColumns` / `attemptResultSql` | spread в select, SQL-выражения поиска | WIRED |
| агрегаты | `review_status <> 'pending'` | `filter (where …)` в сводке, дашборде, среднем за день | WIRED |
| web-экраны | `attemptResultView` | вид pending/final, метки из `attempt-result/` | WIRED |
| `AdminAttemptsClient` | `GET /admin/attempts?review=` | `attempts-url.ts` и ключ SWR | WIRED |

### Поток данных (уровень 4)

| Артефакт | Значение | Источник | Реальные данные | Статус |
| -------- | -------- | -------- | --------------- | ------ |
| список и дашборд | scorePercentage / averageScore | `final_score_percentage` из `test_attempts` | да, null у pending | FLOWING |
| chart-data | maxScore/minScore по дате | `final_score_percentage`, `submittedAt`, без pending | да | FLOWING |
| поиск | title/subtitle | `attemptResultSql('ta')` | да | FLOWING |
| экран после сдачи | вид результата | `readAttemptView` → ответ сдачи → `attemptResultView` | да | FLOWING |

### Покрытие требований

| Требование | Планы | Описание | Статус | Доказательство |
| ---------- | ----- | -------- | ------ | -------------- |
| RES-01 | 09-02, 09-05, 09-17 | автофакты не переписываются; проверки — добавляемые записи | SATISFIED (часть «записи проверок» — Phase 15) | триггер 23001, INSERT без DO UPDATE, тест повтора сдачи |
| RES-02 | 09-04, 09-05, 09-06, 09-17 | итог одной функцией, проекция равна пересчёту, включая старые попытки | SATISFIED | истины 1, 7 |
| RES-03 | 09-02, 09-06, 09-09, 09-10, 09-12…09-18 | все читатели показывают «на проверке» | SATISFIED (сервер), web — ручная проверка e2e | истины 2, 3 |
| RES-04 | 09-09, 09-12, 09-18 | фильтр review, status без изменений | SATISFIED | истина 4 |
| RES-05 | 09-04, 09-07, 09-11, 09-19 | только вопросы теста, предел длины | SATISFIED | истина 5 |
| OPEN-02 | 09-03, 09-04, 09-05, 09-08, 09-19 | открытый вопрос 0–3 | SATISFIED | истина 8 |
| PLAT-05 | 09-01, 09-05, 09-19 | правило удаления пользователя | SATISFIED | истина 6 |

Все семь ID из фронтматтера планов есть в REQUIREMENTS.md и привязаны к Phase 9; других ID, привязанных к Phase 9, в REQUIREMENTS.md нет — сирот нет.

### Решения D-01…D-22

Сверены с кодом: D-05 (средние и графики без pending, дата сдачи), D-06/D-07 (константы exam-core, 422/400, сохранённые попытки не перепроверяются), D-09/D-10/D-11 (параметр `review`, `pendingTotal` по зоне, порядок по дате), D-12…D-14 и D-21 (каталог, `SET NULL` для `users.created_by`, ADR под номером 0007), D-15 (таблицы проверок нет), D-16 (`auto_total_points`), D-17 (порог старых попыток — текущий порог теста, сверка `none` по фактам), D-18 (422/400, GET без изменений), D-19 (триггер и тест), D-20 (столбцов `criteria_path`, `photo_upload_window_minutes`, `upload_closes_at` в 0026 нет), D-22 (миграция 0026, следующая свободна для фазы 10). Отклонений не найдено.

### Антипаттерны

| Файл | Строка | Шаблон | Серьёзность | Влияние |
| ---- | ------ | ------ | ----------- | ------- |
| 112 изменённых файлов фазы | — | TBD / FIXME / XXX | — | не найдено |
| `packages/exam-core/src/answer-limits.ts` | `findAnswerViolation` | `unknown_question_type` проверяется по всем вопросам теста до ответов | Info | тест с вопросом удалённого типа отклоняет любую сдачу 422; это задумано D-18, не дефект |
| `app/server/src/routes/tests/public.ts` | chart-data | читает `finalScorePercentage` напрямую, не через `attemptResultColumns` (IN-05) | Info | фильтр `review_status <> 'pending'` есть, поведение верное |
| профиль ученика | — | «Нет данных за выбранный период» при одних попытках на проверке (IN-02) | Info | поведение совпадает с истиной 09-15 («partial»); текст можно уточнить позже |
| `telemetry.ts` / `sessions.ts` | — | ключи телеметрии черновика не ограничены вопросами теста | Info | существовало до фазы 9, записано в deferred-items.md |

### Поведенческие проверки

| Поведение | Команда | Результат | Статус |
| --------- | ------- | --------- | ------ |
| проекция = пересчёт, заполнение старых попыток, CHECK, триггер | серверные тесты фазы через with-test-db | 131/131 | PASS |
| восемь читателей с none/pending/graded | `attempt-readers-pending.test.ts` (в том же прогоне) | зелёный | PASS |
| фильтр review и status | `admin-attempts-list.test.ts` | зелёный | PASS |
| входная проверка сдачи и черновика | `attempt-submit.test.ts`, `attempt-time-limit.test.ts` | зелёные | PASS |
| итог в exam-core, пределы | `yarn workspace @bio-exam/exam-core test` | 723/723 | PASS |
| `attemptResultView`, модуль попытки после 422 | web-тесты | 40/40 | PASS |
| ворота репозитория | `yarn verify` | `yarn verify: OK` | PASS |
| отрисовка экранов | `yarn e2e` | не запускался (нужны серверы) | SKIP → ручная проверка |

### Запуск проб

Фаза не объявляет `scripts/*/tests/probe-*.sh`; проб нет.

### Требуется ручная проверка

1. **e2e после 3be6c16.** Запустить `yarn e2e e2e/tests/attempt-review-pending.spec.ts` или полный `yarn e2e`. Ожидается 292 passed без failed и flaky на desktop и mobile. Причина: верификатор не поднимает web и API.
2. **Контраст меток** (backstop 09-18). «На проверке» и «проверено учителем» на списке попыток, профиле, странице теста и экране после сдачи — не ниже 4,5:1 по вычисленным стилям.
3. **Ширины 375 / 768 / 1280** (backstop 09-12, 09-18). Нет горизонтального скролла, «проверено учителем» помещается, метка не сжимается рядом с длинным названием.
4. **Вставка > 200 знаков в краткий ответ** (backstop 09-11). Браузер обрезает по `maxLength`, сдача проходит.
5. **Выкатка 0026.** Вся фаза в master одним пакетом, свежая резервная копия, репетиция на свежем дампе под `bio_exam`, ручной `deploy.sh` вне окна сдач, после миграции без отката одного образа.
6. **Запросы после выкатки.** `attempts = none_count`, `mismatched = 0`; `open` неактивен; триггер есть; CHECK `convalidated`; `users_created_by_fk` `confdeltype = 'n'`; до миграции на проде нет своего типа с ключом `open` (IN-07).
7. **Запрет 09-05.** Подтвердить, что `drizzle-kit push` в ходе фазы не запускался; неизменность миграций 0000…0025 подтверждена `git diff`.

### Итог по пробелам

Пробелов, блокирующих цель, нет. Серверная основа результата (проекция, одна функция итога, один писатель, триггер неизменности, правило удаления, входная проверка сдачи) и все серверные читатели подтверждены зелёными поведенческими тестами и `yarn verify: OK`. Статус `human_needed`: отрисовку web-экранов подтверждает только e2e, здесь не повторённый; к нему добавляются три визуальные истины backstop и шаги выкатки, которые выполняет пользователь. Часть RES-01 о добавляемых записях проверок и статус открытого вопроса в попытке graded по плану переходят в фазу 15.

---

_Проверено: 2026-10-06T01:03:00Z_
_Верификатор: Claude (gsd-verifier)_
