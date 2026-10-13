---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 03
subsystem: database
tags: [drizzle, migration, postgres, upload-window, attempt, zod]
requires:
  - phase: 11-01
    provides: PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES, PHOTO_UPLOAD_WINDOW_MAX_MINUTES, ATTEMPT_SUBMIT_SOURCES, необязательные uploadClosesAt и submitSource в AttemptViewSchema
provides:
  - миграция 0030_attempt_upload_window (tests.photo_upload_window_minutes, CHECK 0…120, test_attempts.upload_closes_at)
  - upload_closes_at вычисляется в той же вставке, что попытка (submitAttempt)
  - uploadClosesAt и submitSource в ответе /submit и в виде попытки у персонала
  - photoUploadWindowMinutes в API создания и настроек теста (null и отсутствие — «не менять»)
  - помощники test-support shiftStartedAt, insertOpenQuestion, attemptRowOf
affects: [11-04, 11-05, 11-10, 11-11, 11-12, 11-18]
actuals:
  tokens: 34900
  tasks: 3
  commits: 0
tech-stack:
  added: []
  patterns:
    - момент окна считает база одним выражением LEAST(now(), конец таймера) + окно в той же вставке
    - литералы окна в schema.ts, равенство константам exam-core проверяет тест по CHECK базы
key-files:
  created:
    - app/server/drizzle/0030_attempt_upload_window.sql
    - app/server/drizzle/meta/0030_snapshot.json
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - scripts/check-migrations.mjs
    - app/server/src/services/attempt-sessions/access.ts
    - app/server/src/services/attempt-sessions/submit.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/services/scored-attempt/read.ts
    - app/server/src/services/scored-attempt/view.ts
    - app/server/src/test-support/attempt-world.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
    - app/server/src/schemas/tests.ts
    - app/server/src/services/question-content/relocate.ts
    - app/server/src/services/question-content/write.ts
    - app/server/src/services/question-content/move.ts
    - app/server/src/services/question-content/relocate.test.ts
key-decisions:
  - "Окно в архив экспорта не выгружается: набор ключей settings.json закреплён export.test.ts, импорта архивов в фазе нет"
  - "Вопрос open в серверных тестах вставляется прямой вставкой insertOpenQuestion: тип open засеян выключенным, API его не создаёт"
  - "Литералы окна (DEFAULT 15, CHECK BETWEEN 0 AND 120) в schema.ts без рантайм-импорта exam-core (C8); равенство PHOTO_UPLOAD_WINDOW_MAX_MINUTES проверяет тест CHECK базы (23514)"
  - "photoUploadWindowMinutes идёт через attemptTestColumns и видно в объекте test ответов ученика GET /topics/:topicSlug/tests/:testSlug и GET /tests/:id (C3)"
  - "null и отсутствие photoUploadWindowMinutes в API настроек и создания — «не менять» / значение по умолчанию базы (C10)"
requirements-completed: [TIME-02, TIME-03]
status: complete
---

# Phase 11 Plan 03: окно дозагрузки фото в данных Summary

Миграция 0030 добавила `tests.photo_upload_window_minutes` (по умолчанию 15, CHECK 0…120) и `test_attempts.upload_closes_at`; `submitAttempt` пишет момент закрытия окна в той же вставке как `LEAST(now(), started_at + лимит) + окно`, а `/submit` и вид попытки у персонала отдают `uploadClosesAt` и `submitSource`.

## Что сделано

- Task 1 (tracer): столбцы и CHECK в `schema.ts` литералами; миграция `0030_attempt_upload_window` сгенерирована `drizzle-kit generate` без интерактива, первой строкой добавлен `SET LOCAL lock_timeout = '5s'`; запись манифеста; шапка `check-migrations.mjs` «0000-0030». `AttemptTest.photoUploadWindowMinutes` через общий `attemptTestColumns`. `submitAttempt` получил необязательные `timeLimitMinutes`, `uploadWindowMinutes`, `hasOpenQuestion` (по умолчанию `null`, `0`, `false` — окно `NULL`, `scripts/e2e-seed.ts` не меняется), читает `startedAt` под `FOR UPDATE` и считает `upload_closes_at` одним SQL-выражением. `/submit` передаёт лимит, окно теста и `facts.some((fact) => fact.template === 'open')`. `readAttemptRow` читает `uploadClosesAt`, `submitSource`; `buildAttemptView` отдаёт `uploadClosesAt ?? null`, `submitSource ?? 'client'`. `insertOpenQuestion` в `attempt-world.ts`. Tracer-тест в `attempt-deadline.test.ts`.
- Task 2: `shiftStartedAt` перенесён в `attempt-world.ts` (сигнатура `(ctx, sessionId, interval)`), локальная копия в `attempt-time-limit.test.ts` удалена, ожидания не менялись; `attemptRowOf`. `test.each` в `attempt-deadline.test.ts`: в пределах льготы (старт 11 минут назад, лимит 10) окно от конца таймера, без лимита — от сдачи, окно 0 — `NULL`, без открытого вопроса — `NULL`; в каждом случае вид попытки у персонала (`GET /api/tests/admin/attempts/:attemptId`, поле `attempt`) несёт тот же `uploadClosesAt` и `submitSource: 'client'`.
- Task 3: `photoUploadWindowMinutes: z.number().int().min(0).max(PHOTO_UPLOAD_WINDOW_MAX_MINUTES).nullable().optional()` в `SaveTestSchema` и `UpdateTestSettingsSchema`; `relocate.ts` и `write.ts` пишут значение только при `!= null`; `move.ts` копирует окно источника в тест-получатель. `describe('окно для фото в настройках теста')` в `relocate.test.ts`: создание с 30 / без поля / с `null`; PATCH 0 → тело без поля → `null` → 120 и `GET /api/tests/:id` у автора; 121, -1, 12.5, `'15'` → 400 с `details.fieldErrors.photoUploadWindowMinutes`, значение прежнее; прямой `UPDATE` на `MAX + 1` → `23514`, на `MAX` проходит.

## Миграция

SQL `app/server/drizzle/0030_attempt_upload_window.sql` по порядку:

```sql
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "upload_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "photo_upload_window_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_photo_upload_window_minutes_check" CHECK ("tests"."photo_upload_window_minutes" BETWEEN 0 AND 120);
```

Манифест: idx 30, `sha256` `4d147eccdc0f58e777037ff4cabddb80a84f851d94f8bd4db76ff1f9bc445f44`, `when` `1791292874244` (больше 1791268928915, правка `when` не понадобилась). `DROP`, `RENAME`, `ALTER COLUMN`, `REFERENCES` в файле нет. Обратного заполнения нет: существующие тесты получают 15, существующие попытки — `upload_closes_at` NULL.

Вывод `node scripts/check-migrations.mjs`:

```
DRZ-01: chain == schema.ts
ok - chain-vs-schema
ok - idempotency
ok - generate-no-diff
ok - drizzle-check
check-migrations: OK
```

## Проверки

- `node scripts/check-migrations.mjs`: `check-migrations: OK`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-deadline.test.ts src/routes/tests/attempt-time-limit.test.ts`: 2 файла, 20 тестов зелёные.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content/relocate.test.ts`: 33 теста зелёные.
- `yarn workspace @bio-exam/server typecheck`: без ошибок.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test`: 100 файлов, 1944 теста зелёные (до плана 100 файлов, 1930 тестов; +5 в `attempt-deadline.test.ts`, +9 в `relocate.test.ts`), в том числе `export.test.ts` с прежним набором ключей и `user-deletion-rule.test.ts`.
- `yarn verify`: `yarn verify: OK` (все шаги passed; server 100 файлов, web 94, exam-core 15, rbac 2). Пробел в SQL-строке `submit.ts` (`) +make_interval` → `) + make_interval`) поправлен во время прогона; после правки `attempt-deadline.test.ts` (6 тестов) и `yarn format:check` зелёные.
- `11-plan-files.cjs check 11-03` не запускался: в режиме worktree проверку файлов плана делает ведущая сессия (11-EXEC-RULES). `git status --short` показывает только файлы из `files_modified` плана.

## codegraph

Индекс CodeGraph обслуживается из основного checkout (`/Users/kdvornichenko/bio-exam`, тот же коммит dev `64ee68e`), поэтому вывод относится к коду до правок.

- `codegraph impact submitAttempt`: `POST /api/tests/public/tests/:id/submit` (`routes/tests/public.ts`), `routes/index.ts`, `scripts/e2e-seed.ts` (`main`), `services/attempt-sessions/index.ts`. Новые параметры необязательные, e2e-сид не менялся.
- `codegraph impact findVisible`: `findVisibleTest`, `findVisibleTestBySlug`, `checkAttemptAccess`, `GET /api/tests/public/topics/:topicSlug/tests/:testSlug`, `services/attempt-sessions/index.ts`.
- `codegraph impact buildAttemptView`: `view.test.ts` (`viewOf`), `read.ts` (`readAttemptView`, `readAdminAttemptView`), `GET /admin/attempts/:attemptId`, `attempt-readers-pending.test.ts`, `POST /submit`.
- `codegraph impact updateTestSettings`: `PATCH /:id/settings` (`tests-core.ts`), `services/question-content/index.ts`; одноимённая web-функция `test-editor-api.ts` (11-10) не затронута.
- `codegraph affected` по файлам плана: 189 тестовых файлов (серверные тесты попытки, `scored-attempt`, `question-content`, весь e2e через `schema.ts`); прогнаны весь серверный набор и `yarn verify`, e2e не запускался (план его не требует).

## Deviations from Plan

None - plan executed exactly as written. Пояснения:
- `actuals.commits: 0`: по правилам фазы 11 исполнитель не коммитит, изменения оставлены в рабочем дереве worktree для ведущей сессии. `actuals.tokens` включает сгенерированный `meta/0030_snapshot.json` (105 КБ); рукописная часть — около 8 500.
- Конец таймера передаётся в SQL как прочитанный под `FOR UPDATE` `startedAt` (параметр `Date`, точность до миллисекунды; микросекунды `started_at` теряются, на окно это не влияет).
- Шаг 6 Task 3 (`11-plan-files.cjs check 11-03`) пропущен по правилу режима worktree.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей сверх `<threat_model>`: T-11-05 закрыт zod-ограничением и CHECK с тестами 121/-1/12.5/строка и `23514`; T-11-06 — момент считает база (`now()`, `started_at` под `FOR UPDATE`), клиент его не передаёт; T-11-07 — `SET LOCAL lock_timeout = '5s'`, `ADD COLUMN` с константой по умолчанию; T-11-08 — значение пишется только при `!= null`, тесты «без поля» и `null`; T-11-64 принят (поле окна в объекте `test` ответов ученика).

## Файлы к коммиту

Корень worktree `/Users/kdvornichenko/bio-exam/.claude/worktrees/agent-a4e31686a1c5fc120`:

- `app/server/drizzle/0030_attempt_upload_window.sql` (новый), `app/server/drizzle/meta/0030_snapshot.json` (новый), `app/server/drizzle/meta/_journal.json`, `app/server/drizzle/migrations-manifest.json`
- `app/server/src/db/schema.ts`, `scripts/check-migrations.mjs`
- `app/server/src/services/attempt-sessions/access.ts`, `app/server/src/services/attempt-sessions/submit.ts`, `app/server/src/routes/tests/public.ts`
- `app/server/src/services/scored-attempt/read.ts`, `app/server/src/services/scored-attempt/view.ts`
- `app/server/src/schemas/tests.ts`, `app/server/src/services/question-content/relocate.ts`, `app/server/src/services/question-content/write.ts`, `app/server/src/services/question-content/move.ts`
- `app/server/src/test-support/attempt-world.ts`, `app/server/src/routes/tests/attempt-deadline.test.ts`, `app/server/src/routes/tests/attempt-time-limit.test.ts`, `app/server/src/services/question-content/relocate.test.ts`

## Self-Check: PASSED
