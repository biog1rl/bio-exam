---
phase: 10-notification-journal-and-bell
plan: 01
subsystem: database
tags: [postgres, drizzle, notifications, migration, rls]
status: complete

requires:
  - phase: 09-result-foundation-and-readers
    provides: миграция 0026 и цепочка миграций до неё
provides:
  - таблицы notification_events и notification_deliveries (миграция 0027_notification_journal)
  - модуль services/notifications: recordNotification, recordNotifications, список каналов доставки с inbox
  - серверные тесты записи и случай удаления пользователя для журнала
affects: [10-02, 10-03, 10-04, 10-09, чаты v4.0, push v5.0]

actuals:
  tokens: 6000
  tasks: 3
  commits: 0
plan_head_before: 9bfc67abf2d4bd9df2a189ca4fa4c879ccd846dc
plan_head_after: 9bfc67abf2d4bd9df2a189ca4fa4c879ccd846dc

tech-stack:
  added: []
  patterns:
    - запись события только через NotificationTx (параметр колбэка db.transaction)
    - каналы доставки списком DELIVERY_CHANNELS, производитель каналов не знает

key-files:
  created:
    - app/server/drizzle/0027_notification_journal.sql
    - app/server/drizzle/meta/0027_snapshot.json
    - app/server/src/services/notifications/index.ts
    - app/server/src/services/notifications/record.ts
    - app/server/src/services/notifications/channels.ts
    - app/server/src/services/notifications/notifications.test.ts
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - app/server/src/db/user-deletion-rule.test.ts
    - scripts/check-migrations.mjs

key-decisions:
  - "Повтор причины обновляет params и actor_id строки события (решение плана сверх D-03, который называет только ref_seq, last_event_at, read_at): строка показывает название и автора последнего назначения; kind, subject_*, collapse_key не меняются"
  - "Дедупликация пакета по паре (recipientId, dedupeKey), последний вход побеждает; сортировка по recipientId, затем dedupeKey сравнением строк без учёта локали"
  - "status доставки по умолчанию 'pending', inbox пишет 'sent' явно"
  - "NotificationParams объявлен в record.ts, schema.ts импортирует его как import type (цикла во время выполнения нет)"

duration: 25min
completed: 2026-10-06
---

# Phase 10 Plan 01: журнал уведомлений и путь записи Summary

Журнал уведомлений одной аддитивной миграцией 0027 (события и доставки с RLS), модуль `services/notifications` с записью только внутри транзакции причины и каналом `inbox`, серверные тесты записи, отката, повтора, пакета и неизвестного вида.

## Что сделано

- Task 1 (tracer): `schema.ts` (+`notificationEvents`, `notificationDeliveries` после `loginThrottle`), миграция 0027 сгенерирована `drizzle-kit generate`, первой строкой добавлен `SET LOCAL lock_timeout = '5s'`, запись манифеста, `record.ts`, `channels.ts`, `index.ts`, первый тест.
- Task 2: тесты отката, повтора причины (`ref_seq` 2, `read_at` сброшен, `params` и `actor_id` новой причины, одна доставка с выросшим `sent_at`), пакета с дубликатом и вторым получателем, пустого пакета, неизвестного вида `chat.message` (`collapse_key`, `attempts = 0`, `next_attempt_at`, `lease_until`, `last_error` пусты). Правок `record.ts` и `channels.ts` не потребовалось.
- Task 3: поведенческий случай в `user-deletion-rule.test.ts` (удаление автора обнуляет `actor_id`, события остаются; удаление получателя удаляет событие и доставку, чужое событие остаётся). `LEGACY_EXCEPTIONS` не менялся.

## Итоговый SQL миграции 0027 (по порядку)

1. `SET LOCAL lock_timeout = '5s'`
2. `CREATE TABLE notification_deliveries`; `ENABLE ROW LEVEL SECURITY`
3. `CREATE TABLE notification_events`; `ENABLE ROW LEVEL SECURITY`
4. FK `notification_deliveries.event_id` -> `notification_events` (cascade); `notification_events.recipient_id` -> `users` (cascade); `notification_events.actor_id` -> `users` (set null)
5. `UNIQUE INDEX notification_deliveries_event_channel_uniq (event_id, channel)`
6. `UNIQUE INDEX notification_events_recipient_dedupe_uniq (recipient_id, dedupe_key)`
7. `INDEX notification_events_recipient_feed_idx (recipient_id, last_event_at DESC NULLS FIRST, id DESC NULLS FIRST)`
8. `INDEX notification_events_recipient_unread_idx (recipient_id) WHERE read_at IS NULL`
9. `CREATE POLICY deny_direct_access` для обеих таблиц

Манифест: idx 27, tag `0027_notification_journal`, sha256 `86dd934e63a955cc83d27968b2e19a9f08dadbf594372abc99d2e7aeedf252f5`, when `1791264404526` (из журнала, больше 1791239364196, коррекция часов не потребовалась).

## Проверки

- `node scripts/check-migrations.mjs`: `check-migrations: OK` (manifest, chain-vs-schema, idempotency, generate-no-diff, drizzle-check).
- `notifications.test.ts`: 6 passed; `user-deletion-rule.test.ts`: 9 passed (вместе 15).
- Полный серверный набор под `with-test-db`: 93 файла, 1844 тестов, все зелёные. До плана было 92 файла и 1837 тестов (расчёт: +1 файл, +7 тестов).
- `yarn verify`: `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests).
- `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-01`: `10-01 changed only its files`.
- Модульный `db` в `services/notifications` не импортируется (grep пуст), `DATABASE_URL` не использовался.

## CodeGraph

`codegraph impact` по существующим символам не требовался: существующие символы `schema.ts` не менялись, добавлены две новые таблицы перед блоком `relations`. `codegraph affected` по `schema.ts` и `record.ts` вернул только e2e-спеки (затрагиваются любой схемой), серверные тесты прогнаны целиком.

## Deviations from Plan

None - plan executed exactly as written. Замечания: `NotificationParams` импортируется в `schema.ts` как `import type` из `record.ts` (вариант без цикла времени выполнения); `actuals.commits: 0` и `plan_head_after = plan_head_before`, потому что по правилу пользователя исполнитель не коммитит, изменения лежат в рабочем дереве (ведущая сессия коммитит один раз на план).

## Known Stubs

Нет.

## Threat Flags

Нет: новые таблицы закрыты RLS-политикой `deny_direct_access`, поверхности сети нет.

## Шаги пользователя

Выкатка миграции 0027 на прод (вне репозитория, после всей фазы, план 10-08; профиль `bio-exam`, навык `server-deploy`):

1. До выкатки определить, на какой миграции стоит прод: `SELECT created_at, hash FROM public.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1;`.
2. Прод уже на 0026 (`created_at = 1791239364196` или `hash = 79a09926d095a95c2a17b26aaffe09c02ba1d23816e1786028a82d666ac65b7e`): выкатка несёт только 0027, она лишь добавляет таблицы, откат одного образа после 0027 допустим. Автовыкатка пропускает коммиты с миграциями: `deploy.sh` запускается вручную вне окна сдач.
3. Прод не на 0026 (фаза 9 не выкачена, фазы 9 и 10 одной выкаткой): откат одного образа недопустим; действуют правила выкатки 0026 из профиля сервера: фазы 9 и 10 в master одним пакетом, `deploy.sh` вручную вне окна сдач, репетиция на свежем дампе под ролью `bio_exam`, при `DEPLOY_FAILED` восстановить `predeploy-*.dump` или выкатить исправление вперёд.
4. Новый образ без 0027 не выкатывается: маршруты назначения теста падают на отсутствующей таблице, `GET /api/notifications/unread-count` отвечает 500 у каждого вошедшего.
5. После выкатки: `SELECT count(*) FROM notification_events; SELECT relrowsecurity FROM pg_class WHERE relname IN ('notification_events','notification_deliveries');` — таблицы есть, `relrowsecurity = true`; последняя строка `public.__drizzle_migrations` — запись 0027 (`created_at = 1791264404526`).

## Self-Check: PASSED

Файлы миграции, снимка, модуля уведомлений и тестов существуют; check-migrations, серверный набор, `yarn verify` и сверка файлов плана зелёные.
