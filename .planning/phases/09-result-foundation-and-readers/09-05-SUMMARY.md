---
phase: 09-result-foundation-and-readers
plan: 05
subsystem: database
tags: [migration, projection, trigger, test_attempts, open-question, user-deletion]
requires: ["09-01", "09-02", "09-04"]
provides:
  - "Миграция 0026_attempt_result_projection: столбцы проекции test_attempts, заполнение существующих попыток, четыре CHECK, триггер test_attempts_facts_immutable, сид неактивного open, users_created_by_fk с ON DELETE SET NULL"
  - "Поля Drizzle reviewStatus, finalEarnedPoints, finalScorePercentage, finalPassed, gradedAt, passingScore, autoTotalPoints, submitSource"
  - "ScoreSubmissionResult.outcome/passingScore, ScoredAttemptFacts.outcome/passingScore; сдача пишет проекцию той же вставкой"
  - "insertAttemptFixture и тип Queryable в app/server/src/test-support/attempt-fixture.ts"
affects: [09-06, 09-07, 09-09, 09-10, 09-17, phase-10]
tech-stack:
  added: []
  patterns:
    - "Заполнение до CHECK в одной миграции: ADD COLUMN (nullable) -> UPDATE -> SET NOT NULL -> ADD CONSTRAINT"
    - "Неизменяемость фактов триггером BEFORE UPDATE с ERRCODE 23001 и CONSTRAINT в ошибке"
    - "Прямые вставки попыток в тестах только через insertAttemptFixture"
key-files:
  created:
    - app/server/drizzle/0026_attempt_result_projection.sql
    - app/server/drizzle/meta/0026_snapshot.json
    - app/server/src/db/attempt-result-migration.test.ts
    - app/server/src/test-support/attempt-fixture.ts
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - scripts/check-migrations.mjs
    - app/server/src/services/scored-attempt/facts.ts
    - app/server/src/services/attempt-sessions/submit.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/db/attempt-session-migration.test.ts
    - app/server/src/db/user-deletion-rule.test.ts
    - app/server/src/services/question-content/move-remove.test.ts
    - app/server/src/routes/tests/admin-attempts-list.test.ts
    - app/server/src/services/access-policy/zone-store.test.ts
    - app/server/src/routes/tests/attempt-review.test.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
decisions:
  - "Одна миграция 0026 (без разделения на 0026/0027): заполнение, CHECK, триггер и сид в одном файле; фаза 10 берёт 0027"
  - "В submitAttempt четыре фактовых столбца берутся из scored.outcome.submitted, проекция из projectionOf(scored.outcome); прежние поля ScoredAttemptFacts оставлены для совместимости формы"
  - "insertAttemptFixture в режиме фактов по умолчанию пишет results '[]' и results_version 1 (значение по умолчанию столбца); переведённые фикстуры явно передают results {} как раньше, чтобы поведение тестов не менялось"
  - "Drizzle-вставки zone-store.test.ts и attempt-review.test.ts получили столбцы проекции (меньшая правка), SQL-вставки admin-attempts-list.test.ts и move-remove.test.ts переведены на insertAttemptFixture"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 38000
  tasks: 3
  commits: 0
plan_head_before: d83a2e4e10675c5f8ae4ad9ddf605c43c27851cb
plan_head_after: d83a2e4e10675c5f8ae4ad9ddf605c43c27851cb
---

# Phase 9 Plan 05: Хранение результата, миграция 0026 Summary

Миграция `0026_attempt_result_projection` добавляет проекцию результата на `test_attempts`, заполняет существующие попытки до включения CHECK, закрывает факты сдачи триггером `test_attempts_facts_immutable` (23001), засевает `open` неактивным и переводит `users_created_by_fk` на `ON DELETE SET NULL`; сдача пишет факты и проекцию одной вставкой через `computeAttemptOutcome`/`projectionOf`. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия).

## Предусловие

`_journal.json` до плана: последняя запись `idx 25`, `0025_teacher_zones`; незакоммиченных файлов миграций не было. Проверка прошла.

## codegraph impact (до правок)

- `scoreSubmission` (5): `scored-attempt/facts.ts`, `routes/tests/public.ts` (`POST /api/tests/public/tests/:id/submit`), `routes/index.ts`, `scored-attempt/index.ts`. Форма ok-результата расширена, прежние поля на месте.
- `submitAttempt` (сервис, 5): `attempt-sessions/submit.ts`, `public.ts` (маршрут сдачи), `routes/index.ts`, `attempt-sessions/index.ts`. Одноимённый помощник `test-support/attempt-world.ts` (20 тестовых файлов) ходит HTTP и не затронут. Прямые вызовы сервиса с `scored` — только `attempt-time-limit.test.ts` (две штуки, см. отклонения).
- `testAttempts` (15): `schema.ts` (relations), `routes/tests/admin/attempts.ts`, `public.ts`, `routes/users/index.ts`, `access-policy/zone-loader.ts`, `attempt-sessions/submit.ts`, `attempt-sessions/sessions.ts`, `question-content/remove.ts`, `scored-attempt/legacy.ts`, `scored-attempt/read.ts`. Вставляет строки только `submit.ts`; остальные читают и не меняются (переход читателей на проекцию — планы 09-09/09-10).

## Итоговый SQL миграции (операторы по порядку)

1. `SET LOCAL lock_timeout = '5s'`
2. `ALTER TABLE "users" DROP CONSTRAINT "users_created_by_fk"` (единственный DROP)
3. `ADD COLUMN` по `test_attempts`: `review_status text DEFAULT 'none' NOT NULL`, `final_earned_points real`, `final_score_percentage real`, `final_passed boolean`, `graded_at timestamptz`, `passing_score real`, `auto_total_points real` (без NOT NULL), `submit_source text DEFAULT 'client' NOT NULL`
4. `UPDATE "test_attempts" AS ta SET final_* = earned_points/score_percentage/passed, auto_total_points = total_points, passing_score = (SELECT t.passing_score FROM tests t WHERE t.id = ta.test_id)`
5. `ALTER COLUMN "auto_total_points" SET NOT NULL`
6. `ADD CONSTRAINT "users_created_by_fk" ... ON DELETE set null ON UPDATE no action`
7. CHECK (текст из `drizzle-kit generate` без изменений): `test_attempts_review_status_check`, `test_attempts_submit_source_check`, `test_attempts_review_projection_check` (три равенства `(final_x IS NULL) = (review_status = 'pending')` через AND), `test_attempts_graded_at_check` (`(review_status = 'graded') = (graded_at IS NOT NULL)`)
8. `CREATE FUNCTION "test_attempts_facts_immutable"()` (plpgsql): `IS DISTINCT FROM` по `answers`, `results`, `results_version`, `earned_points`, `total_points`, `score_percentage`, `passed` -> `RAISE EXCEPTION 'test_attempts facts are immutable' USING ERRCODE = '23001', CONSTRAINT = 'test_attempts_facts_immutable'`, иначе `RETURN NEW`
9. `CREATE TRIGGER "test_attempts_facts_immutable" BEFORE UPDATE ON "test_attempts" FOR EACH ROW`
10. `INSERT INTO "question_types"` `open` (`'Открытый вопрос'`, `'Развёрнутый ответ, баллы от 0 до 3 выставляет учитель'`, `ui_template 'open'`, `validation_schema NULL`, `scoring_rule {"formula":"exact_match","mistakeMetric":"manual","correctPoints":3}`, `is_system true`, `is_active false`) `ON CONFLICT ("key") DO NOTHING`

`results_version` и его CHECK не тронуты; `criteria_path`, `photo_upload_window_minutes`, `upload_closes_at` не добавлялись (D-20). Комментариев в SQL нет.

## Манифест

- `idx 26`, `tag 0026_attempt_result_projection`, `file 0026_attempt_result_projection.sql`
- `sha256 79a09926d095a95c2a17b26aaffe09c02ba1d23816e1786028a82d666ac65b7e`
- `when 1791239364196` (> `1791139459249` у 0025), `breakpoints true`; совпадает с журналом
- Шапка `scripts/check-migrations.mjs`: «цепочка 0000-0025» -> «0000-0026», логика не менялась

## Что сделано

- Task 1 (tracer): `schema.ts` — восемь столбцов, четыре `check(...)`, `users_created_by_fk.onDelete('set null')`; генерация `drizzle-kit generate ... --name=attempt_result_projection < /dev/null` дала ожидаемый файл (единственный DROP — ключ пользователей), правка SQL до применения, запись манифеста. `facts.ts`: суммы и формула порога заменены одним `computeAttemptOutcome({ facts, finalScores: new Map(), passingScore })`, ok-результат несёт `outcome`, `passingScore` и прежние поля из `outcome.submitted`. `submit.ts`: факты из `scored.outcome.submitted`, `...projectionOf(scored.outcome)`, `passingScore`, `submitSource: 'client'`, `gradedAt: null` в той же вставке. `public.ts`: передаёт `outcome` и `passingScore` (обработка `type_not_configured` не менялась).
- Task 2: `attempt-result-migration.test.ts` (`LAST_APPLIED_IDX = 25`, префикс `test_attempt_result_mig`): два теста (порог 60 и NULL), две сессии, три попытки старыми столбцами; после 0026 — `none`, `final_*`/`auto_total_points` равны фактам (сравнение в SQL через `IS NOT DISTINCT FROM`), `passing_score` 60/60/NULL, `graded_at NULL`, `submit_source 'client'`; запрос сверки из User steps: `attempts = none_count = 3`, `mismatched = 0`; `pending` с итогом и `none` без итога -> 23514 `test_attempts_review_projection_check`; UPDATE каждого из семи фактовых столбцов (`test.each`) -> 23001 `test_attempts_facts_immutable`; UPDATE `session_id` и `final_score_percentage` проходят; `open` неактивен с метрикой `manual`; повторный прогон сида из файла миграции не выключает включённый `open` (`rowCount 0`); удаление сессии обнуляет `session_id` попытки сквозь триггер, удаление теста удаляет его попытки; `users_created_by_fk.confdeltype = 'n'`; hash в `__drizzle_migrations` = sha256 манифеста. `attempt-session-migration.test.ts`: `insertAttempt` принимает `{ sessionId, projected, resultsVersion }`, вставки после цепочки идут с проекцией, проверка `results_version = 3` — INSERT с согласованной проекцией. `user-deletion-rule.test.ts`: `LEGACY_EXCEPTIONS = []`, новый случай «удаление пригласившего» (`created_by` приглашённого -> NULL).
- Task 3: `insertAttemptFixture(executor: Queryable, input)` — один параметризованный `INSERT ... RETURNING id` со всеми фактовыми и проекционными столбцами; режим фактов (проекция `none` = фактам) и режим `outcomeFacts` (значения из `computeAttemptOutcome`/`projectionOf`, `graded_at = now()` при `graded`, `results` — факты версии 2). Проверено разовым прогоном вне репозитория: строка режима `outcomeFacts` (single_choice + open) даёт `pending`, `auto_total_points = 1`, `results` проходит `AttemptFactsSchema`. Переведены `admin-attempts-list.test.ts` и `move-remove.test.ts` (локальный `Queryable` заменён экспортом помощника); Drizzle-вставки `zone-store.test.ts` и `attempt-review.test.ts` получили `finalEarnedPoints`, `finalScorePercentage`, `finalPassed`, `autoTotalPoints`. `expectedSummary` не трогался.

## codegraph affected

`codegraph affected schema.ts facts.ts submit.ts public.ts attempt-fixture.ts`: 165 строк вывода — практически все серверные интеграционные тесты, web-модули API и e2e-спеки (схема подключена везде). Серверный набор прогнан целиком; e2e создаёт попытки HTTP-сдачей и прямых вставок `test_attempts` не содержит (`rg` пуст), в `yarn verify` не входит и не запускался.

## Проверки

- `node scripts/check-migrations.mjs`: `ok - manifest`, `DRZ-01: chain == schema.ts`, `ok - chain-vs-schema`, `ok - idempotency`, `ok - generate-no-diff` («No schema changes»), `ok - drizzle-check`, `check-migrations: OK`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-submit.test.ts src/routes/tests/attempt-readers-none.characterization.test.ts src/routes/tests/attempt-time-limit.test.ts`: 3 файла, 32 теста passed (характеризация 09-02 без правок).
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/attempt-result-migration.test.ts src/db/attempt-session-migration.test.ts src/db/user-deletion-rule.test.ts`: 3 файла, 38 тестов passed.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test`: 88 файлов, 1777 тестов passed. До плана: 87 файлов и 1758 тестов (вычтены новый файл с 18 тестами и новый случай в `user-deletion-rule.test.ts`).
- `yarn workspace @bio-exam/server typecheck`: чисто. `yarn format:check`: чисто.
- Приёмка: `test_attempts_facts_immutable` в SQL 3 раза, `DO NOTHING` 1, `DROP COLUMN|DROP TABLE|RENAME` 0, `users_created_by_fk` 2; `Number(passingScore)` в `facts.ts` 0; `projectionOf` в `submit.ts` 2; `git diff --name-only -- app/server/drizzle` — только `_journal.json` и `migrations-manifest.json`; `rg "INSERT INTO test_attempts"` вне тестов миграций и помощника пуст.
- `yarn verify`: шаги `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests` passed, итог `yarn verify: OK` (с первого прогона).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-05`: `outside plan: app/server/src/routes/tests/attempt-time-limit.test.ts` — ожидаемое отклонение 1 (ниже), других файлов вне плана нет.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `attempt-time-limit.test.ts` вне `files_modified`**
- **Found during:** Task 1
- **Issue:** тест вызывает сервис `attemptSessions.submitAttempt` напрямую с `scored: STUB_FACTS`; после расширения `ScoredAttemptFacts` по плану (`outcome`, `passingScore`) `typecheck` падал (TS2739), а вставка без проекции падала бы 23502/23514.
- **Fix:** `STUB_FACTS` получил `outcome: computeAttemptOutcome({ facts: [], finalScores: new Map(), passingScore: 60 })` и `passingScore: 60` (сохраняет прежние `passed: false` и 0 баллов). Поля не сделаны необязательными, чтобы не ослаблять контракт.
- **Files modified:** `app/server/src/routes/tests/attempt-time-limit.test.ts`
- **Commit:** нет (коммитит ведущая сессия)

Коммиты не создавались по правилу пользователя (`commits: 0`, изменения в рабочем дереве).

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей сверх `<threat_model>`. T-09-12 (триггер и тест UPDATE фактов), T-09-13 (CHECK после UPDATE, тест поверх данных, запрос сверки), T-09-14 (`SET LOCAL lock_timeout = '5s'`), T-09-15 (`ON CONFLICT DO NOTHING`, тест повторного сида), T-09-16 (одна `computeAttemptOutcome` при INSERT), T-09-51 (`ON DELETE SET NULL`, пустой `LEGACY_EXCEPTIONS`, поведенческий случай) закрыты. T-09-52 — шаги пользователя при выкатке (User steps плана).

Проверка T-09-12: `rg -n "update\(testAttempts\)|update\(schema\.testAttempts\)|UPDATE\s+\"?test_attempts" app/server/src --glob '!**/*.test.ts' --glob '!**/test-support/**'` пуст, в `app/server/src/scripts` обращений к `testAttempts` нет: рабочий код не обновляет строки попыток, триггер ничего не ломает вне тестов.

## User steps

Выкатка 0026 на прод — ручной шаг пользователя после всей фазы 9 (план, раздел User steps): репетиция на свежем дампе, `deploy.sh` вне окна сдач, запрет отката одного образа, проверочные запросы (сверка `attempts = none_count`, `mismatched = 0`, `open` неактивен, триггер есть, CHECK `convalidated`, `confdeltype = 'n'`).

## Файлы к коммиту

```
 M app/server/drizzle/meta/_journal.json
 M app/server/drizzle/migrations-manifest.json
 M app/server/src/db/attempt-session-migration.test.ts
 M app/server/src/db/schema.ts
 M app/server/src/db/user-deletion-rule.test.ts
 M app/server/src/routes/tests/admin-attempts-list.test.ts
 M app/server/src/routes/tests/attempt-review.test.ts
 M app/server/src/routes/tests/attempt-time-limit.test.ts
 M app/server/src/routes/tests/public.ts
 M app/server/src/services/access-policy/zone-store.test.ts
 M app/server/src/services/attempt-sessions/submit.ts
 M app/server/src/services/question-content/move-remove.test.ts
 M app/server/src/services/scored-attempt/facts.ts
 M scripts/check-migrations.mjs
?? app/server/drizzle/0026_attempt_result_projection.sql
?? app/server/drizzle/meta/0026_snapshot.json
?? app/server/src/db/attempt-result-migration.test.ts
?? app/server/src/test-support/attempt-fixture.ts
```

`docs/adr/0006-enforce-authorization-by-construction.md` принадлежит другой сессии и в коммит не входит.

## Self-Check: PASSED

Созданные файлы на месте; sha256 файла 0026 совпадает с манифестом; `check-migrations: OK`, серверный набор и `yarn verify: OK` зелёные.
