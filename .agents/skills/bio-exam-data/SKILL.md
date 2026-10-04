---
name: bio-exam-data
description: Факты данных bio-exam (Drizzle, PostgreSQL 17, app/server/drizzle). Применять перед правкой схемы или миграций, перед любой командой, тестом или скриптом, которые касаются базы, и перед служебными командами хранилища storage:reconcile и assets:refs.
---

# bio-exam data

## Схема и миграции

- Схема: `app/server/src/db/schema.ts` (Drizzle, `drizzle-orm/pg-core`); клиент базы: `app/server/src/db/index.ts`.
- Миграции лежат в `app/server/drizzle` файлами `NNNN_имя.sql` с журналом `app/server/drizzle/meta/_journal.json` и снимками; последняя - `app/server/drizzle/0024_question_asset_refs.sql`.
- Применённая миграция не редактируется: изменение схемы идёт новым файлом из `yarn workspace @bio-exam/server drizzle:generate` после правки `schema.ts`.
- `app/server/drizzle/migrations-manifest.json` фиксирует каждую миграцию: `idx`, `tag`, `file`, `sha256`, `when`, `breakpoints` (`checksumAlgorithm: sha256`). Новая миграция получает в нём новую запись, совпадающую с журналом и файлом.
- `scripts/check-migrations.mjs` (шаг `migrations` в `yarn verify`) на временных базах сверяет манифест с журналом и файлами, цепочку с пустой базы против `schema.ts`, повторный прогон без изменений, отсутствие разницы у `drizzle-kit generate` и `drizzle-kit check`.
- Тест миграции с данными: образец `app/server/src/db/asset-refs-migration.test.ts` (временная база, миграции до нужной, данные, следующая миграция).

## База для тестов и скриптов

- Любая работа с базой идёт только против одноразовой локальной базы `test_*`: `TEST_DATABASE_URL` и `BIO_EXAM_ISOLATED_ENV=1`. `DATABASE_URL` из `.env` для тестов, миграций и опытов не используется.
- Охрана: `app/server/src/config/test-database-url.ts` (`isIsolatedEnv`, `assertTestDatabaseUrl`) принимает только хосты `localhost` и `127.0.0.1`, имя `^test_[a-z0-9_]+$`, без строки запроса и фрагмента. В изолированном режиме `app/server/src/db/index.ts` и `app/server/src/scripts/apply-migration.ts` не читают `.env`.
- `node scripts/with-test-db.mjs <command>` поднимает свежую базу `test_*`, передаёт команде `TEST_DATABASE_URL` и `BIO_EXAM_ISOLATED_ENV=1` без `DATABASE_URL`, `SUPABASE_*` и `PG*` и удаляет базу после выхода. `yarn verify` поднимает свою базу сам.
- Тест с базой берёт помощники `app/server/src/test-support/test-database.ts`: своя временная база на файл, миграции тем же мигратором.

```bash
node scripts/with-test-db.mjs yarn workspace @bio-exam/server test
node scripts/with-test-db.mjs yarn workspace @bio-exam/server drizzle:migrate
yarn verify
```

## Служебные команды сервера

- `yarn workspace @bio-exam/server assets:refs` печатает инвентаризацию ссылок на картинки; с `--write` заполняет таблицу `question_asset_refs` для вопросов с `assets_indexed = false` и ставит маркер.
- `yarn workspace @bio-exam/server storage:reconcile` печатает отчёт о сиротах и указателях хранилища; удаление только с `--delete-orphans` или `--delete-legacy-json`.
- Обе команды берут окружение из `.env` сервера (образец ключей: `app/server/.env.example`). Запуск против боевой базы или бакета - отдельная осознанная операция пользователя, сначала без флагов. Подробности: `app/server/README.md`.
