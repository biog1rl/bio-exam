---
phase: 05-attempt-integrity
plan: 03
subsystem: database
tags: [drizzle, postgres, migrations, attempt-session, results-version]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-01
    provides: "характеризация попытки (attempt-world.ts, attempt-known-defects.test.ts)"
  - phase: 04-03
    provides: "образец миграции с ручной чисткой и DB-теста поверх данных (0021, session-backfill.test.ts)"
provides:
  - "test_sessions.closed_at, test_sessions.close_reason, CHECK test_sessions_close_reason_check"
  - "частичный уникальный индекс test_sessions_open_uniq (test_id, user_id) WHERE submitted_at IS NULL AND closed_at IS NULL"
  - "test_attempts.session_id с FK test_attempts_session_id_test_sessions_id_fk ON DELETE SET NULL и частичным уникальным индексом test_attempts_session_id_uniq"
  - "test_attempts.results_version smallint NOT NULL DEFAULT 1 с CHECK test_attempts_results_version_check (1, 2)"
  - "миграции 0022_attempt_sessions и 0023_attempt_results_version (SQL, снимки, журнал, манифест)"
  - "attempt-session-migration.test.ts: чистка 0022 и умолчание 0023 поверх данных настоящим мигратором"
affects: [05-04, 05-05, 05-06, 05-07, 05-08, 05-11, phase-07]

actuals:
  tokens: 48800
  tasks: 4
  commits: 0

tech-stack:
  added: []
  patterns:
    - "FK в цикле ссылок таблиц: .references((): AnyPgColumn => testSessions.id, { onDelete: 'set null' })"
    - "Первый оператор миграции SET LOCAL lock_timeout = '5s' внутри транзакции мигратора drizzle"
    - "DB-тест миграции: копия каталога drizzle до idx 21, вставка данных, затем настоящий migrateTestDatabase"

key-files:
  created:
    - app/server/drizzle/0022_attempt_sessions.sql
    - app/server/drizzle/0023_attempt_results_version.sql
    - app/server/drizzle/meta/0022_snapshot.json
    - app/server/drizzle/meta/0023_snapshot.json
    - app/server/src/db/attempt-session-migration.test.ts
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - scripts/check-migrations.mjs
    - app/server/src/db/session-backfill.test.ts

key-decisions:
  - "Фактическое имя FK test_attempts.session_id — test_attempts_session_id_test_sessions_id_fk (умолчание drizzle)"
  - "Проверка разрушающих операторов из Task 2 применена к началу каждого оператора: исходное регулярное выражение \\bDELETE\\b ловит обязательное по плану ON DELETE set null (решение исполнителя, автономно)"
  - "session-backfill.test.ts сравнивает число миграций с манифестом и ищет запись 0021 по when, а не по последней строке: иначе любая новая миграция ломает тест 0021 (решение исполнителя, автономно; файл вне allow-list плана)"
  - "Журналу после drizzle-kit generate возвращён завершающий перевод строки, как в HEAD"

requirements-completed: []

duration: 8min
completed: 2026-10-04
plan_head_before: f0ba0ab
plan_head_after: f0ba0ab
---

# Phase 5 Plan 03: Миграции 0022 и 0023 Summary

Две аддитивные миграции: 0022 закрывает дубликаты открытых сессий как `superseded` и ставит частичные уникальные индексы «одна открытая сессия на пару» и «одна попытка на сессию» с FK `test_attempts.session_id`; 0023 добавляет `test_attempts.results_version` (по умолчанию 1, CHECK 1/2). Обе проверены на `test_*` с пустой базы (`yarn verify`) и поверх данных с дубликатами настоящим мигратором.

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`). `commits: 0`, HEAD до и после плана `f0ba0ab`.

## Файлы к коммиту

- `app/server/src/db/schema.ts` (изменён)
- `app/server/drizzle/0022_attempt_sessions.sql` (новый)
- `app/server/drizzle/0023_attempt_results_version.sql` (новый)
- `app/server/drizzle/meta/0022_snapshot.json` (новый)
- `app/server/drizzle/meta/0023_snapshot.json` (новый)
- `app/server/drizzle/meta/_journal.json` (изменён)
- `app/server/drizzle/migrations-manifest.json` (изменён)
- `app/server/src/db/attempt-session-migration.test.ts` (новый)
- `scripts/check-migrations.mjs` (изменён, только шапка: «0000-0021» → «0000-0023»)
- `app/server/src/db/session-backfill.test.ts` (изменён, вне allow-list плана, см. «Отклонения»)

## codegraph impact (D-23)

`codegraph impact testSessions` — 4 символа: `schema.ts` (`testSessions`, `testSessionsRelations`), `routes/tests/public.ts`, `routes/index.ts`.

`codegraph impact testAttempts` — 9 символов: `schema.ts` (`testAttempts`, `testSessions`, `testSessionsRelations`, `testAttemptsRelations`, `testsRelations`), `routes/tests/index.ts`, `routes/index.ts`, `routes/tests/public.ts`, `routes/users/index.ts`.

Новые колонки nullable или с умолчанием, вставки в коде их не задают; кодовые пути не менялись. `attempt-world.ts` вставляет одну открытую сессию на пару и с новым индексом не конфликтует.

`codegraph affected app/server/src/db/schema.ts` — 44 файла, в том числе серверные DB-тесты (`answer-keys-jsonb`, `timestamps`, auth-тесты, `access-routes`, `exam-flow`, `uploads`, `access-policy/*`, `storage/*`), `routes/tests/{index,public,assignments}.ts`, `lib/tests/question-type-resolver.ts` и web-клиенты тестов (`TestRunner.tsx`, `MdxRenderer.tsx`, страницы `admin/tests/*`, `lib/session/*`). Все прогнаны в `yarn verify` (server 27 файлов, web 22, exam-core 11, rbac 1 — зелёные).

## Typecheck до генерации (Task 1 п. 2а)

`yarn workspace @bio-exam/server typecheck` после правки `schema.ts` и до `drizzle-kit generate`: exit 0, вывода нет, строк `error TS` нет (цикл `testAttempts.sessionId` ↔ `testSessions.attemptId` разорван аннотацией `AnyPgColumn`). Повторно — exit 0 после добавления `resultsVersion`.

## Сгенерированный DDL

`drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=./drizzle` без конфига и без интерактива; вопросов о переименовании не было, DROP/RENAME нет.

### 0022_attempt_sessions.sql (итоговый, sha256 `e4b1dea5874d20b1a09bc5c95e9b7656deb73ba0d655fc88ec0dee2a3c2293b9`, when `1791111490563`)

1. `SET LOCAL lock_timeout = '5s'` — вписан вручную первым оператором
2. `ALTER TABLE "test_attempts" ADD COLUMN "session_id" uuid`
3. `ALTER TABLE "test_sessions" ADD COLUMN "closed_at" timestamp with time zone`
4. `ALTER TABLE "test_sessions" ADD COLUMN "close_reason" text`
5. `UPDATE "test_sessions" SET "closed_at" = now(), "close_reason" = 'superseded' WHERE "id" IN (… row_number() OVER (PARTITION BY "test_id", "user_id" ORDER BY "started_at" DESC, "id" DESC) … WHERE "submitted_at" IS NULL AND "closed_at" IS NULL … "rn" > 1)` — чистка D-06, вписана вручную
6. `ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE set null ON UPDATE no action`
7. `CREATE UNIQUE INDEX "test_attempts_session_id_uniq" ON "test_attempts" USING btree ("session_id") WHERE "test_attempts"."session_id" IS NOT NULL`
8. `CREATE UNIQUE INDEX "test_sessions_open_uniq" ON "test_sessions" USING btree ("test_id","user_id") WHERE "test_sessions"."submitted_at" IS NULL AND "test_sessions"."closed_at" IS NULL`
9. `ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_close_reason_check" CHECK ("test_sessions"."close_reason" IN ('expired', 'superseded'))`

CHECK генератор поставил после UPDATE; порядок не менялся.

### 0023_attempt_results_version.sql (sha256 `722a4d18bfd1583941abfbc655c9f9115aacefe4f04d0746f07b1708b5584c0a`, when `1791111589181`)

1. `ALTER TABLE "test_attempts" ADD COLUMN "results_version" smallint DEFAULT 1 NOT NULL`
2. `ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_results_version_check" CHECK ("test_attempts"."results_version" IN (1, 2))`

Ручного SQL в 0023 нет.

**Фактическое имя FK:** `test_attempts_session_id_test_sessions_id_fk`.

## Задачи

### Task 1 (tracer): schema.ts, 0022, чистка, DB-тест

- `schema.ts`: `testSessions.closedAt`, `closeReason`, `openSessionUniq`, `closeReasonCheck`; `testAttempts.sessionId` (FK в колонке через `AnyPgColumn`), `sessionUniq`; импорты `check`, `type AnyPgColumn`.
- 0022 сгенерирован, вписаны `SET LOCAL lock_timeout = '5s'` и UPDATE чистки; запись idx 22 в манифесте с sha256 итогового файла.
- `attempt-session-migration.test.ts` (префикс `test_attempt_mig`): копия `drizzle` до idx 21, пользователи u1/u2, тема, t1 (без лимита), t2 (лимит 10), A1 со старым массивом `results`, сессии S1–S7 по плану, затем `migrateTestDatabase`. Утверждения: открыты ровно S2, S5, S6; S1 и S4 `superseded`; прежние колонки всех строк (включая черновик S1, сданные S3 и S7) не изменились; число строк не изменилось; `A1.session_id` NULL; повтор UPDATE из файла — `rowCount 0`; оба индекса частичные (`WHERE` в `indexdef`); вторая открытая сессия (u2, t1) — 23505; две попытки с одним `session_id` — 23505; `close_reason = 'other'` — 23514; хэш 0022 в `__drizzle_migrations` равен манифесту.
- Tracer-гейт: `8 passed (8)`, затем расширение.

### Task 2: results_version, 0023, манифест

- `schema.ts`: `resultsVersion: smallint('results_version').notNull().default(1)`, `resultsVersionCheck`; импорт `smallint`.
- 0023 сгенерирован, запись idx 23 в манифесте.
- Тест дополнен describe `0023_attempt_results_version applied over existing attempts`: хэш 0023 равен манифесту; A1 (единственная попытка до миграции) — `results_version = 1`; новая попытка без значения — 1; `results_version = 3` — 23514. Итог: `Tests 12 passed (12)`.
- `scripts/check-migrations.mjs`: в шапке «0000-0021» → «0000-0023», логика не менялась.
- Проверка манифеста: `0022/0023 manifest ok` (с поправкой проверки разрушающих операторов, см. «Отклонения»); `0000-0021 unchanged`.

### Task 3: гейт миграций — см. `## Migration gate`

### Task 4: отложен — см. `## Deferred human verification`

## Migration gate

- `node --test scripts/check-migrations.test.mjs`: `tests 14`, `pass 14`, `fail 0`.
- `yarn verify` — exit 0, последняя строка `yarn verify: OK`; все восемь шагов `passed`. Шаг `migrations`:
  ```
  ok - manifest
  ok - chain-vs-schema
  ok - idempotency
  ok - generate-no-diff
  ok - drizzle-check
  check-migrations: OK
  ```
  `DRZ-01: chain == schema.ts`; generate-no-diff: `No schema changes, nothing to migrate`; drizzle-check: `Everything's fine`.
- Тесты в `yarn verify`: server `Test Files 27 passed (27)`, web 22, exam-core 11, rbac 1.
- Повторный прогон DB-теста миграции: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/attempt-session-migration.test.ts` → `Test Files 1 passed (1)`, `Tests 12 passed (12)`.
- Сверка с отпечатком `.planning/commit-snapshots/before-05-03/fingerprint.json` (0 путей, дерево было чистым): exit 1 с единственной строкой `app/server/src/db/session-backfill.test.ts` — файл вне девяти файлов плана, изменён намеренно (см. «Отклонения»). Проверка «все девять файлов изменены» в однострочнике после выхода с кодом 1 не выполняется; по `git status --porcelain --untracked-files=all` все девять файлов плана изменены (4) или созданы (5), других изменений, кроме `session-backfill.test.ts`, нет. Применённые миграции 0000–0021 не изменены (`0000-0021 unchanged`).
- `drizzle-kit push` не запускался; `DATABASE_URL` из `.env` не использовался; все базы — временные `test_*` через `with-test-db` и `yarn verify`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] session-backfill.test.ts падал после добавления миграций**
- **Found during:** Task 3 (`yarn verify: FAILED at lint-typecheck-test`)
- **Issue:** тест 0021 утверждал `migrationCount() === 22` и брал последнюю строку `__drizzle_migrations` как запись 0021; с 0022 и 0023 получил `24 !== 22`. Тест жёстко привязан к тому, что 0021 последняя.
- **Fix:** число миграций сравнивается с длиной манифеста, запись 0021 ищется по `created_at = entry.when` с проверкой `rows.length === 1`; название теста уточнено. Остальные утверждения (бэкфилл, повтор, RLS) не менялись.
- **Files modified:** `app/server/src/db/session-backfill.test.ts` (вне allow-list плана; сверка с отпечатком из-за него выходит с кодом 1)
- **Решение исполнителя (автономно).**

**2. [Rule 1 - Bug в проверке плана] Регулярное выражение разрушающих операторов ловит ON DELETE**
- **Found during:** Task 2, проверка `0022/0023 manifest ok`
- **Issue:** однострочник плана выходит с кодом 5: `\bDELETE\b` совпадает с `ON DELETE set null` в FK `test_attempts_session_id_test_sessions_id_fk`, который план сам требует (truth 1, Task 1 п. 2). Операторов DELETE, DROP, RENAME в 0022 и 0023 нет.
- **Fix:** SQL и sha256 не менялись. Тот же однострочник запущен с проверкой начала каждого оператора (`split('--> statement-breakpoint')`, `/^(DROP|RENAME|DELETE)\b|ALTER COLUMN[^;]*TYPE|RENAME (COLUMN|TO)\b/i`); остальные проверки без изменений; вывод `0022/0023 manifest ok`. Шаг `migrations` в `yarn verify` (проверка DROP) зелёный.
- **Решение исполнителя (автономно).**

**3. Журнал после generate без завершающего перевода строки**
- drizzle-kit пишет `_journal.json` без `\n` в конце; возвращён, как в HEAD, чтобы diff журнала был только добавлением записей.

## Deferred human verification

Task 4 (`checkpoint:human-verify`, `gate="blocking-human"`). **Не выполнено, ждёт пользователя; исполнитель не одобрял.** Миграции аддитивны, текущий код server с ними работает. Применяются на проде непосредственно перед деплоем web и server фазы 5, в том же тихом окне (D-25 шаг 3).

1. Read-only на проде: `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3;` — верхняя строка `created_at = 1791095839799` (0021). Иначе — стоп и решение по истории до применения 0022.
2. Read-only SQL `05-CONTEXT.md` `<specifics>` п. 2 (группы с дубликатами и `extra_open`, `older_with_fresher_draft`, `attempts_shared_by_sessions`). Если `older_with_fresher_draft > 0` — решить до применения: более свежий черновик остаётся в строке закрытой сессии, приложение к нему не вернётся (STOP плана 004, если политика не устраивает).
3. Read-only SQL `<specifics>` п. 3 (`stuck_expired_sessions`) и п. 7 (виды `results` и набор ключей элементов) плюс проверка типов полей элементов из 05-08 (`## Deferred human verification`, `jsonb_typeof` у `isCorrect`, `points`, `earnedPoints`) — результаты нужны 05-05 и 05-08.
4. Подтвердить политику D-06: в паре остаётся самая новая открытая сессия (`started_at DESC, id DESC`), остальные закрываются как `superseded`, данные не удаляются.
5. Порядок: 0022 и 0023 на проде непосредственно перед деплоем web и server фазы 5, в том же тихом окне (D-25). Первый оператор 0022 — `SET LOCAL lock_timeout = '5s'`: при занятой таблице миграция откатывается целиком с ошибкой 55P03 и повторяется позже в окне; деплой без применённых 0022 и 0023 не начинается; миграция фазы 7 (0024) — после них.

Также за пользователем: коммит файлов плана (список выше).

## Threat model

- T-5-05: отбор `started_at DESC, id DESC`, меняются только `closed_at` и `close_reason`, DELETE нет, повтор — 0 строк (DB-тест); read-only подсчёт на проде — Task 4.
- T-5-06: оба частичных уникальных индекса есть, 23505 проверен.
- T-5-07: новых таблиц нет, `enableRLS()` и `deny_direct_access` у обеих таблиц сохранены (generate-no-diff чистый).
- T-5-SC: установок пакетов нет.

## Known Stubs

Нет.

## Self-Check: PASSED

- Файлы плана существуют: 0022/0023 SQL, оба снимка, тест, изменения `schema.ts`, журнала, манифеста, `check-migrations.mjs` (git status).
- Коммиты не создавались (правило пользователя), HEAD `f0ba0ab`.
