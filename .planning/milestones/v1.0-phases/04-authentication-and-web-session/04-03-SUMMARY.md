---
phase: 04-authentication-and-web-session
plan: 03
subsystem: database
tags: [drizzle, migration, postgres, sessions, login-throttle, rls, backfill]
status: complete
deferred_human_gate: true

requires:
  - phase: 01-verification-baseline
    provides: "scripts/check-migrations.mjs (manifest, chain-vs-schema, idempotency, generate-no-diff, drizzle-check), migrations-manifest.json, test-support/test-database.ts, scripts/with-test-db.mjs"
  - phase: 04-authentication-and-web-session
    provides: "04-01: характеризация auth через app.ts (должна остаться зелёной после 0021)"
provides:
  - "schema.ts: authSessions (auth_sessions), loginThrottle (login_throttle), refreshTokens.sessionId (session_id, FK cascade, индекс) и refreshTokens.usedAt (used_at)"
  - "Миграция 0021_auth_sessions: аддитивный DDL + идемпотентный бэкфилл D-09 (сессия на каждый действующий refresh-токен, id сессии = id токена)"
  - "app/server/src/db/session-backfill.test.ts: 0000-0020 из копии каталога, вставка токенов A-E, затем настоящий мигратор применяет только 0021"
  - "scripts/check-migrations.test.mjs: фикстуры считают следующую запись от последней настоящей (idx + 1), generate-no-diff STOP-фикстура удаляет все снимки новее 0015"
affects: [04-06, 04-08, 04-14]

actuals:
  tokens: 24900
  tasks: 3
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "Проверка миграции с данными: копия app/server/drizzle с журналом до idx N-1 и без файлов N, migrate() по копии, вставка данных сырым SQL (schema.ts уже знает новые колонки), затем migrateTestDatabase применяет только новую запись"
    - "Повтор бэкфилла в тесте читается из самого файла миграции (разбиение по --> statement-breakpoint), а не копируется в тест"
    - "Фикстуры self-тестов миграций выводят номер и тег следующей записи из журнала копии"

key-files:
  created:
    - app/server/drizzle/0021_auth_sessions.sql
    - app/server/drizzle/meta/0021_snapshot.json
    - app/server/src/db/session-backfill.test.ts
    - .planning/commit-snapshots/before-04-03/fingerprint.json
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - scripts/check-migrations.test.mjs
    - scripts/check-migrations.mjs

key-decisions:
  - "Решение исполнителя (автономно): auth_sessions.created_at и last_refreshed_at — timestamptz NOT NULL DEFAULT now(); revoked_at и revoke_reason (text) nullable"
  - "Решение исполнителя (автономно): login_throttle.login nullable (корзина «IP по всем логинам» из D-11 логина не имеет), failures integer NOT NULL DEFAULT 0, blocked_until nullable, updated_at timestamptz NOT NULL DEFAULT now()"
  - "Решение исполнителя (автономно): тег фикстур check-migrations.test.mjs строится как <idx последней записи + 1>_<имя> (сейчас 0022_late_entry, 0022_next_entry, 0022_x.sql), а не жёсткое 0022: будущая настоящая 0022 не будет перезаписана фикстурой"
  - "when записи 0021 = 1791095839799 (время генерации drizzle-kit), строго больше 1784985600000 (0020)"

patterns-established:
  - "Новая миграция: drizzle-kit generate без конфигурации (--dialect --schema --out --name, < /dev/null), ручная дописка данных через --> statement-breakpoint, sha256 итогового файла в migrations-manifest.json"

requirements-completed: []

duration: 12min
completed: 2026-10-04
---

# Phase 4 Plan 03: Миграция 0021 (сессии, троттлинг входа, бэкфилл сессий) Summary

**Одна аддитивная миграция 0021_auth_sessions: таблицы auth_sessions и login_throttle с RLS и deny_direct_access, session_id и used_at в refresh_tokens, идемпотентный бэкфилл сессий из действующих refresh-токенов, проверенный настоящим мигратором поверх данных на test_*.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~12 мин
- **Started:** 2026-10-04T06:30Z
- **Completed:** 2026-10-04T06:42Z
- **Tasks:** 3 из 4 выполнены; Task 4 (checkpoint:human-verify, blocking-human) перенесена в Deferred
- **Files modified:** 8 файлов плана + отпечаток

## Accomplishments

- `schema.ts`: `authSessions`, `loginThrottle`, `refreshTokens.sessionId`/`usedAt`, индексы и FK с явными именами, `enableRLS()` и `denyDirectAccessPolicy()` у обеих новых таблиц. `users.failed_login_attempts`, `users.locked_until`, `idx_users_locked_until` не тронуты.
- `drizzle-kit generate` отработал без вопросов (ни одного переименования), в SQL нет DROP/RENAME/ALTER COLUMN TYPE.
- Бэкфилл D-09 дописан в конец 0021, sha256 пересчитан в манифесте.
- DB-тест бэкфилла: сессии ровно у A, B, E; C (отозван) и D (истёк) без сессии; повторный бэкфилл даёт rowCount 0 и не меняет строк; RLS и политика у новых таблиц; хэш последней записи `__drizzle_migrations` равен sha256 0021 из манифеста, `created_at` равен `when`.
- Самотесты `check-migrations` больше не зависят от номера последней настоящей миграции.
- `yarn verify: OK`; характеризация 04-01 (`auth-characterization.test.ts` 27, `auth-known-defects.test.ts` 12) и `timestamps.test.ts` зелёные после 0021.

## Файлы к коммиту

- `app/server/src/db/schema.ts` (в файле есть и незакоммиченные правки фаз 2–3; diff плана — блок `authSessions`, две колонки, индекс и FK в `refreshTokens`, блок `loginThrottle`)
- `app/server/drizzle/0021_auth_sessions.sql`
- `app/server/drizzle/meta/0021_snapshot.json`
- `app/server/drizzle/meta/_journal.json`
- `app/server/drizzle/migrations-manifest.json`
- `app/server/src/db/session-backfill.test.ts`
- `scripts/check-migrations.test.mjs`
- `scripts/check-migrations.mjs`
- служебный: `.planning/commit-snapshots/before-04-03/fingerprint.json`

## codegraph impact refreshTokens (D-22)

```
Impact of changing "refreshTokens" — 6 affected symbols:
constant refreshTokens — app/server/src/db/schema.ts:602
app/server/src/routes/auth/login.ts
app/server/src/routes/auth/index.ts
app/server/src/routes/auth/logout.ts
app/server/src/routes/auth/refresh.ts
app/server/src/routes/index.ts
```

Дополнительно по `rg refreshTokens|refresh_tokens` (тесты, которых нет в выводе impact): `app/server/src/routes/auth/auth-known-defects.test.ts`, `app/server/src/db/timestamps.test.ts`. Новые колонки nullable, вызывающие код не меняется; все перечисленные тесты зелёные в `yarn verify`.

## Сгенерированный DDL 0021 (операторы по порядку)

1. `CREATE TABLE "auth_sessions"` (`id` uuid PK default gen_random_uuid(), `user_id` uuid NOT NULL, `created_at` timestamptz NOT NULL default now(), `last_refreshed_at` timestamptz NOT NULL default now(), `revoked_at` timestamptz, `revoke_reason` text)
2. `ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY`
3. `CREATE TABLE "login_throttle"` (`bucket_key` text PK, `login` text, `failures` integer NOT NULL default 0, `blocked_until` timestamptz, `updated_at` timestamptz NOT NULL default now())
4. `ALTER TABLE "login_throttle" ENABLE ROW LEVEL SECURITY`
5. `ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" uuid`
6. `ALTER TABLE "refresh_tokens" ADD COLUMN "used_at" timestamp with time zone`
7. `ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade`
8. `CREATE INDEX "idx_auth_sessions_user_id" ON "auth_sessions" ("user_id")`
9. `CREATE INDEX "idx_login_throttle_login" ON "login_throttle" ("login")`
10. `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade`
11. `CREATE INDEX "idx_refresh_tokens_session_id" ON "refresh_tokens" ("session_id")`
12. `CREATE POLICY "deny_direct_access" ON "auth_sessions" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false)`
13. `CREATE POLICY "deny_direct_access" ON "login_throttle" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false)`

Бэкфилл (дописан вручную):

14. `INSERT INTO "auth_sessions" ("id", "user_id", "created_at", "last_refreshed_at") SELECT "id", "user_id", "created_at", "created_at" FROM "refresh_tokens" WHERE "revoked_at" IS NULL AND "expires_at" > now() AND "session_id" IS NULL ON CONFLICT ("id") DO NOTHING`
15. `UPDATE "refresh_tokens" SET "session_id" = "id" WHERE "revoked_at" IS NULL AND "expires_at" > now() AND "session_id" IS NULL AND EXISTS (SELECT 1 FROM "auth_sessions" s WHERE s."id" = "refresh_tokens"."id")`

Журнал/манифест: `idx 21`, `tag 0021_auth_sessions`, `when 1791095839799`, `breakpoints true`, `sha256 df9b6078490ce592c2632dc9eda949e8ba59aa3692e893cf0b23509521399314`.

## Migration gate

`yarn verify` (последняя строка `yarn verify: OK`, exit 0), шаг `migrations`:

```
ok - manifest
DRZ-01: chain == schema.ts
ok - chain-vs-schema
ok - idempotency
ok - generate-no-diff
[check-migrations] generate-no-diff: No schema changes, nothing to migrate
ok - drizzle-check
[check-migrations] drizzle-check: Everything's fine
check-migrations: OK
```

Серверные тесты в `yarn verify`: `Test Files 13 passed (13)`, `Tests 279 passed | 6 expected fail (285)` (6 expected fail — KNOWN_DEFECTS 04-01). `script-tests`: `pass 134`, `fail 0`.

Повторный DB-тест бэкфилла (`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/session-backfill.test.ts`):

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

Сверка с отпечатком `.planning/commit-snapshots/before-04-03/fingerprint.json`: `04-03 changed only its files` (exit 0).

Прочие проверки плана: `0021 manifest ok`, `0000-0020 unchanged`, `node --test scripts/check-migrations.test.mjs` — `tests 14, pass 14, fail 0`; литерала `idx: 21` и `rm(path.join(d, 'meta/0020_snapshot.json'))` в тесте нет.

`codegraph affected app/server/src/db/schema.ts` (24 файла): `app/server/src/db/answer-keys-jsonb.test.ts`, `app/server/src/db/timestamps.test.ts`, `app/server/src/lib/tests/question-type-resolver.ts`, `app/server/src/routes/tests/{assignments,index,public}.ts`, страницы `app/web/app/(internal)/(protected)/admin/tests/**`, `app/web/components/tests/{MdxRenderer,TestRunner}.tsx`, `app/web/lib/auth/getServerMe.test.ts`, `app/web/lib/tests/api.ts`, `e2e/fixtures/exam.ts`, `e2e/tests/{auth,authoring,review}.spec.ts`. Все unit/DB-тесты из списка прошли в `yarn verify`; e2e не запускался (не часть плана и `yarn verify`), схема для существующего кода аддитивна.

## Task Commits

Коммиты не выполнялись (правило пользователя), изменения в рабочем дереве.

1. Task 1 (tracer): schema.ts, генерация 0021, бэкфилл, манифест, DB-тест — tracer-гейт: `<verify>` повторён end-to-end перед Task 2 (DB-тест 4/4, `0021 manifest ok`).
2. Task 2: фикстуры `check-migrations.test.mjs`, шапка `check-migrations.mjs`. До правки после Task 1 падали ровно три предсказанных теста (late_entry, next_entry, generate-no-diff без 0020), после — 14/14.
3. Task 3: гейт миграции (выше).
4. Task 4: не выполнялась (Deferred).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Переход строки в конце `_journal.json`**
- **Found during:** Task 1
- **Issue:** drizzle-kit переписал `_journal.json` без завершающего `\n` (лишний шум в diff).
- **Fix:** завершающий перевод строки возвращён; JSON и запись idx 21 не менялись, `check-migrations` и `drizzle-kit check` зелёные.
- **Files modified:** `app/server/drizzle/meta/_journal.json`

**2. [Rule 1 - Bug] Первая правка `check-migrations.test.mjs` испортила файл**
- **Found during:** Task 2
- **Issue:** скрипт правки использовал `String.replace` со строкой замены, где `` $` `` подставил текст до совпадения; файл задвоился.
- **Fix:** файл, не изменённый до плана (его нет в отпечатке), восстановлен из HEAD через `git show HEAD:scripts/check-migrations.test.mjs > scripts/check-migrations.test.mjs`, правка повторена функциональной заменой. Итоговый diff проверен вручную.
- **Files modified:** `scripts/check-migrations.test.mjs`

**3. Отклонение в формулировке плана (не меняет поведение)**
- План описывал формат манифеста как «табы»; файл использует отступ в 2 пробела, запись idx 21 добавлена в формате файла.
- Тег фикстур сделан выводимым (`<idx+1>_<имя>`), а не жёстким `0022_*`; ожидание текста «not greater than the previous entry <тег последней записи>» строится из копии журнала, как требует план.
- Существующий JSDoc у `appendMigration` уточнён («следующую миграцию», «when последней записи»), чтобы не утверждать про 0021; новых комментариев не добавлено.

**4. Проверка корня**
- Запуск `root-pin.sh` отклонён правами; заменён проверкой `git -C … rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня (предусмотрено правилами исполнения).

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: T-4-06 (только аддитивный DDL, бэкфилл идемпотентен и проверен повтором), T-4-07 (RLS и `deny_direct_access` проверены в DB-тесте), T-4-08 (C и D без сессии) закрыты; установок пакетов нет (T-4-SC).

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял. Task 4 (`checkpoint:human-verify`, `gate="blocking-human"`).

1. Read-only на проде: `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3;` Ожидание: верхняя строка с `created_at = 1784985600000` (0020). Иначе — стоп и решение по истории до применения 0021.
2. Read-only на проде: `SELECT count(*) AS active_refresh, count(DISTINCT user_id) AS users FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > now();` — столько сессий создаст бэкфилл.
3. Подтвердить D-09: перенос действующих сессий без повторного входа (альтернатива — отозвать всё, все пользователи входят заново).
4. Выяснить, на какую базу смотрит `DATABASE_URL` server-проекта Vercel в среде Preview. Если это прод, preview-деплой ветки фазы 4 без 0021 упадёт на первом входе (таблиц `auth_sessions` и `login_throttle` нет): 0021 применяется на проде до push ветки, а проверки 429 и «Завершить все сеансы» на preview делаются только тестовыми учётками (порядок — 04-14 Task 4).

Применение 0021 на проде — шаг выкатки D-24 (runbook 04-14 Task 4), до merge в master; миграция аддитивна, текущий код с ней работает. Коммит файлов плана делает пользователь.

## Next Phase Readiness

- Гейт миграции зелёный: 04-06 (sid, атомарный refresh, отзыв) и 04-08 (троттлинг в PostgreSQL) могут опираться на `authSessions`, `loginThrottle`, `refreshTokens.sessionId`/`usedAt`.
- Код приложения поведение не менял: новые колонки и таблицы пока никто не читает и не пишет.

## Self-Check: PASSED

- FOUND: app/server/drizzle/0021_auth_sessions.sql
- FOUND: app/server/drizzle/meta/0021_snapshot.json
- FOUND: app/server/src/db/session-backfill.test.ts
- FOUND: .planning/commit-snapshots/before-04-03/fingerprint.json
- Изменены: schema.ts, _journal.json, migrations-manifest.json, check-migrations.test.mjs, check-migrations.mjs (сверка с отпечатком `04-03 changed only its files`)
- Коммитов нет по правилу пользователя: `commits: 0`, HEAD до и после `7a6f95a`
