---
phase: 10-notification-journal-and-bell
verified: 2026-10-06T07:34:42Z
status: passed
score: 8/8 must-haves verified (criterion 3 wording resolved by the user, D-09; human items in 10-UAT.md)
covered_files:
  - .agents/skills/bio-exam-api/SKILL.md
  - .agents/skills/bio-exam-data/SKILL.md
  - .agents/skills/bio-exam-web/SKILL.md
  - .planning/phases/10-notification-journal-and-bell/10-01-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-01-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-02-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-02-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-03-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-03-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-04-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-04-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-05-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-05-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-06-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-06-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-07-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-07-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-08-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-08-SUMMARY.md
  - .planning/phases/10-notification-journal-and-bell/10-09-PLAN.md
  - .planning/phases/10-notification-journal-and-bell/10-09-SUMMARY.md
  - app/server/README.md
  - app/server/drizzle/0027_notification_journal.sql
  - app/server/drizzle/meta/0027_snapshot.json
  - app/server/drizzle/meta/_journal.json
  - app/server/drizzle/migrations-manifest.json
  - app/server/route-inventory.txt
  - app/server/src/db/schema.ts
  - app/server/src/db/user-deletion-rule.test.ts
  - app/server/src/routes/index.ts
  - app/server/src/routes/notification-open.test.ts
  - app/server/src/routes/notifications.test.ts
  - app/server/src/routes/notifications.ts
  - app/server/src/routes/tests/assignment-notifications.test.ts
  - app/server/src/routes/tests/assignments.ts
  - app/server/src/routes/tests/publish-notifications.test.ts
  - app/server/src/routes/users/index.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/src/services/notifications/channels.ts
  - app/server/src/services/notifications/cursor.ts
  - app/server/src/services/notifications/index.ts
  - app/server/src/services/notifications/kinds.ts
  - app/server/src/services/notifications/notifications.test.ts
  - app/server/src/services/notifications/open.ts
  - app/server/src/services/notifications/producers/test-assigned.ts
  - app/server/src/services/notifications/read.ts
  - app/server/src/services/notifications/record.ts
  - app/server/src/services/question-content/order.ts
  - app/server/src/services/question-content/relocate.ts
  - "app/web/app/(internal)/(protected)/notifications/[id]/NotificationOpenClient.tsx"
  - "app/web/app/(internal)/(protected)/notifications/[id]/page.tsx"
  - app/web/components/AppLayout/AppLayout.tsx
  - app/web/components/auth/AccessDeniedState.tsx
  - app/web/components/notifications/NotificationBell.tsx
  - app/web/components/notifications/NotificationList.tsx
  - app/web/components/notifications/NotificationListSkeleton.tsx
  - app/web/components/notifications/UnreadTitlePrefix.tsx
  - app/web/lib/navigation/crumbs.test.ts
  - app/web/lib/navigation/crumbs.ts
  - app/web/lib/navigation/paths.test.ts
  - app/web/lib/navigation/paths.ts
  - app/web/lib/notifications/api.test.ts
  - app/web/lib/notifications/api.ts
  - app/web/lib/notifications/format.test.ts
  - app/web/lib/notifications/format.ts
  - app/web/lib/notifications/time.test.ts
  - app/web/lib/notifications/time.ts
  - e2e/fixtures/seed.json
  - e2e/tests/notifications.spec.ts
  - scripts/check-migrations.mjs
covered_digest: "v2:sha256:98d53e09c8fb1a721d78a238ffd24b35b001df41550dffaebb34d3e0cc93b2f4"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Решить судьбу примера «student left the group» в критерии успеха 3 ROADMAP"
    expected: "Пользователь либо принимает D-09 (доступ к тесту даёт строка test_assignments, членство в группе правом доступа не является) и добавляет override из раздела «Пробелы», либо решает, что выход из группы должен снимать доступ, и тогда это новая работа для следующей фазы"
    why_human: "D-09 принято в автономном режиме ([авто]), пользователь это расхождение с контрактом ROADMAP не утверждал; код и тест notification-open.test.ts «group leave keeps access while the assignment exists (D-09)» намеренно оставляют доступ после выхода из группы"
  - test: "Выкатка миграции 0027 на прод по шагам пользователя из 10-08-SUMMARY.md («Шаги пользователя»), затем назначить тест пробному ученику"
    expected: "Миграция 0027 применена (совместно с 0026, если прод ещё не на 0026), у пробного ученика в шапке колокольчик с числом 1 и префикс «(1) » во вкладке; GET /api/notifications/unread-count не отвечает 500"
    why_human: "Прод и сервер агенту недоступны; образ без 0027 ломает маршруты назначения и число в шапке у всех пользователей"
  - test: "Просмотреть колокольчик, поповер и экран «Нет доступа к материалу» глазами на 375, 768 и 1280 px"
    expected: "Вид соответствует 10-UI-SPEC.md; e2e уже проверяет переполнение, контраст, перенос длинного названия и фокус"
    why_human: "Внешний вид и ощущение интерфейса автоматикой не оцениваются"
  - test: "Подтвердить 12 запретов планов (prohibitions уровня judgment), список и вердикт верификатора — в разделе «Запреты планов»"
    expected: "Все запреты соблюдены; вердикт верификатора не авторитетный"
    why_human: "unverified-prohibition — human review recommended: запреты без test-уровня проверяются суждением"
---

# Фаза 10: журнал уведомлений и колокольчик — отчёт верификации

**Цель фазы:** у вошедших пользователей есть общий журнал уведомлений (его потом переиспользуют чаты и push), колокольчик в шапке, число непрочитанных и глубокие ссылки, которые заново проверяют доступ.
**Проверено:** 2026-10-06T07:34:42Z
**Статус:** passed (пользователь подтвердил D-09, критерий 3 ROADMAP переписан; ручные пункты закрыты в 10-UAT.md)
**Повторная верификация:** нет, первичная

## Что запущено верификатором

| Проверка | Команда | Результат |
| --- | --- | --- |
| Серверные тесты фазы (6 файлов, включая каталог удаления пользователя) | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server vitest run …notifications… user-deletion-rule.test.ts` | 6 файлов, 83 теста passed (логи ошибок в выводе — ожидаемые, от тестов с триггером сбоя записи) |
| Юнит-тесты web | `yarn workspace @bio-exam/web vitest run lib/notifications lib/navigation` | 7 файлов, 107 тестов passed |
| Цепочка миграций | `node scripts/with-test-db.mjs node scripts/check-migrations.mjs` | `check-migrations: OK` (chain-vs-schema, idempotency, generate-no-diff, drizzle-check) |
| Ворота репозитория | `yarn verify` | `yarn verify: OK`, код 0; server 97 файлов, web 95, exam-core 15, rbac 1 |
| e2e фазы | `yarn e2e tests/notifications.spec.ts` | 66 passed (57,5 s), код 0, chromium-desktop и chromium-mobile |
| Бюджет редактора | `yarn editor:budget` (по сборке web из прогона e2e) | `editor bundle OK` |
| Полный e2e | `yarn e2e` | 348 passed (5,7 мин), код 0, без failed и flaky; question-draft-durability, упавший у исполнителя 10-08 в первом прогоне, прошёл |

Рабочее дерево после прогонов не изменилось (`git status`: только неотслеживаемый `docs/adr/0006-…`, вне фазы).

## Достижение цели

### Наблюдаемые истины

| # | Истина | Статус | Доказательство |
| --- | --- | --- | --- |
| 1 | КУ-1: учитель назначает тест ученику напрямую или через группу; ученик видит число на колокольчике («9+» больше девяти), открывает список, переходит по строке к тесту, строка становится прочитанной; «Прочитать все» снимает число | ✓ VERIFIED | Три пути назначения вызывают одну `addAssignments` (`routes/tests/assignments.ts:46-63`, `:134`, `:173`; `routes/users/index.ts:424`), событие пишется в той же `db.transaction`. Сервер: «учитель назначает тест своей группе: событие с actor_id учителя», «групповое назначение пишет события только вставленным ученикам», «назначение из профиля пишет событие» — passed. Web: `NotificationBell` в `AppLayout.tsx` перед `SearchButton`, `badgeLabel` даёт «9+». e2e passed: «a test assigned through the API shows 1…», «a row opens the assigned test, the number goes away…», «more than nine unread shows 9+…», ««Прочитать все» clears the number, the dots and the tab prefix…». Назначает в e2e администратор через API; путь учителя доказан серверным тестом |
| 2 | КУ-2: заголовок вкладки показывает число; число обновляется после входа, при фокусе вкладки и периодически без перезагрузки | ✓ VERIFIED | `UnreadTitlePrefix` с `MutationObserver` и `withTitlePrefix`; SWR-ключ `notifications/unread-count/<userId>` (запрос только при `me`), `refreshInterval: 60_000`, `refreshWhenHidden: false`, `revalidateOnFocus: true`. e2e passed: «reassignment updates the bell on tab focus», «periodic refresh updates the bell without focus» (часы Playwright, без reload и focus), «the tab title keeps one prefix after a client-side navigation», первая загрузка `/dashboard` под свежей сессией из `auth.setup.ts`. Вход через форму в e2e не выполняется; ключ зависит от `me.id`, поэтому смена пользователя даёт новый запрос |
| 3 | КУ-3 (потеря права через снятие назначения, снятие публикации, отключение темы, удаление теста): ссылка ведёт на понятное «нет доступа» и ничего не раскрывает об объекте | ✓ VERIFIED | `openNotification` (`services/notifications/open.ts`) отмечает прочтение и вызывает обработчик вида; для `test.assigned` — `checkAttemptAccess` (`kinds.ts:32-41`); маршрут отвечает ровно `403 { error: 'NO_ACCESS' }`. Тесты passed: «снятие назначения даёт отказ…», «снятие публикации даёт отказ…», «отключённая тема даёт отказ», «удаление теста оставляет событие и даёт отказ», «чужое, несуществующее и неверное по формату событие дают один отказ». e2e passed: «after the assignment is removed the row leads to «Нет доступа к материалу»» с проверкой, что в `main` нет названия теста; «a foreign href from the server is not followed» |
| 4 | КУ-3 (пример «student left the group»): после выхода ученика из группы ссылка даёт «нет доступа» | ? UNCERTAIN | По коду не выполняется намеренно: групповое назначение разворачивается в строки `test_assignments` на каждого ученика, доступ проверяется по строке, выход из группы её не удаляет. Тест «group leave keeps access while the assignment exists (D-09)» закрепляет 200 с `href`. Расхождение описано в D-09 (решение [авто]) и в 10-04/10-08-SUMMARY; пользователь его не утверждал. Нужно его решение (см. «Проверка человеком», пункт 1) |
| 5 | КУ-4: событие пишется в транзакции причины; откат причины не оставляет события; повтор запроса или повторная причина дают ровно одно событие на получателя и объект (серверный тест) | ✓ VERIFIED | `recordNotification(s)` принимают только `NotificationTx`; `UNIQUE (recipient_id, dedupe_key)` + `ON CONFLICT DO UPDATE` (`record.ts:54-63`), дедупликация пакета до INSERT. Тесты passed: «откат транзакции причины не оставляет ни события, ни доставки», «откат причины откатывает событие», «сбой записи события откатывает назначение в маршруте» (триггер на `notification_events`, ответ 500, назначения нет), «сбой записи события откатывает публикацию» (обе ветви), «два одинаковых параллельных назначения оставляют одно событие», «повтор запроса не даёт события; назначение после снятия поднимает ref_seq…», «пакет с повторяющейся парой…» |
| 6 | КУ-5: журнал хранит и выводит событие неизвестного вида; у доставок поля повтора и аренды; у событий ключ схлопывания | ✓ VERIFIED | Миграция `0027_notification_journal.sql`: `kind text NOT NULL` без CHECK и enum, `collapse_key text`, `notification_deliveries` с `attempts`, `next_attempt_at`, `lease_until`, `last_error`, `status`, `UNIQUE (event_id, channel)`; каналы — список `DELIVERY_CHANNELS` в коде. Тесты passed: «неизвестный вид хранится как есть, у доставки поля повтора и аренды пусты» (`chat.message`, `collapse_key`), «текст строки в списке: неизвестный вид» → «Новое уведомление», «неизвестный вид даёт отказ и отмечается прочитанным» |
| 7 | D-18 (решение пользователя): назначение на черновик или тест в выключенной теме события не даёт; публикация пишет `test.assigned` всем уже назначенным в своей транзакции; гонка с назначением событие не теряет | ✓ VERIFIED | `visibleTestTitle` с `FOR SHARE` по `tests` (`producers/test-assigned.ts:12-22`); `recordTestPublished` в обеих ветвях `updateTestSettings` при `shouldIncrementVersion` (`relocate.ts:499`, `:550`); после 3cdc44c параллельное снятие публикации даёт 409 (`eq(tests.isPublished, existingTest.isPublished)`, `lockPlannedTest`). Тесты passed: 9 тестов `publish-notifications.test.ts`, в том числе детерминированная гонка с отдельным клиентом; «неопубликованный тест: назначение есть, события нет…». e2e passed: «assignment to a draft notifies only after publication (D-18)» |
| 8 | Ворота фазы (10-08): check-migrations, `yarn verify: OK`, сборка web и `editor:budget`, полный `yarn e2e` | ✓ VERIFIED | См. таблицу «Что запущено верификатором» |

**Счёт:** 7/8 истин подтверждены (0 — present, behavior-unverified). Истина 4 ждёт решения пользователя.

Плановые истины 10-01…10-09 (схема 0027, белый список полей item, курсор с микросекундами, единый 404 и NO_ACCESS, `ownedBy` во всех запросах, плюрализация имени колокольчика, состояния списка, страница `/notifications/[id]`, крошки, навыки и README) сверены с кодом и покрыты перечисленными тестами; расхождений с кодом не найдено. Истины с пометкой `verification: backstop` (375 px без переполнения, один префикс после клиентского перехода, поповер в окне на трёх ширинах, длинное название, контраст числа и точки) подтверждены прошедшими у верификатора e2e-тестами с теми же названиями.

### Обязательные артефакты

| Артефакт | Назначение | Статус | Подробности |
| --- | --- | --- | --- |
| `app/server/drizzle/0027_notification_journal.sql` | таблицы журнала и доставок | ✓ VERIFIED | первая строка `SET LOCAL lock_timeout = '5s'`, без DROP/RENAME/ALTER COLUMN, RLS и `deny_direct_access` на обеих таблицах, три индекса по D-03 |
| `app/server/src/services/notifications/record.ts` | запись в транзакции | ✓ VERIFIED | используется производителями и сидом e2e |
| `app/server/src/services/notifications/channels.ts` | `DELIVERY_CHANNELS` с `inbox` | ✓ VERIFIED | вызывается из `record.ts:66` |
| `app/server/src/services/notifications/producers/test-assigned.ts` | `recordTestAssigned`, `recordTestPublished` | ✓ VERIFIED | вызываются из `assignments.ts:60`, `relocate.ts:499,550` |
| `app/server/src/services/notifications/{read,cursor,kinds,open}.ts` | чтение, курсор, виды, открытие | ✓ VERIFIED | подключены через `index.ts` в `routes/notifications.ts` |
| `app/server/src/routes/notifications.ts` | пять маршрутов под `sessionRequired()` | ✓ VERIFIED | смонтирован в `routes/index.ts`, есть в `route-inventory.txt` |
| `app/web/components/notifications/NotificationBell.tsx` | колокольчик и число | ✓ VERIFIED | в `AppLayout.tsx` |
| `app/web/components/notifications/UnreadTitlePrefix.tsx` | префикс вкладки | ✓ VERIFIED | рендерится из `NotificationBell` |
| `app/web/components/notifications/NotificationList.tsx`, `NotificationListSkeleton.tsx` | список, «Показать ещё», состояния | ✓ VERIFIED | `next/dynamic` в `PopoverContent` |
| `app/web/app/(internal)/(protected)/notifications/[id]/{page,NotificationOpenClient}.tsx` | страница перехода | ✓ VERIFIED | `openNotification` один раз за показ, `router.replace`, `AccessDeniedState` |
| `app/web/lib/notifications/{api,format,time}.ts` | разбор ответов, формат, время | ✓ VERIFIED | `isInternalHref` после 3cdc44c отвергает `//`, `/\` и управляющие символы |
| `e2e/tests/notifications.spec.ts` | сквозные проверки КУ-1…3 | ✓ VERIFIED | 26 тестов × 2 проекта, 66 passed с setup |

### Проверка связей

| Откуда | Куда | Через | Статус |
| --- | --- | --- | --- |
| `record.ts` | `channels.ts` | цикл по `DELIVERY_CHANNELS` | WIRED |
| `routes/tests/assignments.ts` (`addAssignments`) | `services/notifications` | `recordTestAssigned(tx, …)` в `db.transaction` | WIRED |
| `routes/users/index.ts` | `routes/tests/assignments.ts` | `addAssignments` | WIRED |
| `services/question-content/relocate.ts` | `services/notifications` | `recordTestPublished(tx, …)` в обеих ветвях | WIRED |
| `routes/index.ts` | `routes/notifications.ts` | `router.use('/notifications', …)` | WIRED |
| `read.ts` | `kinds.ts` | `notificationText(kind, params)` | WIRED |
| `kinds.ts` | `attempt-sessions` | `checkAttemptAccess` | WIRED |
| `routes/notifications.ts` | `access-policy` | `canReadTest(req, testId)` | WIRED |
| `AppLayout.tsx` | `NotificationBell.tsx` | `<NotificationBell />` перед `<SearchButton />` | WIRED |
| `NotificationBell.tsx` | `UnreadTitlePrefix.tsx`, `NotificationList.tsx` | одно число SWR; `dynamic(…)` | WIRED |
| `NotificationList.tsx` | `/notifications/[id]` | `Link` с `prefetch={false}` | WIRED |
| `NotificationOpenClient.tsx` | `lib/notifications/api.ts` | `openNotification(id)`, `refreshNotifications()` | WIRED |
| `e2e-seed.ts` | `services/notifications` | `recordNotifications` в транзакции сида | WIRED |
| `_journal.json` | `migrations-manifest.json` | запись 27 с тем же `tag`, `when`, `breakpoints` | WIRED (diff — только добавления) |

### Поток данных (уровень 4)

| Артефакт | Данные | Источник | Реальные данные | Статус |
| --- | --- | --- | --- | --- |
| `NotificationBell` | `count` | `GET /api/notifications/unread-count` → `countUnread` (`count(*)` по `notification_events` с `read_at IS NULL`) | да | ✓ FLOWING |
| `NotificationList` | `items`, `nextCursor` | `GET /api/notifications` → `listNotifications` (SELECT с курсором) | да | ✓ FLOWING |
| `NotificationOpenClient` | `href` / NO_ACCESS | `GET /api/notifications/:id/open` → `openNotification` → `checkAttemptAccess` | да | ✓ FLOWING |
| `UnreadTitlePrefix` | `prefix` | `count` из `NotificationBell` | да | ✓ FLOWING |

### Требования

| Требование | План | Описание | Статус | Доказательство |
| --- | --- | --- | --- | --- |
| NOTIF-01 | 10-01, 10-02, 10-08, 10-09 | журнал по получателям (вид, субъект, ссылка, отметка прочтения, доставка по каналам), запись в транзакции причины, повторы без дублей | ✓ SATISFIED | истины 5, 6, 7; ссылка не хранится, её строит обработчик вида при открытии (D-02) |
| NOTIF-02 | 10-03…10-08 | колокольчик с числом («9+»), список, прочтение при открытии, «прочитать все», повторная проверка доступа по ссылке | ✓ SATISFIED | истины 1, 3 |
| NOTIF-05 | 10-05, 10-08 | число в заголовке вкладки | ✓ SATISFIED | истина 2 |
| NOTIF-06 | 10-01, 10-03, 10-04 | новые каналы и виды без изменения существующих строк | ✓ SATISFIED | истина 6 |
| NOTIF-03 (частично, folded-in) | 10-02, 10-09 | производитель «тест назначен» | частично, по плану | остальные события NOTIF-03 — фаза 15; не пробел и не сирота |

Сирот нет: REQUIREMENTS.md отображает на фазу 10 ровно NOTIF-01, 02, 05, 06, все заявлены в планах. В таблице трассировки REQUIREMENTS.md они пока «Pending»: статус обновляет оркестратор.

### Запреты планов (judgment, вердикт не авторитетный)

Флаг: unverified-prohibition — human review recommended.

| План | Запрет | Вердикт верификатора |
| --- | --- | --- |
| 10-01 | применённые 0000…0026 и их записи журнала и манифеста не меняются; без `push` | соблюдён: diff `_journal.json` и манифеста — только добавление записи 27; файлы 0000…0026 не в diff; `check-migrations` зелёный |
| 10-02 | сиды и фикстуры пишут `test_assignments` напрямую без событий; модуль уведомлений читает `test_assignments` только в `recordTestPublished` | соблюдён: `e2e-seed.ts:292` вставляет напрямую; единственное чтение — `producers/test-assigned.ts:57-60` |
| 10-05 | тёмная тема не настраивается | соблюдён по коду (нет `dark:` в новых компонентах) |
| 10-05 | `app/layout.tsx`, `components/ui/*`, `SearchButton`, отступы шапки не меняются; новых npm-пакетов нет | соблюдён: файлов нет в diff, `package.json` и `yarn.lock` не менялись |
| 10-05, 10-06 | бюджет `editor-bundle-budget.json` не поднимается | соблюдён: файла нет в diff, `editor bundle OK` |
| 10-06 | нет кнопки «прочитать» у строки, UI не вызывает `POST /:id/read`; нет стрелочной навигации; без `ScrollArea` и `Badge` | соблюдён: grep по web-файлам фазы пуст |
| 10-07 | `AccessDeniedState` меняется только необязательным `headingRef`; `LoadErrorAlert` и `components/ui/*` не меняются | соблюдён: diff — только `headingRef`, `tabIndex`, `outline-none` при наличии ref |
| 10-08 | формулировка КУ-3 в ROADMAP не правится, расхождение с D-09 записано в SUMMARY | соблюдён: ROADMAP без правок КУ-3, раздел в 10-04 и 10-08-SUMMARY |
| 10-08 | в навыках нет новых команд yarn и истории изменений | соблюдён по шагу `docs-commands` в `yarn verify`; «без истории» — суждение |
| 10-09 | в модуле `test_assignments` читает только `recordTestPublished` | соблюдён |
| 10-09 | `createTestWithQuestions` и `createReceiver` производителя не вызывают | соблюдён: `recordTest*` вызывается только из `assignments.ts` и `relocate.ts` |

### Антипаттерны

| Файл | Строка | Шаблон | Серьёзность | Влияние |
| --- | --- | --- | --- | --- |
| файлы фазы | — | TBD/FIXME/XXX/TODO/HACK/placeholder | — | не найдено |
| `routes/tests/assignments.ts` | 46 | оркестрация «назначение + событие» в файле маршрута (IN-02 ревью, deferred) | ℹ️ Info | `routes/users` импортирует функцию из файла маршрута; перенос отложен до следующей правки назначений |
| `app/server/src/db/schema.ts` (`notification_events.subject_id`) | — | `subject_id uuid NOT NULL` | ℹ️ Info | будущий вид с субъектом не-uuid потребует изменения типа столбца; для чатов с uuid-идентификаторами не мешает |
| `app/server/src/scripts/e2e-seed.ts` | — | порядок 21 события сида зависит от случайного uuid (deferred-items) | ℹ️ Info | спеки от порядка не зависят |

### Проверка человеком

1. **Пример «student left the group» в КУ-3.**
   **Сделать:** решить, принимается ли D-09.
   **Ожидание:** при согласии добавить override (текст ниже); при несогласии завести работу «выход из группы снимает групповые назначения» в будущую фазу.
   **Почему человек:** D-09 принято автономно; это продуктовое решение о модели доступа, не дефект реализации.

2. **Выкатка 0027.**
   **Сделать:** шаги пользователя из `10-08-SUMMARY.md` («Шаги пользователя»), после выкатки назначить тест пробному ученику.
   **Ожидание:** колокольчик с числом 1 и префикс вкладки, `unread-count` не отвечает 500.
   **Почему человек:** прод агенту недоступен.

3. **Внешний вид колокольчика, поповера и экрана отказа.**
   **Сделать:** открыть на 375, 768 и 1280 px.
   **Ожидание:** соответствие 10-UI-SPEC.md.
   **Почему человек:** e2e меряет переполнение и контраст, но не оценивает вид.

4. **Запреты планов.** Подтвердить вердикты таблицы «Запреты планов».

### Пробелы

Блокирующих пробелов нет. Единственная неподтверждённая истина (4) — расхождение формулировки ROADMAP с принятой моделью доступа, а не отсутствие кода. Если пользователь принимает D-09, добавить во frontmatter этого файла:

```yaml
overrides:
  - must_have: "A deep link opened after the right to the object is gone (assignment revoked, student left the group) leads to a clear \"no access\" message and reveals nothing about the object."
    reason: "Доступ к тесту даёт строка test_assignments; групповое назначение разворачивается в строки на каждого ученика, членство в группе правом доступа не является (D-09). Потеря права доказана снятием назначения, снятием публикации, отключением темы и удалением теста; выход из группы права не снимает."
    accepted_by: "{имя}"
    accepted_at: "{ISO timestamp}"
```

Поздние фазы вехи выход из группы как потерю права не покрывают, поэтому отложенных пунктов нет.

---

_Проверено: 2026-10-06T07:34:42Z_
_Верификатор: Claude (gsd-verifier)_
