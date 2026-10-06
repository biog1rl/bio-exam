---
name: bio-exam-data
description: Факты данных bio-exam (Drizzle, PostgreSQL 17, app/server/drizzle). Применять перед правкой схемы или миграций, таблиц зоны учителя и строк ролей, перед любой командой, тестом или скриптом, которые касаются базы, и перед служебными командами хранилища storage:reconcile и assets:refs.
---

# bio-exam data

## Схема и миграции

- Схема: `app/server/src/db/schema.ts` (Drizzle, `drizzle-orm/pg-core`); клиент базы: `app/server/src/db/index.ts`.
- Миграции лежат в `app/server/drizzle` файлами `NNNN_имя.sql` с журналом `app/server/drizzle/meta/_journal.json` и снимками; последняя - `app/server/drizzle/0029_drop_app_settings.sql`.
- Применённая миграция не редактируется: изменение схемы идёт новым файлом из `yarn workspace @bio-exam/server drizzle:generate` после правки `schema.ts`.
- `app/server/drizzle/migrations-manifest.json` фиксирует каждую миграцию: `idx`, `tag`, `file`, `sha256`, `when`, `breakpoints` (`checksumAlgorithm: sha256`). Новая миграция получает в нём новую запись, совпадающую с журналом и файлом.
- `scripts/check-migrations.mjs` (шаг `migrations` в `yarn verify`) на временных базах сверяет манифест с журналом и файлами, цепочку с пустой базы против `schema.ts`, повторный прогон без изменений, отсутствие разницы у `drizzle-kit generate` и `drizzle-kit check`.
- Тест миграции с данными: образец `app/server/src/db/asset-refs-migration.test.ts` (временная база, миграции до нужной, данные, следующая миграция).
- Строка новой роли в таблице `roles` вставляется миграцией (`INSERT ... ON CONFLICT DO NOTHING` отдельным оператором после `--> statement-breakpoint`, образец `app/server/drizzle/0025_teacher_zones.sql`), а не только сидом `app/server/src/db/seed.ts`: на неё ссылается FK `user_roles.role_key`.

## Таблицы зоны учителя

- `teacher_topics` (`teacher_id`, `topic_id`, `assigned_at`, `assigned_by`): закрепление раздела за учителем, первичный ключ (`teacher_id`, `topic_id`), FK на `users` и `topics` с `ON DELETE cascade`, `assigned_by` с `ON DELETE set null`, RLS с политикой `deny_direct_access`.
- `student_groups.owner_id`: владелец группы, FK на `users` с `ON DELETE set null`, индекс `idx_student_groups_owner_id`. `NULL` - группа без владельца.
- Обе создаёт миграция `0025_teacher_zones`; тест миграции: `app/server/src/db/teacher-zone-migration.test.ts`.
- Читают и пишут таблицы зоны только `app/server/src/services/access-policy/zone-loader.ts` и `app/server/src/services/access-policy/zone-store.ts`; кроме них имена таблиц допустимы в `app/server/src/db/schema.ts` и `app/server/src/test-support`. Это держит `scripts/teacher-zone-guards.test.mjs`.

## Результат попытки

- Факты сдачи `answers`, `results`, `results_version`, `earned_points`, `total_points`, `score_percentage`, `passed` после вставки строки `test_attempts` не меняются: это держит триггер `test_attempts_facts_immutable` (ошибка `23001`).
- Проекция результата: `review_status` (`none`, `pending`, `graded`), `final_earned_points`, `final_score_percentage`, `final_passed`, `graded_at`, `passing_score`, `auto_total_points`, `submit_source`. Согласованность держат CHECK `test_attempts_review_status_check`, `test_attempts_submit_source_check`, `test_attempts_review_projection_check` (итог `NULL` ровно при `pending`) и `test_attempts_graded_at_check`. Миграция `0026_attempt_result_projection` создаёт их и заполняет проекцию существующих попыток; тест миграции: `app/server/src/db/attempt-result-migration.test.ts`.
- Баллы и проценты хранятся как `real` (float4): значение, прочитанное из базы, с пересчётом сравнивается через `Math.fround`.
- Прямая вставка попытки в тесте идёт только через `insertAttemptFixture` (`app/server/src/test-support/attempt-fixture.ts`): режим `outcomeFacts` считает факты и проекцию тем же `computeAttemptOutcome`, режим с готовыми фактами пишет их как есть.

## Журнал уведомлений

- `notification_events`: событие получателя. `recipient_id` - `ON DELETE cascade`, `actor_id` - `ON DELETE set null` (ADR-0007), `kind` - текст без CHECK, `subject_type` и `subject_id` без внешнего ключа (объект может исчезнуть раньше события), `dedupe_key`, `collapse_key`, `params` (jsonb), `ref_seq`, `last_event_at`, `read_at`, `expires_at` (пока никто не пишет). Уникальность `(recipient_id, dedupe_key)`; индексы ленты `(recipient_id, last_event_at DESC, id DESC)` и непрочитанных (`recipient_id` где `read_at IS NULL`). RLS с политикой `deny_direct_access`.
- `notification_deliveries`: доставка события по каналу. `event_id` - `ON DELETE cascade`, `UNIQUE (event_id, channel)`, `status`, `attempts`, `next_attempt_at`, `lease_until`, `last_error`, `sent_at`. RLS с политикой `deny_direct_access`.
- Обе таблицы создаёт миграция `0027_notification_journal`. Пишет их только `app/server/src/services/notifications`; сиды и `app/server/src/test-support`, которые пишут `test_assignments` напрямую, событий не создают.

## Удаление пользователя

- Данные ученика (попытки, ответы, фото, проверки его ответов, уведомления) уходят вместе с ним: `ON DELETE cascade`; файлы хранилища сервис удаляет до строк.
- Авторство для других (проверяющий, автор теста, назначивший, приглашавший, включая `users.created_by`) - `ON DELETE SET NULL`, столбец допускает NULL; сохранить историю можно только отключением пользователя.
- Правило и причины: `docs/adr/0007-user-deletion-rule.md`. Тест-каталог `app/server/src/db/user-deletion-rule.test.ts` сам находит внешние ключи на `users` по `pg_constraint`; новая миграция держит его зелёным, исключения только в `LEGACY_EXCEPTIONS`.

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
