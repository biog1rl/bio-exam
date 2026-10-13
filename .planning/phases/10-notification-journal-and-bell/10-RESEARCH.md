# Phase 10: Notification journal and bell - Research

**Researched:** 2026-10-06
**Domain:** общий журнал уведомлений (две таблицы, производитель в транзакции причины, чтение по курсору, повторная проверка доступа при открытии), колокольчик и заголовок вкладки в web
**Confidence:** HIGH по коду (все точки интеграции прочитаны на ветке `dev`, коммит `9bfc67a`, миграция 0026 последняя); HIGH по SQL-поведению (проверено живыми пробами на одноразовой базе); MEDIUM по поведению `<title>` в Next 16 (проверяется только в e2e)
**Источники:** репозиторий и пробы через `node scripts/with-test-db.mjs`. Внешних пакетов фаза не ставит, поэтому seam `research-plan` и провайдеры документации не запускались: искать нечего.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Модель журнала (NOTIF-01, NOTIF-06)**
- **D-01 [авто]:** Две таблицы в одной миграции 0027: `notification_events` и `notification_deliveries`. Имена маршрутов и таблиц стабильны для v4.0/v5.0.
- **D-02 [авто]:** `notification_events`: `id uuid`, `recipient_id` (FK `users`, `ON DELETE CASCADE` — уведомления принадлежат получателю, ADR-0007), `actor_id` (FK `users`, `ON DELETE SET NULL`, nullable — кто вызвал событие, авторство), `kind text` без CHECK и без enum (неизвестные виды допустимы), `subject_type text`, `subject_id uuid`, `dedupe_key text NOT NULL`, `collapse_key text` nullable, `params jsonb NOT NULL DEFAULT '{}'` (только несекретные поля для текста, например название теста на момент события), `ref_seq integer NOT NULL DEFAULT 1`, `created_at`, `last_event_at`, `read_at` nullable, `expires_at` nullable. Ссылка не хранится: путь вычисляет обработчик вида при открытии.
- **D-03 [авто]:** `UNIQUE (recipient_id, dedupe_key)`; индексы `(recipient_id, last_event_at desc, id desc)` и частичный `(recipient_id) WHERE read_at IS NULL`. Повторная причина по тому же объекту не создаёт вторую строку: `ON CONFLICT (recipient_id, dedupe_key) DO UPDATE` поднимает `ref_seq`, ставит `last_event_at = now()` и `read_at = NULL` (событие снова непрочитанное). Повтор того же запроса до производителя не доходит (см. D-06).
- **D-04 [авто]:** `notification_deliveries`: `id`, `event_id` (FK, `ON DELETE CASCADE`), `channel text`, `status text`, `attempts integer DEFAULT 0`, `next_attempt_at`, `lease_until`, `last_error`, `sent_at`, `created_at`, `UNIQUE (event_id, channel)`. В v3.0 пишется только строка `inbox` со `status = 'sent'`; при повторной причине её `sent_at` обновляется.
- **D-05 [авто]:** Каналы задаются в коде списком планировщиков доставки (в v3.0 один `inbox`); производитель о каналах не знает. Таблица видов в коде (`kinds.ts`): вид → текст строки списка, обработчик ссылки. Неизвестный вид выводится текстом «Новое уведомление» и при открытии даёт «нет доступа». Часовой пояс пользователя и часы тишины — не в этой фазе.

**Производитель и транзакция**
- **D-06 [авто]:** `recordNotification(tx, { recipientId, actorId, kind, subject, dedupeKey, collapseKey?, params })` и пакетный вариант вызываются только внутри `db.transaction` причины; модуль `services/notifications` (ADR-0005, глубокий модуль). Вне транзакции функция не вызывается (тип принимает только `tx`).
- **D-07 [авто]:** Производитель `test.assigned`: все три пути записи `test_assignments` (`POST /api/tests/:testId/assignments`, `POST /api/tests/:testId/assignments/group/:groupId`, `POST /api/users/:userId/test-assignments`) переводятся в транзакцию «вставка с `onConflictDoNothing().returning()` → событие только для реально вставленных строк». Повтор запроса или уже существующее назначение события не дают; назначение после снятия даёт ту же строку с `ref_seq + 1` (D-03). `dedupe_key = test.assigned:<testId>`, `subject = (test, testId)`, `params = { testTitle }`.
- **D-08 [авто]:** Если назначающий и получатель один человек, событие не пишется. Отключённым ученикам событие пишется (увидят после включения).
- **D-09 [авто]:** Снятие назначения событие не удаляет и не меняет; доступ проверяет открытие ссылки (D-12). «Ученик вышел из группы» доступ не снимает, пока назначение есть: доступ к тесту определяет строка `test_assignments`, как сейчас.

**Чтение и глубокая ссылка (NOTIF-02)**
- **D-10 [авто]:** Маршруты под `sessionRequired()`, только свои события: `GET /api/notifications?cursor=&limit=` (курсор по `(last_event_at, id)` по убыванию, по умолчанию 20), `GET /api/notifications/unread-count` — единственный источник числа для колокольчика и вкладки, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, `GET /api/notifications/:id/open`. Чужой или несуществующий id даёт 404 без различия.
- **D-11 [авто]:** Сервер отдаёт точное число непрочитанных; ограничение «9+» только в интерфейсе.
- **D-12 [авто]:** `open` отмечает событие прочитанным и заново проверяет доступ обработчиком вида. Для `test.assigned` — та же проверка, что у страницы теста (`checkAttemptAccess`: тест опубликован, тема активна, назначение есть или есть право чтения тестов); при успехе `{ href: '/tests/<topicSlug>/<testSlug>' }`, иначе `403 { error: 'NO_ACCESS' }` без названия, slug и причины. 404 и 403 доступа сводятся к одному ответу `NO_ACCESS`.
- **D-13 [авто]:** Ссылка в интерфейсе ведёт на страницу `/notifications/<id>`: она вызывает `open` и делает `router.replace(href)`, а при `NO_ACCESS` показывает «Нет доступа к материалу. Возможно, назначение снято.» без данных объекта. Список в колокольчике показывает текст из `params` (название теста на момент события).

**Колокольчик, вкладка и обновление (NOTIF-02, NOTIF-05)**
- **D-14 [авто]:** Колокольчик в шапке `AppLayout` справа рядом с кнопкой поиска, у всех вошедших (у учителя и администратора список пока пуст). Значок с числом, «9+» больше девяти, без значка при нуле; доступное имя «Уведомления, N непрочитанных».
- **D-15 [авто]:** По нажатию — `Popover` со списком последних 20 событий, «Показать ещё» по курсору, кнопка «Прочитать все» в шапке списка (неактивна при нуле), пустое состояние «Уведомлений пока нет». Строка: точка непрочитанного, текст, относительное время. На 375 px поповер шириной экрана минус поля.
- **D-16 [авто]:** Заголовок вкладки получает префикс `(N) ` при N > 0 с тем же ограничением `(9+)`; без непрочитанных заголовок прежний.
- **D-17 [авто]:** Число обновляется SWR-ключом `unread-count`: после входа (ключ зависит от пользователя), при фокусе вкладки и раз в 60 с, без опроса в скрытой вкладке; после «прочитать», «прочитать все» и открытия ссылки — `mutate` числа и списка. Список загружается при открытии поповера.

### Claude's Discretion
- Точный набор столбцов статуса доставки и их значения по умолчанию, имена индексов и миграции 0027 в пределах D-02…D-04.
- Формат относительного времени («5 мин назад», «вчера») и пиктограмма колокольчика из `lucide-react`.
- Место типов и схем ответа (в `exam-core` не нужны: это не логика экзамена; схемы zod в сервере и разбор в web по образцу `lib/tests/admin-api.ts`).

### Deferred Ideas (OUT OF SCOPE)
- События проверки и исправлений ученику, «ждут проверки» и «исправленный ответ» учителю — фаза 15.
- Очистка старых событий по `expires_at` — с модулем фоновых задач (фаза 11) или в техдолге (фаза 18).
- Часовой пояс и часы тишины, push и другие каналы — v4.0/v5.0.
- Страница «все уведомления» отдельным маршрутом — при росте числа видов.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | Общий журнал событий по получателю (вид, объект, глубокая ссылка, отметка прочтения, доставка по каналу); событие пишется в той же транзакции, что и причина; повтор не дублирует | Схема 0027 (раздел «Схема»), `recordNotifications(tx)` с `ON CONFLICT DO UPDATE` (проба SQL), обёртка трёх путей назначения в `db.transaction` с `.returning()`, тест отката и повтора |
| NOTIF-02 | Колокольчик с числом («9+»), список, прочитано при открытии, «прочитать все»; глубокая ссылка заново проверяет доступ | Маршруты `routes/notifications.ts`, курсор с микросекундами, `openNotification` через `checkAttemptAccess`, web `NotificationBell`/страница `/notifications/[id]`, e2e |
| NOTIF-05 | Заголовок вкладки показывает число непрочитанных | `UnreadTitlePrefix` + чистые функции `titlePrefix`/`withTitlePrefix`, e2e после навигации |
| NOTIF-06 | Журнал принимает позднейшие каналы и виды без изменения схемы: неизвестные виды допустимы, у доставки поля повтора и аренды, у события ключ схлопывания | Столбцы `kind text` без CHECK, `collapse_key`, `next_attempt_at`/`lease_until`/`attempts`/`last_error`, серверный тест неизвестного вида |
</phase_requirements>

## Summary

Фаза добавляет два независимых слоя. Серверный: миграция 0027 (две таблицы с RLS-политикой `deny_direct_access`), глубокий модуль `app/server/src/services/notifications` (запись только через `tx`, чтение по курсору, счётчик, отметки прочтения, обработчик вида `test.assigned`), роутер `/api/notifications` и перевод трёх путей вставки `test_assignments` в транзакции с событием. Клиентский: колокольчик с поповером в шапке `AppLayout`, префикс числа в заголовке вкладки и страница-посредник `/notifications/[id]`. Новых пакетов нет, новых компонентов `components/ui` нет (UI-SPEC утверждён).

Три вещи, которые не видны из CONTEXT и которые планировщик должен учесть сразу. Первое: курсор по `(last_event_at, id)` ломается, если строить его из `Date` (миллисекунды): `timestamptz` хранит микросекунды, и проба показала пропуск строки. Курсор нужно строить из текста, который отдаёт сама база. Второе: пакетная вставка с повторяющимися `(recipient_id, dedupe_key)` внутри одной команды `INSERT ... ON CONFLICT DO UPDATE` падает ошибкой, а не сливается; в групповом назначении дубликатов нет только благодаря первичному ключу `user_groups (group_id, user_id)`, и это нужно держать защитой в самой функции. Третье: `validateUUID` отвечает 400 на неверный id, а UI-SPEC обещает экран «Нет доступа» для любого id, поэтому на `/api/notifications/:id/*` его использовать нельзя.

Критерий успеха 3 в ROADMAP говорит «student left the group», а D-09 прямо говорит, что выход из группы доступ не снимает (подтверждено кодом: удаляет назначения только `removeAssignment`). Это расхождение вынесено в «Open Questions» с рекомендацией; тест должен фиксировать фактическое поведение, а не формулировку критерия.

**Primary recommendation:** Один модуль `services/notifications` с единственным входом `index.ts`; все пять запросов чтения строятся от общей функции условия «событие принадлежит пользователю»; три маршрута назначения вызывают один общий `addAssignments` (по образцу уже экспортируемого `removeAssignment`), внутри которого `db.transaction` → вставка с `.returning()` → `recordTestAssigned(tx, …)`; курсор отдаёт база текстом; web использует ключи SWR вида `notifications/unread-count/<userId>` с функцией загрузки, не названной `…Fetcher`.

## Project Constraints (from CLAUDE.md)

Из `/Users/kdvornichenko/bio-exam/CLAUDE.md` (→ `AGENTS.md`) и глобального `~/.claude/CLAUDE.md`:

- Навигация по коду через CodeGraph (`codegraph explore/node/impact/affected`) до grep и чтения файлов; перед правкой символа `codegraph impact <symbol>` и отчёт о затронутых вызывающих. Каталог `.codegraph/` в репозитории есть.
- Прочитать до правки области: ADR-0001 (web/API), ADR-0005 (структура модулей), ADR-0007 (удаление пользователя, схема); навыки `bio-exam-api`, `bio-exam-data`, `bio-exam-web` (`.agents/skills/<name>/SKILL.md`).
- БД-работа (тесты, миграции, скрипты) только против локальной одноразовой базы `test_*` через `TEST_DATABASE_URL` и `BIO_EXAM_ISOLATED_ENV=1`; `DATABASE_URL` из `.env` не использовать. Команда: `node scripts/with-test-db.mjs <command>`.
- Применённую миграцию Drizzle не править, добавлять новую (`app/server/drizzle/`).
- Новый ключ окружения — в `.env.example`; в этой фазе новых ключей нет (проверка `scripts/check-env-contract.mjs`).
- README и комментарии в env-примерах на русском; команда `yarn …` в документе должна существовать (`scripts/check-docs-commands.mjs`).
- `yarn verify` должен быть зелёным до закрытия фазы; нулевой прогон тестов считается провалом. `yarn e2e` в `verify` не входит.
- Нулевая политика комментариев в коде: комментарии не писать.
- Агенты GSD не коммитят: изменения остаются в рабочем дереве.
- Гигиена тестов (память проекта): серверные интеграционные и e2e; юнит-тесты только для логики с вариантами; без хрупких структурных охранников и без раздувания.
- Весь текст пользователю и в документах на русском; внутренние документы сухо, фактами на текущий момент.
- В UI-работе контраст текста (AA 4,5:1) мерить по вычисленным стилям, цвета из токенов.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Запись события «тест назначен» | API / Backend (транзакция маршрута назначения) | Database | Событие и причина атомарны; ADR-0001: политику и данные держит Express |
| Хранение журнала и доставок | Database / Storage | — | Две таблицы, уникальность `(recipient_id, dedupe_key)` и `(event_id, channel)` решает база |
| Текст строки списка | API / Backend (`kinds.ts`) | — | Тот же текст понадобится push (v5.0), у которого web нет (UI-SPEC) |
| Список, число непрочитанных, прочитать, прочитать все | API / Backend | Database | Единственный источник числа; фильтр получателя в каждом запросе |
| Повторная проверка доступа при открытии | API / Backend (`checkAttemptAccess` + `canReadTest`) | — | Решение о доступе не выносится в web (ADR-0001) |
| Колокольчик, поповер, число | Browser / Client | — | Показ и опрос SWR; решений о доступе нет |
| Префикс числа в заголовке вкладки | Browser / Client | — | `document.title` меняет только клиент; число берётся из того же ключа |
| Страница-посредник `/notifications/[id]` | Browser / Client (эффект вызывает `open`) | Frontend Server (только оболочка `page.tsx`) | `open` меняет данные, поэтому не из серверного рендера и не из prefetch |

## Standard Stack

### Core
Новых библиотек нет. Используется то, что уже в репозитории.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.3 `[VERIFIED: app/server/package.json]` | таблицы, `onConflictDoUpdate`, `returning`, транзакции | уже единственный слой данных сервера |
| drizzle-kit | 0.31.11 `[VERIFIED: app/server/package.json]` | `drizzle:generate` создаёт 0027 и снимок | рецепт миграций проекта |
| zod | ^3.24.3 `[VERIFIED: app/server/package.json]` | разбор `?cursor=&limit=` | как `AttemptsQuerySchema` (`z.coerce.number().int().min(1).max(100).default(50)`) |
| swr | ^2.3.3 (в UI-SPEC 2.3.8) `[VERIFIED: app/web/package.json]` | опрос числа, список | ключи и фетчеры по `bio-exam-web` |
| @radix-ui/react-popover через `components/ui/popover` | в проекте | список уведомлений | `Popover`, `PopoverTrigger`, `PopoverContent` уже есть |
| date-fns | ^4.1.0 `[VERIFIED: app/web/package.json]` | относительное время | `date-fns/locale` `ru`, как `lib/users/student-card.ts` |
| lucide-react | ^0.548.0 `[VERIFIED: app/web/package.json]` | `Bell`, `Loader2` | `bell.js` есть в `node_modules/lucide-react/dist/esm/icons/` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 5.0.3 `[VERIFIED: app/web/package.json, app/server/package.json]` | серверные интеграционные тесты и web-юниты чистых функций | везде |
| @playwright/test | в проекте | e2e колокольчика | `yarn e2e` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Курсор из `Date` | Курсор из текста базы (`to_char(... 'US')`) | Выбран текст базы: иначе пропуск строк (Pitfall 1) |
| SSE/WebSocket для числа | Опрос SWR раз в 60 с | Опрос зафиксирован D-17; SSE откладывается до v4.0 (research SUMMARY) |
| Опрос через `refreshInterval` без `userId` в ключе | Ключ с `userId` | Выбран ключ с `userId`: смена пользователя без перезагрузки не показывает чужое число |

**Installation:** ничего не устанавливается.

**Version verification:** версии взяты из `package.json` воркспейсов, пакеты не добавляются; `npm view` не нужен.

## Package Legitimacy Audit

Фаза не устанавливает внешних пакетов (UI-SPEC: «npm-пакеты не добавляются», реестры shadcn не используются). Аудит не требуется; seam `package-legitimacy` не запускался.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Учитель/админ                                               Ученик (получатель)
      |                                                            |
      | POST /api/tests/:testId/assignments                        |  вход -> useAuth().me.id
      | POST /api/tests/:testId/assignments/group/:groupId         |        |
      | POST /api/users/:userId/test-assignments                   |        v
      v                                                    NotificationBell (SWR)
 sessionRequired -> валидация -> canAssign/canAssignMany      GET /api/notifications/unread-count
      |                                                       (фокус, 60 с, без опроса в скрытой вкладке)
      v                                                            |
 addAssignments(testId, userIds, assignedBy)                       | число -> значок "9+", UnreadTitlePrefix
      |  db.transaction(tx)                                        |
      |   1. INSERT test_assignments ... ON CONFLICT DO NOTHING    | клик
      |      RETURNING (testId,userId)  -> только вставленные      v
      |   2. recordTestAssigned(tx, ...)                    Popover: GET /api/notifications?cursor&limit
      |        - убрать actor === recipient (D-08)                 |  строка = Link /notifications/<id>
      |        - title теста: SELECT tests.title (в tx)            v
      |        - recordNotifications(tx, events)             /notifications/[id] (client effect)
      |            INSERT notification_events                 GET /api/notifications/:id/open
      |            ON CONFLICT (recipient_id, dedupe_key)            |
      |            DO UPDATE ref_seq+1, last_event_at=now(),         v
      |            read_at=NULL RETURNING id                 openNotification(userId, id)
      |            INSERT notification_deliveries (inbox,           |  1. событие своё? нет -> 403 NO_ACCESS
      |            sent) ON CONFLICT (event_id, channel)            |  2. отметить прочитанным
      |            DO UPDATE sent_at=now()                          |  3. kinds[kind].open():
      |  COMMIT (или ROLLBACK: нет ни назначения, ни события)       |     checkAttemptAccess + canReadTest
      v                                                            |  ok -> 200 {href}; иначе 403 {error:'NO_ACCESS'}
 res.json({ ok: true })                                            v
                                                    router.replace(href) | AccessDeniedState
```

### Recommended Project Structure
```
app/server/src/
├── db/schema.ts                         # + notificationEvents, notificationDeliveries
├── services/notifications/
│   ├── index.ts                         # единственный вход модуля (ADR-0005)
│   ├── record.ts                        # recordNotification(tx), recordNotifications(tx), планировщики каналов
│   ├── read.ts                          # list, countUnread, markRead, markAllRead, общий фильтр получателя
│   ├── cursor.ts                        # encode/decode курсора (zod)
│   ├── kinds.ts                         # таблица видов: text(params), open(ctx)
│   └── producers/test-assigned.ts       # recordTestAssigned(tx, ...)
├── routes/notifications.ts              # роутер, монтируется в routes/index.ts
├── routes/tests/assignments.ts          # + экспорт addAssignments (рядом с removeAssignment)
└── routes/users/index.ts                # POST /:userId/test-assignments вызывает addAssignments
app/server/drizzle/0027_notification_journal.sql      # + meta/0027_snapshot.json, _journal.json, migrations-manifest.json
app/server/route-inventory.txt                         # перегенерировать
app/web/
├── lib/notifications/api.ts             # notificationKeys, parse-функции (MalformedBodyError), команды
├── lib/notifications/format.ts          # badgeLabel, titlePrefix, withTitlePrefix, bellAccessibleName, formatNotificationTime, isInternalHref
├── components/notifications/{NotificationBell,NotificationList,UnreadTitlePrefix}.tsx
├── app/(internal)/(protected)/notifications/[id]/{page.tsx,NotificationOpenClient.tsx}
├── components/AppLayout/AppLayout.tsx   # + <NotificationBell /> перед <SearchButton />
└── lib/navigation/{paths.ts,crumbs.ts}  # NON_PAGE_PATHS, подпись крошки
e2e/ ... fixtures/seed.json, accounts.ts, tests/notifications.spec.ts; app/server/src/scripts/e2e-seed.ts
```

### Pattern 1: Схема таблиц (RLS и политика по образцу репозитория)
**What:** `pgTable(name, columns, (t) => ({ ..., denyDirectAccess: denyDirectAccessPolicy() })).enableRLS()`; ключи `uuid('id').primaryKey().defaultRandom()`.
**Verified conventions** `[VERIFIED: app/server/src/db/schema.ts:45-53, 575-593, 640-656]`:
```
function denyDirectAccessPolicy() {
	return pgPolicy('deny_direct_access', {
		as: 'permissive',
		for: 'all',
		to: 'public',
		using: sql`false`,
		withCheck: sql`false`,
	})
}
```
и `denyDirectAccess: denyDirectAccessPolicy(),` внутри `(t) => ({ ... })` с `.enableRLS()` в конце (так оформлены `testAssignments` и `userGroups`). Частичный индекс и индекс с убыванием в этом файле уже есть: `.where(sql\`${t.clientAttemptId} IS NOT NULL\`)` (`schema.ts:510`) и `t.updatedAt.desc().nullsFirst()` (`schema.ts:310`); значение по умолчанию для jsonb `.default(sql\`'{}'::jsonb\`)` (`schema.ts:301`) `[VERIFIED: app/server/src/db/schema.ts:301,310,510]`.
**Example (рекомендованный скелет; имена таблиц и столбцов из D-01…D-04, имена индексов на усмотрение):**
```typescript
export const notificationEvents = pgTable(
	'notification_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
		kind: text('kind').notNull(),
		subjectType: text('subject_type').notNull(),
		subjectId: uuid('subject_id').notNull(),
		dedupeKey: text('dedupe_key').notNull(),
		collapseKey: text('collapse_key'),
		params: jsonb('params').notNull().default(sql`'{}'::jsonb`),
		refSeq: integer('ref_seq').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull().defaultNow(),
		readAt: timestamp('read_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
	},
	(t) => ({
		recipientDedupeUniq: uniqueIndex('notification_events_recipient_dedupe_uniq').on(t.recipientId, t.dedupeKey),
		recipientFeedIdx: index('notification_events_recipient_feed_idx').on(t.recipientId, t.lastEventAt.desc(), t.id.desc()),
		recipientUnreadIdx: index('notification_events_recipient_unread_idx').on(t.recipientId).where(sql`${t.readAt} IS NULL`),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()
```
`notification_deliveries`: `id`, `eventId` (`references(() => notificationEvents.id, { onDelete: 'cascade' })`), `channel text NOT NULL`, `status text NOT NULL`, `attempts integer NOT NULL default 0`, `nextAttemptAt`, `leaseUntil`, `lastError text`, `sentAt`, `createdAt`; `uniqueIndex(...).on(t.eventId, t.channel)`. Целевой набор столбцов доставки и значения по умолчанию — Discretion (CONTEXT).
**Миграция:** `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server drizzle:generate --name notification_journal`. `drizzle.config.ts` в изолированном режиме берёт адрес только из `TEST_DATABASE_URL` и не читает `.env` `[VERIFIED: app/server/drizzle.config.ts]`; флаг `--name` есть у `drizzle-kit generate` `[VERIFIED: drizzle-kit generate --help]`. Образец SQL, который выдаёт генератор для новой таблицы с RLS и политикой, — `app/server/drizzle/0025_teacher_zones.sql`: `ALTER TABLE "teacher_topics" ENABLE ROW LEVEL SECURITY;`, внешние ключи `... ON DELETE cascade ON UPDATE no action`, `CREATE POLICY "deny_direct_access" ON "teacher_topics" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);` `[VERIFIED: app/server/drizzle/0025_teacher_zones.sql]`.
**Манифест (вручную):** после генерации добавить запись в `app/server/drizzle/migrations-manifest.json`: `idx` 27, `tag` `0027_notification_journal`, `file`, `sha256` файла (`shasum -a 256`), `when` как в `meta/_journal.json`, `breakpoints: true`. Последняя запись сейчас дословно: `"idx": 26, "tag": "0026_attempt_result_projection", "file": "0026_attempt_result_projection.sql", "sha256": "79a09926d095a95c2a17b26aaffe09c02ba1d23816e1786028a82d666ac65b7e", "when": 1791239364196, "breakpoints": true` `[VERIFIED: app/server/drizzle/migrations-manifest.json, tail]`; `when` новой записи обязан быть строго больше `1791239364196`, иначе production-раннер drizzle 0.45.3 молча пропустит миграцию (проверка в `scripts/check-migrations.mjs`, этап manifest) `[VERIFIED: scripts/check-migrations.mjs:176-201]`. Шаг `migrations` в `yarn verify` сверяет манифест, журнал, файлы и цепочку с пустой базы против `schema.ts` `[VERIFIED: .agents/skills/bio-exam-data/SKILL.md]`.

### Pattern 2: Запись события (`recordNotifications`)
**What:** один вход записи; принимает только транзакцию.
**Verified SQL поведение (проба на одноразовой PostgreSQL 17):**
```
-- первая вставка
 ref_seq | inserted
       1 | t
-- повторная причина (тот же получатель, тот же dedupe) и новый получатель одним INSERT:
 ON CONFLICT (recipient, dedupe) DO UPDATE SET ref_seq = ev.ref_seq + 1, last_event_at = now(), read_at = NULL, params = excluded.params
              recipient               | ref_seq | unread | inserted
 00000000-0000-4000-8000-000000000001 |       2 | t      | f
 00000000-0000-4000-8000-000000000002 |       1 | t      | t
-- дубликат внутри одной команды:
ERROR:  ON CONFLICT DO UPDATE command cannot affect row a second time
```
`[VERIFIED: проба `node scripts/with-test-db.mjs -- bash -c 'psql "$TEST_DATABASE_URL" -f probe.sql'` на PostgreSQL 17.10]`. Отсюда: `RETURNING (xmax = 0) AS inserted` отличает вставку от поднятия, а пакет обязан содержать различные пары `(recipientId, dedupeKey)`.
**Инвариант группового пакета:** первичный ключ `user_groups` `pk: primaryKey({ columns: [t.groupId, t.userId] })` `[VERIFIED: app/server/src/db/schema.ts:651]` гарантирует, что в `members` группы каждый `userId` один раз, значит в пакете дубликатов `(recipient_id, dedupe_key = test.assigned:<testId>)` нет. Функция всё равно дедуплицирует вход по паре (защита для будущих производителей) и сортирует вход по `recipientId` (одинаковый порядок блокировок в параллельных транзакциях).
**Example (скелет):**
```typescript
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function recordNotifications(tx: Tx, inputs: NotificationInput[]): Promise<void> {
	const unique = [...new Map(inputs.map((i) => [`${i.recipientId}|${i.dedupeKey}`, i])).values()]
		.sort((a, b) => a.recipientId.localeCompare(b.recipientId))
	if (unique.length === 0) return
	const rows = await tx
		.insert(notificationEvents)
		.values(unique.map(toRow))
		.onConflictDoUpdate({
			target: [notificationEvents.recipientId, notificationEvents.dedupeKey],
			set: {
				refSeq: sql`${notificationEvents.refSeq} + 1`,
				lastEventAt: sql`now()`,
				readAt: null,
				actorId: sql`excluded.actor_id`,
				params: sql`excluded.params`,
			},
		})
		.returning({ id: notificationEvents.id })
	for (const channel of CHANNELS) await channel.schedule(tx, rows.map((r) => r.id))
}
```
`CHANNELS` в v3.0 содержит один планировщик `inbox`: `INSERT notification_deliveries (event_id, channel='inbox', status='sent', sent_at=now()) ON CONFLICT (event_id, channel) DO UPDATE SET sent_at = now()` (D-04, D-05). Тип `Tx` объявить в модуле: `scored-attempt/outcome.ts:9` экспортирует такой же `DbTransaction`, но импорт типа из чужого модуля связывает их.

### Pattern 3: Чтение, курсор и общий фильтр получателя
**Verified:** курсор из `Date` (мс) пропускает строки. Проба (две строки с одним и тем же миллисекундным значением):
```
 dedupe |             cur
 m2     | 2026-10-06T14:05:00.123456Z
 m1     | 2026-10-06T14:05:00.123400Z
-- курсор усечён до миллисекунд (.123): строка m1 пропадает
 dedupe
(0 строк)
-- курсор с микросекундами (.123456): m1 на месте
 m1
```
`[VERIFIED: та же проба]`. Поэтому в запросе списка `last_event_at` выбирается ещё и текстом `to_char(last_event_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, курсор — непрозрачная строка `base64url(JSON.stringify([text, id]))`, разбор курсора схемой zod (неверный курсор — 400 `Invalid request`), условие следующей страницы — сравнение строк `(last_event_at, id) < ($ts::timestamptz, $id::uuid)` в том же порядке, что индекс `(recipient_id, last_event_at desc, id desc)`. Список запрашивает `limit + 1` строк, чтобы вычислить `nextCursor`. Drizzle `timestamp(..., { withTimezone: true })` без `mode` отдаёт `Date` (мс) — поэтому читать `lastEventAt` для курсора нужно именно SQL-текстом `[ASSUMED: альтернатива mode: 'string' даёт сырую строку pg; не проверялась]`.
**Общий фильтр:** функция `ownedBy(userId)` (условие `recipient_id = $1`) используется во всех пяти запросах (список, счётчик, прочитать, прочитать все, открыть): «своё событие» задаётся конструкцией, а не дисциплиной автора запроса (дух ADR-0006). Событие с неверным или чужим id возвращает один и тот же результат «нет».
**Счётчик:** `SELECT count(*)::int FROM notification_events WHERE recipient_id = $1 AND read_at IS NULL` — покрывается частичным индексом. Фильтр `expires_at` в v3.0 не добавляется (никто не пишет `expires_at`); когда очистка появится, условие добавляется в `ownedBy`/общую видимость, а не в пять мест.
**Прочитать одно:** `UPDATE ... SET read_at = coalesce(read_at, now()) WHERE id = $1 AND recipient_id = $2 RETURNING id`; 0 строк → 404. Неверный uuid в `WHERE id = $1` даёт ошибку PostgreSQL `22P02` (500), поэтому формат проверяется до запроса `isValidUUID` из `app/server/src/middleware/validateParams.ts` (регулярка UUID v4; `id` создаёт `defaultRandom()`, то есть v4) `[VERIFIED: app/server/src/middleware/validateParams.ts]`.

### Pattern 4: Открытие ссылки (`open`) и обработчик вида
**Verified:** тип результата проверки доступа и сама проверка дословно:
```
export type AttemptAccess = { ok: true; test: AttemptTest } | { ok: false; status: 404 } | { ok: false; status: 403 }
...
export type AttemptAccessParams = {
	testId: string
	userId: string
	canReadTest: () => Promise<boolean>
}
...
export async function checkAttemptAccess(params: AttemptAccessParams): Promise<AttemptAccess> {
	const test = await findVisibleTest(params.testId)
	if (!test) return { ok: false, status: 404 }
	if (!(await isAssignedOrPrivileged(params))) return { ok: false, status: 403 }
	return { ok: true, test }
}
```
`[VERIFIED: app/server/src/services/attempt-sessions/access.ts:20-26,59-64]`. `findVisibleTest` требует `tests.isPublished = true` и `topics.isActive = true` (`access.ts:44`); успех несёт `test.slug` и `test.topicSlug` (`AttemptTest`, `access.ts:7-18`) — из них строится `href`.
**`canReadTest` для персонала:** `export const canReadTest = scope.canReadTest` (`app/server/src/services/access-policy/scope.ts:19`); по тесту `scope.test.ts:89-99`: право `tests.read` и раздел теста в зоне, `zone.all` — любой существующий тест `[VERIFIED: app/server/src/services/access-policy/scope.test.ts:89-99]`. У ученика права `tests.read` нет, значит решает строка `test_assignments`. Форма вызова в маршрутах: `checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })` `[VERIFIED: app/server/src/routes/tests/public.ts:350]`.
**Рекомендация по границам модуля:** `services/notifications` не знает про `Request`: маршрут передаёт `canReadTest: (testId: string) => canReadTest(req, testId)` в контексте `open`; обработчик вида `test.assigned` читает `subjectId`, вызывает `checkAttemptAccess` и возвращает `{ href }` либо `null`. Уважать охранный тест: `.from(testAssignments)` в `routes/` допустим только в управлении назначениями (`scripts/attempt-integrity-guards.test.mjs`: `.from(\s*testAssignments\b` и `\btestAssignments\b` в маршрутах попытки) `[VERIFIED: scripts/attempt-integrity-guards.test.mjs:105-121]`; ни маршрут уведомлений, ни `services/notifications` сами не читают `test_assignments`.
**Порядок в `open`:** формат id не uuid → 403 `{ error: 'NO_ACCESS' }`; событие не найдено или чужое → то же; найдено → отметить прочитанным (в любом исходе доступа: событие просмотрено, число должно уменьшиться; UI-SPEC делает `mutate` в любом исходе, кроме сети); вид неизвестен или проверка отказала → 403 `{ error: 'NO_ACCESS' }`; успех → 200 `{ href: '/tests/' + encodeURIComponent(topicSlug) + '/' + encodeURIComponent(slug) }`. Тело отказа ровно `{ error: 'NO_ACCESS' }` без названия, slug и причины. 404 и 403 из `checkAttemptAccess` сводятся к одному ответу (D-12).

### Pattern 5: Транзакция причины в трёх маршрутах назначения
**Verified текущее состояние (дословно):**
- `assignments.ts:113-114` и `users/index.ts:423-424`: `const adminId = req.authUser!.id` / `await db.insert(testAssignments).values({ testId, userId, assignedBy: adminId }).onConflictDoNothing()` — без `.returning()` и без транзакции.
- `assignments.ts:153-157`: `const inserted = await db.insert(testAssignments).values(assignees.map((userId) => ({ testId, userId, assignedBy: adminId }))).onConflictDoNothing().returning({ id: testAssignments.userId })` — `.returning()` уже есть, транзакции нет.
- Таблица `test_assignments` без столбца `id`: `pk: primaryKey({ name: 'test_assignments_pkey', columns: [t.testId, t.userId] })` — возвращать нужно `{ userId: testAssignments.userId }`.
`[VERIFIED: app/server/src/routes/tests/assignments.ts:99-119,138-159; app/server/src/routes/users/index.ts:410-429; app/server/src/db/schema.ts:575-593]`
**Рекомендация:** одна функция `addAssignments(testId, userIds, assignedBy): Promise<string[]>` в `routes/tests/assignments.ts`, экспортируемая и вызываемая из `routes/users/index.ts` (тот же приём, что у `removeAssignment`, которую `users/index.ts` уже использует):
```typescript
export async function addAssignments(testId: string, userIds: string[], assignedBy: string): Promise<string[]> {
	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(testAssignments)
			.values(userIds.map((userId) => ({ testId, userId, assignedBy })))
			.onConflictDoNothing()
			.returning({ userId: testAssignments.userId })
		const insertedIds = inserted.map((row) => row.userId)
		await recordTestAssigned(tx, { testId, actorId: assignedBy, recipientIds: insertedIds })
		return insertedIds
	})
}
```
Ответы маршрутов не меняются: `{ ok: true }` и `{ ok: true, assigned: inserted.length }`. Тело каждого обработчика сохраняет вызов `canAssign(` / `canAssignMany(`: охранный тест `scripts/teacher-zone-guards.test.mjs` ищет эти вызовы подстрокой в тексте регистрации маршрута (`reg.body.includes(call)`), а не по структуре кода, и сканирует только файлы из `ROUTE_FILES`; новый `routes/notifications.ts` туда не входит `[VERIFIED: scripts/teacher-zone-guards.test.mjs:38-60,285-310]`.
**`recordTestAssigned(tx, { testId, actorId, recipientIds })`** внутри: отфильтровать `id !== actorId` (D-08); если получателей нет — вернуться без запроса; прочитать название `tx.select({ title: tests.title }).from(tests).where(eq(tests.id, testId)).limit(1)` — только `tx`, не `db` (пул разработки по умолчанию 2 соединения: `PG_POOL_MAX ?? (isDev ? 2 : 20)` `[VERIFIED: app/server/src/db/index.ts]`, вложенный запрос через `db` внутри открытой транзакции заблокирует пул под нагрузкой) и без `findVisibleTest`: он требует опубликованный тест и активную тему, а назначение неопубликованного теста обязано писать событие; собрать входы `{ recipientId, actorId, kind: 'test.assigned', subject: { type: 'test', id: testId }, dedupeKey: 'test.assigned:' + testId, params: { testTitle } }` и вызвать `recordNotifications(tx, …)`.
- RESOLVED (D-18, решение пользователя 2026-10-06, после ревью R2): требование «назначение неопубликованного теста обязано писать событие» отменено. Событие `test.assigned` пишется только для видимого теста: `tests.is_published` и `topics.is_active` читаются через `tx` (строка теста `FOR SHARE` против гонки с публикацией); назначение черновика или теста в выключенной теме оставляет назначение без события, ученик не видит название черновика. Публикация (переход `is_published` false → true в `updateTestSettings`, `PATCH /api/tests/:id/settings`) в своей транзакции пишет `test.assigned` всем уже назначенным с тем же `dedupe_key` (`recordTestPublished`). Включение темы событий не создаёт (отложено). Реализация — план 10-02 (назначение) и план 10-09 (публикация).
**Отключённым ученикам** событие пишется (D-08); никакой фильтр по `users.isActive` не нужен.

### Pattern 6: Маршруты и конвенции API
- Регистрация: `router.use('/notifications', notificationsRouter)` в `app/server/src/routes/index.ts` (сейчас дословно `router.use('/groups', groupsRouter)`, `router.use('/docs/assets', docsAssetsRouter)` и т. д.) `[VERIFIED: app/server/src/routes/index.ts:20-30]`. Одиночный файл `routes/notifications.ts` (как `search.ts`, `settings.ts`), порядок путей не конфликтует: `GET /`, `GET /unread-count`, `POST /read-all`, `POST /:id/read`, `GET /:id/open`.
- Сессия: `sessionRequired()`: нет пользователя — `res.status(401).json({ error: 'Unauthorized' })` `[VERIFIED: app/server/src/middleware/auth/session.ts]`. `req.authUser!.id` — единственный источник получателя.
- Конверт ошибок: `res.status(status).json({ error: message, ...(process.env.NODE_ENV !== 'production' && { requestId }) })` `[VERIFIED: app/server/src/app.ts]`; для неверного тела маршруты назначения отвечают `400 { error: 'Invalid request', details: parsed.error.flatten() }` — тот же вид для неверного `cursor`/`limit`.
- Запрос: `z.coerce.number().int().min(1).max(50).default(20)` для `limit` (образец `AttemptsQuerySchema`: `limit: z.coerce.number().int().min(1).max(100).default(50)` `[VERIFIED: app/server/src/routes/tests/admin/attempts.ts:40]`), `cursor: z.string().optional()`.
- CSRF: отдельного middleware нет; защита — `SameSite=Lax` (`'HttpOnly', 'SameSite=Lax'` в `app/server/src/services/session/cookies.ts:45-46`), список разрешённых origin в `cors` и JSON-тело (`express.json`) `[VERIFIED: app/server/src/services/session/cookies.ts:45-48; app/server/src/app.ts]`. Так защищены все существующие POST; `POST /read` и `/read-all` ничего не меняют сверх отметки прочтения у самого пользователя. Ограничения частоты (`rateLimiter`) у собственных маршрутов данных нет; не добавлять (в памяти по IP, подходящие ключи по ученикам за общим NAT ломаются, а запрос индексный).
- Снимок маршрутов: `app/server/src/routes/route-inventory.snapshot.test.ts` сравнивает инвентарь с `app/server/route-inventory.txt`; после добавления маршрутов перегенерировать `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory` и положить diff в SUMMARY (текст ошибки теста именно так и говорит) `[VERIFIED: app/server/src/routes/route-inventory.snapshot.test.ts:26-33; .agents/skills/bio-exam-api/SKILL.md]`.
- Не использовать `validateUUID('id')` в цепочках `/notifications/:id/*`: он отвечает `ApiError.badRequest(\`${ERROR_MESSAGES.INVALID_UUID}: ${paramName}\`)` (400) на неверный uuid `[VERIFIED: app/server/src/middleware/validateParams.ts]`, а web для не-кириллического текста ошибки покажет «Запрос отклонён (код 400)» вместо экрана «Нет доступа» (`readApiError` пропускает только текст с кириллицей: `CYRILLIC = /[а-яё]/i` `[VERIFIED: app/web/lib/http/errors.ts:10,15-20]`). Формат id проверяется в обработчике (`read` → 404, `open` → 403 `NO_ACCESS`).
- ADR-0006 (`Proposed`, файл пока не отслеживается git): его механизм 2 потребует записать `/api/notifications/:id/*` как `self` в `SCOPED_INLINE`. Сейчас ограничением не является; упомянуть в SUMMARY.

### Pattern 7: Web
- **Ключи и загрузка.** Охранный тест `scripts/web-requests-guards.test.mjs` запрещает массив первым аргументом `useSWR`, локальные `const …Fetcher =`, кроме `fetcherWith(`, и `apiFetch` вне `lib/http` и `lib/session` `[VERIFIED: scripts/web-requests-guards.test.mjs:34-45]`. Поэтому ключ — строка с `userId`, не совпадающая с URL (`notifications/unread-count/${userId}`, как `test-summary/${topicSlug}/${testSlug}` в `TestLandingPageClient.tsx:60`), а загрузка — функция, не названная `…Fetcher`: `function loadUnreadCount() { return requestJson(URL, { parse: parseUnreadCount }) }`. Приём `?u=<id>` в URL запроса не нужен.
- **Пользователь:** `useAuth().me.id` — `AuthMe.id: string` `[VERIFIED: app/web/lib/auth/authMePayload.ts:3-4]`. Шапка рендерится внутри `AuthGuard` (`AppLayout.tsx:50-64`), поэтому на `/login` и `/invite` колокольчика нет; `useSWR(me ? key : null, …)`.
- **Опрос:** `refreshInterval: 60_000`, `refreshWhenHidden: false`, `revalidateOnFocus: true`; при ошибке SWR сохраняет последние `data` — число не мигает (UI-SPEC, «Обновление»).
- **Разбор ответов:** по образцу `lib/tests/admin-api.ts` (`MalformedBodyError` из `@/lib/http/request`, `fetcherWith(parse)`, команды через `request(...)`) `[VERIFIED: app/web/lib/tests/admin-api.ts]`. Команда `openNotification` возвращает объединение `{ kind: 'ok', href } | { kind: 'no_access' } | { kind: 'failed', failure }`: ветвление `status === 403 && body.error === 'NO_ACCESS'` делается до `failureMessage` (иначе вернётся общий текст о правах).
- **Безопасность `href`:** принимать только путь `^\/(?![\/\\])` (одиночный `/`, не `//`, не `/\`, не схема); иначе экран как у `NO_ACCESS`. Чистая функция `isInternalHref` в `format.ts` (логика с вариантами → юнит-тест).
- **Заголовок вкладки.** `app/layout.tsx`: `title: { default: siteConfig.name, template: \`%s - ${siteConfig.name}\` }` `[VERIFIED: app/web/app/layout.tsx]`; `document.title` нигде в web не пишется (UI-SPEC). `UnreadTitlePrefix` (клиентский компонент без разметки внутри шапки) на `MutationObserver` по `document.head` и при изменении числа ставит `withTitlePrefix(document.title, titlePrefix(count))`, где `withTitlePrefix` снимает `^\(\d+\+?\) ` и добавляет новый префикс; запись выполняется только если строка изменилась (иначе наблюдатель зациклится). Поведение Next 16 при смене `<title>` (замена узла или текста) в этой сессии не проверялось — `[ASSUMED]`; именно поэтому наблюдатель следит и за `childList`, и за `characterData`, а e2e проверяет заголовок после перехода между страницами.
- **Навигация:** `/^\/notifications$/` добавить в `NON_PAGE_PATHS` (сейчас список дословно: `/^\/tests\/[^/]+$/`, `/^\/invite$/`, `/^\/admin\/tests\/[^/]+\/[^/]+\/questions$/`, `/^\/admin\/tests\/[^/]+\/[^/]+\/questions\/drafts$/`) `[VERIFIED: app/web/lib/navigation/paths.ts:3-8]`. `NAV_SECTIONS` не меняется: тест `sections.test.ts` пропускает пути с сегментами `[…]` (`if (route.some((segment) => segment.startsWith('['))) continue`) `[VERIFIED: app/web/lib/navigation/sections.test.ts:36-50]`. Подпись крошки проще и надёжнее задать статически: `{ pattern: /^\/notifications\/[^/]+$/, label: 'Уведомление' }` в `LABEL_PATTERNS` (`app/web/lib/navigation/crumbs.ts`, так сделано для `/admin/attempts/[id]`), без `SetBreadcrumbsLabels` и без мигания.
- **Метаданные страницы:** `export const metadata = { title: 'Уведомление' }` в `page.tsx` (образец `dashboard/page.tsx`).
- **Вставка в шапку:** `AppLayout.tsx` — правая группа `<div className="ml-auto flex h-full shrink-0 items-center gap-unit-mob tab-sm:gap-unit"><SearchButton /></div>`; `<NotificationBell />` ставится перед `<SearchButton />` `[VERIFIED: app/web/components/AppLayout/AppLayout.tsx:63-65]`. `AppLayout` — серверный компонент; колокольчик помечается `'use client'`.
- **Ссылки списка:** `<Link href="/notifications/<id>" prefetch={false}>` — предзагрузка страницы-посредника не вызывает API (`page.tsx` данных не читает), но 20 префетчей на открытие поповера ни к чему `[ASSUMED]`.
- **Юнит-тесты web:** vitest в `environment: 'node'`, только `*.test.ts`, React не рендерится `[VERIFIED: app/web/vitest.config.ts]`; значит `UnreadTitlePrefix`, поповер и страница проверяются только в e2e, юнит-тестами покрываются чистые функции `format.ts` и разборщики.

**Verified web-расчёты (Node 24.17.0 с ICU):**
```
date-fns ru: format(2026-10-06 14:05,'d MMM') = "6 окт."; 'd MMMM yyyy, HH:mm' = "6 октября 2026, 14:05"; format(2025-10-06,'d MMM yyyy') = "6 окт. 2025"
Intl.PluralRules('ru'): 1:one 2:few 5:many 11:many 21:one 22:few 101:one 111:many
Date.parse('2026-10-06T14:05:00.123456Z') = 1791295500123   (микросекунды в ISO разбираются, лишние разряды отбрасываются)
```
`[VERIFIED: node -e на этой машине]`. Формы доступного имени из UI-SPEC («непрочитанное» для категории `one`, «непрочитанных» для остальных) совпадают с этой выдачей.

### Anti-Patterns to Avoid
- **Чтение-потом-запись вместо `ON CONFLICT`:** гонка двух запросов даст два события или ошибку уникальности; использовать `onConflictDoUpdate`/`onConflictDoNothing` по уникальному индексу.
- **Запись события вне транзакции причины или через `db` вместо `tx`:** разрывает атомарность и может заблокировать малый пул; тип `recordNotification*` принимает только `tx`.
- **Событие из фикстур и сидов через маршруты не создаётся:** сиды и `test-support` пишут `test_assignments` напрямую (`e2e-seed.ts:283`, `bench/seed.ts:451`, `attempt-world.ts: assignTest`, `teacher-zone-world.ts:263,318`), события там не нужны и ломали бы подсчёты в чужих тестах `[ASSUMED: решение проектирования; события — эффект маршрута, а не таблицы]`.
- **`GET /open` из серверного рендера или `prefetch`:** он отмечает прочитанным; только из клиентского эффекта.
- **Отдача `href` или названия при отказе:** тело отказа ровно `{ error: 'NO_ACCESS' }`.
- **Число `9+` в данных сервера:** сервер отдаёт точное число; ограничение только в интерфейсе (D-11).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Один объект — одна строка события | SELECT, затем INSERT/UPDATE в коде | `INSERT … ON CONFLICT (recipient_id, dedupe_key) DO UPDATE` | гонки; проба подтвердила `ref_seq`, `unread`, `inserted` |
| Курсор страниц | сравнение по `Date` или по числу | текст `last_event_at` из базы + `(last_event_at, id) < ($1, $2)` | иначе пропуск строк на микросекундах (проба) |
| Падеж «непрочитанное/непрочитанных» | своя таблица окончаний | `Intl.PluralRules('ru')` | верно для 11, 21, 101 (проба) |
| Относительное время и месяцы | ручное форматирование | `date-fns` + локаль `ru` | «окт.» и порядок падежей уже верны (проба) |
| Всплывающий список с фокусом и Esc | свой `div` с позиционированием | `Popover` из `components/ui/popover` (Radix) | возврат фокуса, коллизии с краем окна, `role="dialog"` |
| Состояние загрузки и ошибок списка | свои плашки | `LoadErrorAlert`, `AccessDeniedState`, `Skeleton` | единый текст ошибок и поведение «Повторить» |
| Права и доступ к тесту | свой запрос к `test_assignments` | `checkAttemptAccess` + `canReadTest` | та же проверка, что у страницы теста; охранный тест запрещает читать назначения в маршрутах |
| Разбор ответов API в web | приведение `as` | parse-функции с `MalformedBodyError` и `fetcherWith`/`requestJson({ parse })` | неверная форма даёт `malformed`, а не тихий сбой |

**Key insight:** вся сложность фазы в границах (транзакция, получатель, доступ при открытии), а не в объёме кода; каждая из них закрывается готовым средством (`tx`, общий фильтр получателя, `checkAttemptAccess`).

## Runtime State Inventory

Не применимо: фаза не переименовывает и не мигрирует существующие данные (greenfield-таблицы; существующие назначения событий не получают, обратного заполнения нет).

## Common Pitfalls

### Pitfall 1: Курсор из `Date` пропускает строки
**What goes wrong:** на втором экране «Показать ещё» пропадают события, у которых `last_event_at` совпадает с курсором до миллисекунды (групповое назначение пишет десятки событий в одной транзакции с одним `now()`; общий `now()` в транзакции даёт одинаковый `last_event_at` у всех, различаются только `id`).
**Why it happens:** `timestamptz` хранит микросекунды, `Date` — миллисекунды; `ORDER BY last_event_at DESC, id DESC` и `<` на усечённом значении исключают соседей `[VERIFIED: проба]`.
**How to avoid:** текст из `to_char(… 'US')` как значение курсора; тест: две строки с разными микросекундами внутри одной миллисекунды и страницами по 1.
**Warning signs:** «Показать ещё» показывает меньше строк, чем `count(*)`.

### Pitfall 2: Дубликат `(recipient_id, dedupe_key)` в одном пакете
**What goes wrong:** `ON CONFLICT DO UPDATE command cannot affect row a second time`, транзакция откатывается, назначение не сохраняется `[VERIFIED: проба]`.
**Why it happens:** пакет с двумя входами для одной пары.
**How to avoid:** дедупликация входа внутри `recordNotifications`; в групповом назначении дубликатов нет благодаря PK `user_groups (group_id, user_id)` `[VERIFIED: schema.ts:651]`.
**Warning signs:** 500 на групповом назначении будущего производителя.

### Pitfall 3: `validateUUID` ломает экран «Нет доступа»
**What goes wrong:** неверный id в `/notifications/<мусор>` даёт 400 и `LoadErrorAlert` вместо `AccessDeniedState`.
**Why it happens:** `validateUUID` отвечает 400 `Invalid UUID: id`, а web принимает только кириллические тексты ошибок.
**How to avoid:** формат id проверять в обработчике; `open` → 403 `NO_ACCESS`, `read` → 404.

### Pitfall 4: Событие помечено прочитанным, а число не уменьшилось (и наоборот)
**What goes wrong:** `open` не отмечает событие при отказе; в списке остаётся точка у события, на которое клик даёт «нет доступа».
**How to avoid:** отмечать прочитанным до проверки доступа и в любом исходе; web делает `mutate` числа и списка в любом исходе, кроме сетевой ошибки (UI-SPEC).

### Pitfall 5: `GET /open` с побочным эффектом и `SameSite=Lax`
**What goes wrong:** `Lax` отправляет cookie при переходе верхнего уровня с другого сайта по GET; чужая страница может открыть `…/api/notifications/<uuid>/open` и отметить событие прочитанным.
**Why it happens:** D-10 фиксирует `GET` для `open`.
**How to avoid:** принять как низкий риск: нужен случайный uuid события (v4), эффект ограничен отметкой прочтения собственного события; отметить в SECURITY-разделе SUMMARY. Если потребуется закрыть, `open` переводится в `POST` без смены имён остальных маршрутов (решение за пользователем, см. Open Questions).

### Pitfall 6: Префикс заголовка зацикливает `MutationObserver`
**What goes wrong:** запись `document.title` вызывает собственный наблюдатель; бесконечный цикл или двойной префикс `(1) (1) …`.
**How to avoid:** писать только при изменении строки; снимать существующий префикс регулярным выражением до добавления; в e2e проверить заголовок после перехода между страницами (UI-SPEC).

### Pitfall 7: Ключ SWR без пользователя показывает чужое число
**What goes wrong:** после смены пользователя без перезагрузки (`refresh()` в `AuthProvider`) кэш SWR отдаёт число прежнего пользователя.
**How to avoid:** `userId` внутри ключа; без `me` ключ `null`.

### Pitfall 8: Тест `route-inventory.snapshot` падает после добавления маршрутов
**How to avoid:** перегенерировать `route-inventory.txt` командой `routes:inventory` под `with-test-db` и приложить diff в SUMMARY.

### Pitfall 9: `scoring.spec.ts` на desktop зависает при росте `e2e-topic`
**What goes wrong:** выпадающий список «Тест» на `/admin/tests/question-types/<ключ>` после выбора темы `e2e-topic` становится длинным (20 пунктов), клик по пункту доходит до таймаута 30 с `[VERIFIED: .planning/phases/09-result-foundation-and-readers/09-18-SUMMARY.md:28,87-88; deferred-items.md:9-13]`.
**How to avoid:** новые тесты сида класть в отдельную тему `e2e-notif`; в `e2e-topic` не добавлять.

### Pitfall 10: Сид и охранные тесты назначений
**What goes wrong:** правка `routes/tests/assignments.ts` или `routes/users/index.ts` теряет вызов `canAssign(`/`canAssignMany(` из тела маршрута; `scripts/teacher-zone-guards.test.mjs` падает `[VERIFIED: scripts/teacher-zone-guards.test.mjs:102-105,303-326]`.
**How to avoid:** проверку области оставлять в обработчике (до вызова `addAssignments`), общую функцию вызывать после неё.

## Code Examples

### Список по курсору (скелет запроса)
```typescript
const cursorTs = sql<string>`to_char(${notificationEvents.lastEventAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

const rows = await db
	.select({ id: notificationEvents.id, kind: notificationEvents.kind, params: notificationEvents.params, readAt: notificationEvents.readAt, lastEventAt: cursorTs })
	.from(notificationEvents)
	.where(and(ownedBy(userId), cursor ? sql`(${notificationEvents.lastEventAt}, ${notificationEvents.id}) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)` : undefined))
	.orderBy(desc(notificationEvents.lastEventAt), desc(notificationEvents.id))
	.limit(limit + 1)
```
Ответ: `{ items: [{ id, kind, text, read, lastEventAt }], nextCursor: string | null }`; `text` собирает `kinds.ts` (контракт текста — `10-UI-SPEC.md`, раздел «Данные для интерфейса»: `Вам назначен тест «{testTitle}»`, `Вам назначен тест`, `Новое уведомление`). `params` читается схемой zod `safeParse`: испорченная строка даёт запасной текст, а не 500.

### Чистые функции web (контракт UI-SPEC)
```typescript
export function badgeLabel(count: number): string { return count > 9 ? '9+' : String(count) }
export function titlePrefix(count: number): string { return count > 0 ? `(${badgeLabel(count)}) ` : '' }
export function withTitlePrefix(title: string, prefix: string): string { return prefix + title.replace(/^\(\d+\+?\) /, '') }
export function bellAccessibleName(count: number): string {
	if (count <= 0) return 'Уведомления'
	return new Intl.PluralRules('ru').select(count) === 'one' ? `Уведомления, ${count} непрочитанное` : `Уведомления, ${count} непрочитанных`
}
export function isInternalHref(href: string): boolean { return /^\/(?![\/\\])/.test(href) }
```
`formatNotificationTime(iso, now)` — таблица разниц из UI-SPEC («Время»); `now` приходит параметром (юнит-тест таблицей).

### Откат причины откатывает событие (форма серверного теста)
```typescript
await expect(
	db.transaction(async (tx) => {
		await tx.insert(schema.testAssignments).values({ testId, userId, assignedBy })
		await recordTestAssigned(tx, { testId, actorId: assignedBy, recipientIds: [userId] })
		throw new Error('rollback')
	})
).rejects.toThrow('rollback')
```
после чего в `test_assignments` и `notification_events` ничего нет. Маршрутный вариант («падение производителя откатывает и назначение») возможен через `vi.doMock` модуля `services/notifications` перед `startAuthApp`: `startAuthApp` вызывает `vi.resetModules()` и импортирует приложение заново `[VERIFIED: app/server/src/test-support/auth-app.ts]`; выполнимость подмены не проверялась `[ASSUMED]`, запасной вариант — серверный тест выше.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Журнал со ссылкой в строке (`deep_link`) в research | Ссылка не хранится, путь вычисляет обработчик вида при открытии (D-02) | CONTEXT 2026-10-06 | Доступ перепроверяется при каждом открытии; смена структуры путей не требует миграции данных |
| `deliver_after` на событии и `publishAfterCommit` в research SUMMARY | Не входят в D-02…D-06 | CONTEXT 2026-10-06 | Отложенная доставка опирается на `notification_deliveries.next_attempt_at`; шов после коммита добавит v4.0 (см. Open Questions) |

**Deprecated/outdated:** нет.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `timestamp(..., { mode: 'string' })` в drizzle отдаёт сырую строку pg с микросекундами; в плане использовать явный `to_char` | Pattern 3 | Низкий: рекомендован `to_char`, проверенный пробой |
| A2 | Сиды и фикстуры (`e2e-seed`, `bench/seed`, `test-support`) события через производитель не создают, кроме специально сеянных событий e2e | Anti-Patterns | Средний: если решить иначе, счётчики в чужих e2e и серверных тестах изменятся |
| A3 | Next 16 заменяет `<title>` узлом или текстом, оба случая ловит `MutationObserver` по `document.head` (`childList` + `characterData`, `subtree`) | Pattern 7 | Средний: если Next перерисовывает заголовок иначе, префикс теряется; ловит e2e после навигации |
| A4 | `prefetch={false}` на ссылках списка экономит 20 префетчей и безопасен | Pattern 7 | Низкий |
| A5 | `vi.doMock` модуля `services/notifications` перед `startAuthApp` даёт маршрутный тест отката | Code Examples | Низкий: запасной вариант — тест уровня сервиса |
| A6 | `open` отмечает событие прочитанным и при отказе доступа | Pattern 4 | Низкий: UI-SPEC делает `mutate` в любом исходе |
| A7 | `read` для неверного uuid отвечает 404, `open` для неверного uuid — 403 `NO_ACCESS` | Pattern 6 | Низкий: следует D-10, D-12 и UI-SPEC |
| A8 | `deliver_after` и `publishAfterCommit` в 0027 не нужны | State of the Art | Низкий: добавляются миграцией `ADD COLUMN` и пустой функцией позже |

## Open Questions (RESOLVED)

1. **Критерий успеха 3 («student left the group») против D-09**
   - What we know: ROADMAP называет «assignment revoked, student left the group»; D-09 говорит, что выход из группы доступ не снимает; в коде `test_assignments` удаляет только `removeAssignment` и каскады FK, ни одно изменение членства в группе назначения не трогает `[VERIFIED: grep testAssignments по app/server/src, не тесты]`.
   - What's unclear: ожидает ли пользователь, что выход из группы убирает групповое назначение (сейчас групповое назначение — разовая выдача каждому участнику).
   - Recommendation: следовать D-09 (решение зафиксировано). Тест «после выхода из группы доступ остаётся, пока есть строка назначения» документирует фактическое поведение; пути потери доступа в тестах: снятие назначения, снятие публикации, отключённая тема, удаление теста. Сообщить пользователю в SUMMARY как расхождение формулировки критерия с решением.
   - RESOLVED: планы следуют D-09. Тест 10-04 `group leave keeps access while the assignment exists (D-09)` фиксирует фактическое поведение; потерю права проверяют снятие назначения, снятие публикации, отключение темы и удаление теста (10-04) и снятие назначения в браузере (10-08); формулировка критерия 3 в ROADMAP не правится, расхождение записывается в SUMMARY 10-04 и 10-08.

2. **`deliver_after` и `publishAfterCommit` из research SUMMARY**
   - What we know: `.planning/research/SUMMARY.md` перечисляет `deliver_after`; CONTEXT D-02 его не включает; `publishAfterCommit` в v3.0 пуст.
   - Recommendation: не добавлять (YAGNI; отложенную отправку несёт `notification_deliveries.next_attempt_at`; миграция `ADD COLUMN` дешёвая).
   - RESOLVED: не добавляются. Миграция 0027 (10-01) несёт поля будущей доставки в `notification_deliveries` (`next_attempt_at`, `lease_until`, `attempts`, `last_error`); функции после коммита в модуле нет.

3. **`GET /open` с побочным эффектом при `SameSite=Lax`**
   - Recommendation: оставить `GET` по D-10 (риск низкий, см. Pitfall 5); если пользователь захочет закрыть — перевод в `POST` без смены прочих имён.
   - RESOLVED: `GET /api/notifications/:id/open` по D-10 (10-04); риск принят в угрозе T-10-19 плана 10-04.

4. **Название теста в списке после снятия доступа**
   - What we know: список показывает `params.testTitle` на момент события, как велит D-13; после снятия назначения строка остаётся с названием, открытие даёт `NO_ACCESS`.
   - Recommendation: принять как задумано: получатель уже видел это название при назначении.
   - RESOLVED: список показывает `params.testTitle` на момент события (D-13; текст строки собирает `kinds.ts`, 10-03); открытие после потери права отвечает `NO_ACCESS` (10-04).

5. **Событие уходит и получателям, которые не ученики (администратор назначает учителю)**
   - What we know: D-07 пишет событие для каждой вставленной строки `test_assignments`; `canAssign` у `zone.all` не ограничивает получателя ролью.
   - Recommendation: не фильтровать по роли; открытие у персонала проходит через `canReadTest`.
   - RESOLVED: по роли не фильтруется: `recordTestAssigned` пишет событие каждой вставленной строке `test_assignments` видимого теста (D-18), кроме назначившего самому себе (D-08, 10-02); открытие у персонала проходит через `canReadTest` (случай «персонал» в 10-04).

6. **Как seed вводит события для e2e**
   - Recommendation: см. раздел Validation Architecture: аккаунт `bell-student-<p>` получает 11 непрочитанных событий через `recordNotification` в транзакции сида (синтетические `subject_id`, без реальных тестов — заодно основа «Нет доступа»); аккаунт `notify-student-<p>` без событий — для сквозного пути «назначение через API → колокольчик → тест».
   - RESOLVED: планы используют 21 событие, а не 11: сид 10-05 пишет `bell-student-<p>` 20 событий `test.assigned` (синтетические `subject_id`, в том числе длинное название и название с кавычками) и одно `chat.message` через `recordNotifications` в транзакции сида — для «9+», «Показать ещё» (страница 20 строк и ещё одна) и запасного текста «Новое уведомление»; `notify-student-<p>` без событий — для сквозного пути (10-05, 10-08).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | сервер, web, тесты | ✓ | v24.17.0 (проба `node --version`; `.nvmrc` требует 24) | — |
| PostgreSQL 17 (`pg_ctl`, `postgres`, `psql`) | серверные тесты, `drizzle:generate`, e2e (через `with-test-db`) | ✓ | psql 17.10 (Homebrew, `postgresql@17`) | — |
| drizzle-kit | генерация 0027 | ✓ | 0.31.11 (`node_modules/.bin/drizzle-kit`) | — |
| Playwright Chromium | `yarn e2e` | не проверялось (`yarn playwright install chromium` перед первым прогоном) | — | — |

**Missing dependencies with no fallback:** нет.
**Missing dependencies with fallback:** нет.

## Validation Architecture

> `workflow.nyquist_validation: true` в `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (server, web), `node --test` (scripts), Playwright (e2e) |
| Config file | `app/server/vitest.config.ts` (include `src/**/*.test.ts`, `testTimeout: 20_000`, `BIO_EXAM_ISOLATED_ENV=1`), `app/web/vitest.config.ts` (environment `node`, `**/*.test.ts`), `e2e/playwright.config.ts` |
| Quick run command | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server exec vitest run src/services/notifications/notifications.test.ts`; web: `yarn workspace @bio-exam/web exec vitest run lib/notifications` |
| Full suite command | `yarn verify`, затем отдельно `yarn e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | Откат причины не оставляет ни назначения, ни события | server integration | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server exec vitest run src/services/notifications/notifications.test.ts` | ❌ Wave 0 |
| NOTIF-01 | Повтор запроса: одна строка, `ref_seq = 1`; повторная причина после снятия: та же строка, `ref_seq = 2`, непрочитано, `last_event_at` вырос | server integration | `… vitest run src/routes/tests/assignment-notifications.test.ts` | ❌ Wave 0 |
| NOTIF-01 | Три пути назначения (одиночное, группа, из профиля): события только для вставленных строк; назначающий = получатель события не даёт; отключённый ученик событие получает | server integration | `… vitest run src/routes/tests/assignment-notifications.test.ts` | ❌ Wave 0 |
| NOTIF-01 | Пакет без дубликатов `(recipient, dedupe)` не падает; доставка `inbox` со `status = 'sent'`, `sent_at` обновляется при повторной причине | server integration | `… notifications.test.ts` | ❌ Wave 0 |
| NOTIF-01 | Удаление получателя удаляет его события и доставки; удаление автора обнуляет `actor_id`, событие остаётся | server integration (расширение существующего) | `… vitest run src/db/user-deletion-rule.test.ts` | ✅ файл, ❌ кейсы |
| NOTIF-02 | `GET /api/notifications` только свои, порядок `(last_event_at, id)`, курсор без потерь на микросекундах, `limit` по умолчанию 20 | server integration | `… vitest run src/routes/notifications.test.ts` | ❌ Wave 0 |
| NOTIF-02 | `unread-count` точное (например 11), без «9+»; `read` и `read-all`; чужой или неверный id → 404 | server integration | `… notifications.test.ts` (маршруты) | ❌ Wave 0 |
| NOTIF-02 | `open`: `{ href: '/tests/<topicSlug>/<testSlug>' }`; после снятия назначения, снятия публикации, удаления теста и чужого/неверного id → ровно `{ error: 'NO_ACCESS' }` (403) без названия и slug; выход из группы доступ сохраняет (D-09) | server integration | `… notifications.test.ts` (маршруты) | ❌ Wave 0 |
| NOTIF-02 | Страницы без сессии → 401 | server integration | `… notifications.test.ts` | ❌ Wave 0 |
| NOTIF-02 | Колокольчик, «9+», открытие списка, переход по строке на тест, событие прочитано, «Прочитать все», «Нет доступа» на 375/768/1280 | e2e | `yarn e2e tests/notifications.spec.ts` | ❌ Wave 0 |
| NOTIF-05 | Префикс `(N) ` / `(9+) ` в заголовке, снимается при нуле, после перехода между страницами без двойного префикса | e2e | `yarn e2e tests/notifications.spec.ts` | ❌ Wave 0 |
| NOTIF-05 | `titlePrefix`, `withTitlePrefix`, `badgeLabel`, `bellAccessibleName`, `formatNotificationTime`, `isInternalHref` | unit table | `yarn workspace @bio-exam/web exec vitest run lib/notifications/format.test.ts` | ❌ Wave 0 |
| NOTIF-06 | Неизвестный `kind` (например `chat.message`) записывается, выводится текстом «Новое уведомление», `open` даёт `NO_ACCESS`; `collapse_key` сохраняется; у доставки `attempts = 0`, `next_attempt_at` и `lease_until` пусты | server integration | `… notifications.test.ts` | ❌ Wave 0 |
| NOTIF-01..06 | Разборщики ответов web (`MalformedBodyError` на неверную форму) | unit | `yarn workspace @bio-exam/web exec vitest run lib/notifications/api.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** тест затронутого файла (один серверный файл через `with-test-db`; один файл web)
- **Per wave merge:** `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` + `yarn workspace @bio-exam/web test` + `yarn typecheck` + `yarn lint`
- **Phase gate:** `yarn verify: OK` (включая `migrations` и снимок маршрутов), затем `yarn e2e` зелёный на `chromium-desktop` и `chromium-mobile`

### Wave 0 Gaps
- [ ] `app/server/src/services/notifications/notifications.test.ts`: запись, откат, дедупликация пакета, неизвестный вид, поля доставки (NOTIF-01, NOTIF-06)
- [ ] `app/server/src/routes/notifications.test.ts`: список с курсором, счётчик, `read`, `read-all`, `open`, 401/404/403 (NOTIF-02)
- [ ] `app/server/src/routes/tests/assignment-notifications.test.ts`: три пути назначения (NOTIF-01); фикстуры `seedAttemptWorld`, `seedStudent`, `createAttemptTest` и `call` из `app/server/src/test-support/attempt-world.ts` и `auth-app.ts` уже есть
- [ ] кейсы в `app/server/src/db/user-deletion-rule.test.ts` (ADR-0007: «Поведенческий случай проверяет удаление ученика и удаление автора»); каталог внешних ключей подхватит новые ключи сам
- [ ] `app/web/lib/notifications/format.test.ts`, `api.test.ts`
- [ ] e2e: аккаунты и тесты в сиде, `e2e/tests/notifications.spec.ts` (описание ниже)
- [ ] `app/server/route-inventory.txt` перегенерировать

**e2e (рекомендация по сиду).** Текущие аккаунты проекта дословно: `student-desktop`, `admin-desktop`, `login-student-desktop`, `login-admin-desktop`, `teacher-desktop`, `zone-student-desktop`, `review-student-desktop` (то же с `-mobile`) `[VERIFIED: e2e/fixtures/seed.json, разбор python]`; порядок значим (`sessionAccount(p, 'user')` — первый пользователь со `storageState`), новые аккаунты добавляются в конец. Темы `e2e-review` и `e2e-assign-<p>` уже заведены отдельно от `e2e-topic`; новую тему `e2e-notif` завести по тому же образцу (Pitfall 9).
- `bell-student-<p>` (роль `user`, `storageState: true`): в транзакции сида через `recordNotification(tx, …)` 11 непрочитанных событий `test.assigned` с синтетическими `subject_id` (несуществующие тесты) и разными названиями (одно длинное, одно с кавычками). Проверяются: «9+» на кнопке, имя «Уведомления, 11 непрочитанных», `(9+) ` в заголовке до и после перехода на другую страницу, поповер на 1280/768/375 без переполнения, контраст по вычисленным стилям (расширить образец `attempt-review-pending.spec.ts`: `lowContrastTexts`, `horizontalOverflow` из `e2e/fixtures/page-checks.ts`), «Показать ещё», «Прочитать все» (число и префикс исчезают), страница `/notifications/<id>` по событию без объекта показывает «Нет доступа к материалу».
- `notify-student-<p>` и опубликованный тест `notify-test-<p>` в теме `e2e-notif` без назначений: spec под администратором (`newAccountContext(browser, testInfo, 'admin-<p>')`) определяет id теста запросом `/api/tests/by-slug/<topic>/<slug>` (ответ `{ test: { id } }`, образец `testIdOf` в `e2e/tests/question-draft-durability.spec.ts:26-31` `[VERIFIED]`) и назначает его `POST /api/tests/<id>/assignments` с `{ userId }` (id ученика — `GET /api/auth/me`, ответ `{ user: { id } }`, образец там же `:33-37` `[VERIFIED]`); затем ученик видит `1`, префикс `(1) `, открывает уведомление из списка, попадает на `/tests/e2e-notif/notify-test-<p>`, число уходит; администратор снимает назначение, ученик заново назначается (событие снова непрочитано) и снова снимается — открытие из списка даёт «Нет доступа к материалу». Спек `test.describe.configure({ mode: 'serial' })` (как `attempt-review-pending.spec.ts`), `retries: 0` и `workers: 1` в `e2e/playwright.config.ts` `[VERIFIED]`.
- Существующий `teacher-zone.spec.ts` (шаг 5: учитель назначает тест `zone-student`) теперь пишет реальное событие; проверок числа в нём нет, но полный `yarn e2e` нужен, чтобы убедиться, что кнопка в шапке не сломала селекторы и ширину шапки на 375 px.

## Security Domain

> `security_enforcement` в `.planning/config.json` не задан (включён по умолчанию).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | все маршруты под `sessionRequired()` (cookie `HttpOnly; SameSite=Lax`), получатель только `req.authUser.id` |
| V3 Session Management | yes | существующий модуль сессий; ключ SWR с `userId` не делит кэш между пользователями |
| V4 Access Control | yes | `ownedBy(userId)` во всех запросах; повторная проверка при открытии через `checkAttemptAccess` + `canReadTest`; единый ответ на чужой, несуществующий и неверный id |
| V5 Input Validation | yes | zod для `cursor` и `limit`; формат id проверяется `isValidUUID` до запроса (иначе `22P02`/500); `href` в web только путь `^\/(?![\/\\])` |
| V6 Cryptography | no | своих криптопримитивов нет |
| V8 Data Protection | yes | `params` хранит только несекретное (название теста); тело `NO_ACCESS` без данных объекта; `Cache-Control` не нужен: запросы web с `cache: 'no-store'` (`buildInit`) `[VERIFIED: app/web/lib/http/request.ts]` |

### Known Threat Patterns for Express + Drizzle + Next

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR: чтение или отметка чужого события по id | Information Disclosure, Tampering | `recipient_id = req.authUser.id` в `WHERE` каждого запроса; чужой id неотличим от несуществующего (404/403 `NO_ACCESS`) |
| Утечка данных объекта через отказ доступа | Information Disclosure | тело ровно `{ error: 'NO_ACCESS' }`; 404/403 `checkAttemptAccess` сводятся к одному ответу |
| Открытое перенаправление через `href` | Spoofing | `href` строит сервер из `topicSlug`/`slug` через `encodeURIComponent`; web принимает только внутренний путь |
| Перебор id событий | Information Disclosure | uuid v4 (`defaultRandom()`); единый ответ; ограничение частоты не нужно (запрос индексный, только свои данные) |
| CSRF на POST `read`/`read-all` | Tampering | `SameSite=Lax` + CORS allowlist + JSON-тело; эффект только на собственных событиях |
| CSRF/навигация на `GET /open` | Tampering | низкий риск (Pitfall 5): нужен uuid, эффект — отметка прочтения |
| XSS через `params.testTitle` | Tampering | React экранирует текст; текст не вставляется как HTML; в заголовок вкладки идёт только число |
| Дубль или потеря события при гонке | Tampering/Repudiation | единая транзакция причины + `ON CONFLICT`; одинаковый порядок вставки (сортировка по `recipient_id`) |
| Нехватка соединений пула при записи события | Denial of Service | запись только через `tx`; никаких запросов через `db` внутри транзакции |

## Sources

### Primary (HIGH confidence)
- Репозиторий, ветка `dev`, коммит `9bfc67a`: `app/server/src/routes/tests/assignments.ts`, `app/server/src/routes/users/index.ts`, `app/server/src/services/attempt-sessions/access.ts`, `app/server/src/services/access-policy/scope.ts` и `scope.test.ts`, `app/server/src/routes/index.ts`, `app/server/src/app.ts`, `app/server/src/middleware/{auth/session,validateParams,rateLimiter}.ts`, `app/server/src/db/{schema,index}.ts`, `app/server/src/db/user-deletion-rule.test.ts`, `app/server/src/services/session/cookies.ts`, `app/server/drizzle/{migrations-manifest.json,0025_teacher_zones.sql,meta/_journal.json}`, `scripts/{check-migrations,teacher-zone-guards.test,attempt-integrity-guards.test,web-requests-guards.test}.mjs`, `app/web/components/AppLayout/AppLayout.tsx`, `app/web/lib/{http,navigation,auth,tests}/*`, `app/web/app/layout.tsx`, `e2e/**`
- Живые пробы на PostgreSQL 17.10 через `node scripts/with-test-db.mjs`: upsert и `xmax`, дубликат в одной команде, микросекунды в курсоре
- Проба Node 24.17.0: `date-fns`/`ru`, `Intl.PluralRules('ru')`, `Date.parse` с микросекундами
- `docs/adr/0001`, `0005`, `0007`; навыки `.agents/skills/bio-exam-{api,data,web}/SKILL.md`

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` и `.planning/research/pwa/SUMMARY.md` (carry-in журнала для v4.0/v5.0)
- `.planning/phases/10-notification-journal-and-bell/10-UI-SPEC.md` (утверждённый контракт интерфейса)

### Tertiary (LOW confidence)
- Поведение `<title>` в Next 16 при смене страницы (`[ASSUMED]`, проверяется e2e)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — новых пакетов нет, версии из `package.json`
- Architecture: HIGH — все три пути записи, проверка доступа, регистрация роутера и охранные тесты прочитаны; SQL-поведение проверено пробой
- Pitfalls: HIGH для курсора, дубликатов в пакете и `validateUUID` (проверены пробой и чтением кода); MEDIUM для заголовка вкладки (e2e)

**Research date:** 2026-10-06
**Valid until:** 30 дней (стабильная область; сдвинется, если фаза 9 или 11 изменят `attempt-sessions/access.ts` или порядок миграций)
