---
name: bio-exam-api
description: Факты Express API bio-exam (app/server/src, packages/exam-core). Применять перед правкой маршрутов и сервисов сервера - доступ к тесту, теме, группе, пользователю или попытке, роли и зона учителя (zone.all, закреплённые разделы, свои группы, назначения), вход и сессии, старт и сдача попытки, содержимое вопросов и файлы хранилища, контракт exam-core, тесты известных дефектов.
---

# bio-exam api

Express владеет данными и политикой доступа (`docs/adr/0001-express-owns-data-and-access-policy.md`). Правило декомпозиции по понятиям: `docs/adr/0005-decompose-by-concept.md`.

## Доступ

- Права пользователя: `requestAccess(req)` и `hasPermission(req, key)` в `app/server/src/services/access-policy/index.ts`, один расчёт на запрос.
- Доступ к объекту решают только функции `app/server/src/services/access-policy/scope.ts`: `canReadTest`, `canWriteTest`, `canWriteTopic`, `canReviewAttempt`, `canReadUser`, `canManageCatalog`, `canManageGroup`, `canManageStudent`, `canAssign`, `canAssignMany`, `canAssistSignIn`, `hasGlobalZone`; фильтры списков `testScope`, `groupScope`, `userScope`. Новая проверка объекта добавляется туда, а не в маршрут.
- `requirePerm` и `requirePermKey` (`app/server/src/middleware/auth/requirePerm.ts`) закрывают раздел по ключу права; объектные маршруты проверяют доступ функциями `scope.ts`, а не `requirePerm`.
- Решения по строке роли (`'admin'`, `roles.includes(...)`) запрещены, разрешено только право из `@bio-exam/rbac`: это держит `scripts/auth-no-role-string-checks.test.mjs`.
- Пункты бокового меню: `GET /api/sidebar` требует сессию и отдаёт только пункты, которые пользователь может открыть (`canOpenPath` из `packages/rbac/src/sections.ts`); запись проходит схему `app/server/src/routes/sidebar/schema.ts` — адрес только `/…` или `http(s)://`.
- Настройки графиков: `GET /api/settings/charts` открыт любому вошедшему, `PUT` требует `settings.manage` (`app/server/src/routes/settings.ts`). Схемы и значения по умолчанию — `app/server/src/lib/charts/config.ts`: при чтении испорченное поле заменяется значением по умолчанию, запись проверяется строго; хранится одна строка `chart_settings` с `configs` (jsonb) по ключу графика.
- Адрес темы не может совпадать со статическими страницами банка (`RESERVED_TOPIC_SLUGS` в `packages/rbac/src/sections.ts`): `POST`/`PATCH /api/tests/topics` отвечают 400. Новая статическая страница прямо под `/admin/tests/` добавляется в этот список.

## Роли и зона учителя

- Роли `admin`, `teacher`, `user` («Ученик») в `packages/rbac/src/roles.ts`; персонал `STAFF_ROLE_KEYS`, роль ученика `STUDENT_ROLE_KEY`. Право `zone.all` (домен `zone` в `packages/rbac/src/domains.ts`) есть у `admin` и снимает ограничение зоной.
- Зона пользователя без `zone.all`: закреплённые разделы (`teacher_topics`) и группы, где он владелец (`student_groups.owner_id`). Тесты и попытки зоны - тесты и попытки этих разделов, ученики - участники этих групп.
- Зону читает загрузчик `ZoneLoader` (`app/server/src/services/access-policy/zone-loader.ts`) внутри `createAccessScope` (`app/server/src/services/access-policy/scope-rules.ts`): заново на каждом запросе, с мемоизацией на `Request` (`WeakMap`), без кэша между запросами. Ошибка загрузчика или проверки права пробрасывается, запрос без `req.authUser` получает `false` или пустую зону.
- Формула функции шва: нет права действия → `false`; `zone.all` → `true`; иначе объект в зоне. `canManageCatalog` = `tests.write` и `zone.all`. `canAssign` и пакетный `canAssignMany` требуют `tests.manage_assignments`, тест в разделе зоны и ученика своей группы. `canAssistSignIn` с `zone.all` требует `users.edit`, без него - `canManageStudent`.
- Списки: грубый гейт `requirePerm` в регистрации и фильтр зоны `testScope`, `groupScope` или `userScope` (`{ all: true }` или идентификаторы). Пустая зона - пустой список. Объектный маршрут без `requirePerm` первой строкой вызывает функцию шва: отказ - 403 до поиска объекта, затем 404.
- Ветвление «администратор или учитель» в маршруте - только `hasGlobalZone(req)`; литерала `zone.all` вне `app/server/src/services/access-policy` нет.
- Ученик - роль ученика, других ролей нет, allow-строк `rbac_user_grants` нет. Правило записано один раз SQL-фрагментом `studentOnlyFilter`.
- Таблицы зоны пишут только функции `app/server/src/services/access-policy/zone-store.ts`: `setTopicTeachers`, `setGroupOwner`, `releaseZone`; для показа - `topicTeachers`, `groupOwners`, `zoneOwnerCandidates`. Признаки ролей `ownsZone` и `groupMember`: `roleTraits` и `loadRoleTraits` в `app/server/src/services/access-policy/role-traits.ts`.
- Охранный тест `scripts/teacher-zone-guards.test.mjs`: таблицы зоны и `zone.all` только в шве, инвентарь маршрутов с их функциями шва. Новый маршрут доступа к объекту зоны добавляется в инвентарь теста.

## Вход и сессии

- Сессии входа: `app/server/src/services/session/index.ts` - `openSession`, `rotateRefreshToken` (исходы `rotated`, `reused` в окне `REFRESH_REUSE_WINDOW_MS`, `replay` с отзывом сессии, `rejected`), `revokeSession`, `revokeUserSessions`, `endSession`, `loadSessionUser`.
- Повтор израсходованного refresh-токена разбирает `classifyRepeat` под блокировкой строк преемников и сессии: преемник уже использован или предъявлен отозванный токен живой сессии → `replay`; повтор в окне или повторная выдача в окне → `reused` (только access); иначе ответ ротации считается потерянным: неиспользованные преемники отзываются, выдаётся новый refresh (`rotated` с `regranted: true`, событие `refresh_regrant` в журнале).
- Куки: `app/server/src/services/session/cookies.ts`; токены: `app/server/src/services/session/tokens.ts`; разбор сессии в запросе: `app/server/src/middleware/auth/session.ts`; маршруты: `app/server/src/routes/auth`.
- Ограничение попыток входа: `app/server/src/services/login-throttle`.

## Попытка теста

- `app/server/src/services/attempt-sessions`: доступ к попытке (`checkAttemptAccess`, `findVisibleTest`), старт и черновик сессии (`startAttemptSession`, `saveSessionDraft`), сдача (`precheckSubmit`, `submitAttempt`, `closeExpiredSession`).
- `app/server/src/services/scored-attempt`: оценка (`scoreSubmission`), хранимые факты, чтение результата (`readAttemptView`, `readAdminAttemptView`) и вид попытки (`buildAttemptView`); он же отвечает за итог попытки.
- Итог считает `computeAttemptOutcome` и `projectionOf` из `packages/exam-core/src/outcome.ts`: статус проверки `none`, `pending` (есть открытый вопрос без оценки, итог `NULL`) или `graded`. Проекцию пишет единственный писатель `materializeAttemptOutcome` (`app/server/src/services/scored-attempt/outcome.ts`), хранение проекции сверяет с пересчётом `reconcileOutcomes` там же.
- Читатели берут поля результата только через `attemptResultColumns` (Drizzle) и `attemptResultSql` (сырой SQL с алиасом) из `app/server/src/services/scored-attempt/columns.ts`, не из фактовых столбцов. Агрегаты (средний балл, «пройдено», график) условием `review_status <> 'pending'` явно исключают попытки на проверке.
- Сдача и черновик отвечают `ANSWERS_INVALID`: на сдаче 422, на черновике 400, тело несёт `reason` (`foreign_question`, `short_text_too_long`, `open_text_too_long`, `unknown_question_type`) и `limit`. Пределы ответов - `packages/exam-core/src/answer-limits.ts`.
- Вопрос ученику собирает `studentQuestionView` (`app/server/src/routes/tests/student-question-view.ts`) по белому списку полей: ключ и пояснение в ответ ученику не попадают.
- Шесть шаблонов вопросов: `single_choice`, `multi_choice`, `matching`, `short_text`, `sequence_digits`, `open`. Тип `open` засеян неактивным, оценивает его учитель (0-3 балла); сервер запрещает включить его, переписать его правило и создать кастомный тип с шаблоном `open`. Запрет живёт в `app/server/src/routes/tests/admin/question-types.ts`, запрет правила для теста - в `validateScoringRuleTemplateCompatibility` из `app/server/src/routes/tests/admin/shared.ts`; их снимают при включении открытых вопросов (фаза 17).
- `testAttempts.results` читается только в `app/server/src/services/scored-attempt`; маршруты попытки не читают `answer_keys` и назначения напрямую: это держит `scripts/attempt-integrity-guards.test.mjs`.
- Маршруты: `app/server/src/routes/tests/public.ts` (ученик); дашборд, список попыток и разбор попытки у персонала - `app/server/src/routes/tests/admin/attempts.ts`.

## Уведомления

- Модуль `app/server/src/services/notifications`, вход `index.ts`; про `Request` не знает: права на объект ему передаёт маршрут.
- Запись - `recordNotification` и `recordNotifications` (`record.ts`), только внутри транзакции причины (`NotificationTx`): откат причины откатывает событие. Повтор той же причины (`dedupe_key` у получателя) поднимает `ref_seq` и `last_event_at` той же строки и снова делает её непрочитанной, второй строки нет.
- Каналы доставки - `DELIVERY_CHANNELS` в `channels.ts` (сейчас один, `inbox`); каждое событие получает строку `notification_deliveries` по каждому каналу в той же транзакции.
- Производитель `test.assigned` (`app/server/src/services/notifications/producers/test-assigned.ts`): `addAssignments` (`app/server/src/routes/tests/assignments.ts`) для всех трёх путей назначения в одной транзакции вставляет назначения и вызывает `recordTestAssigned` только для вставленных строк и только для видимого теста (опубликован, тема активна). Назначение на черновик события не создаёт.
- Публикация: `updateTestSettings` (`app/server/src/services/question-content/relocate.ts`) при переходе `is_published` из false в true в своей транзакции вызывает `recordTestPublished`: событие всем уже назначенным с тем же `dedupe_key`. Включение темы событий не создаёт.
- Таблица видов - `kinds.ts`: на вид запись с текстом строки и обработчиком `open`. Неизвестный вид показывается как «Новое уведомление», его `open` отвечает `NO_ACCESS`. Новый вид - запись в `kinds.ts` и производитель в транзакции причины.
- Маршруты `app/server/src/routes/notifications.ts`: `GET /api/notifications` (курсор, `limit` до 50), `GET /api/notifications/unread-count`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read`, `GET /api/notifications/:id/open`. Все читают и меняют только события текущего пользователя (`ownedBy` в `read.ts`).
- `open` отмечает событие прочитанным и заново проверяет доступ: обработчик вида в `kinds.ts` вызывает `checkAttemptAccess` из `attempt-sessions`, а `canReadTest(req, testId)` ему передаёт маршрут. Ответ - `{ href }` или 403 `{ error: 'NO_ACCESS' }` без данных объекта.

## Маршруты тестов

- `/api/tests` собирает `app/server/src/routes/tests/index.ts`: только импорты, `Router()`, `router.use(...)` по порядку и `export default router`, без обработчиков и импортов базы, `drizzle-orm`, хранилища и `services/question-content`. Это держит `scripts/tests-router-composition.test.mjs`.
- Маршруты персонала - суброутеры `app/server/src/routes/tests/admin/`, один файл на понятие: `topics.ts`, `tests-list.ts`, `question-types.ts`, `scoring-rules.ts`, `tests-by-slug.ts`, `question-drafts.ts`, `tests-core.ts`, `questions.ts`, `tests-delete.ts`, `assets.ts`, `export.ts`, `attempts.ts`. В файле локальный `const router = Router()`, полные пути от `/api/tests` и `export { router as <имя>Router }`; общие помощники - `app/server/src/routes/tests/admin/shared.ts`. Новый суброутер монтируется в `index.ts`, иначе падает `scripts/tests-router-composition.test.mjs`.
- Назначения теста - `app/server/src/routes/tests/assignments.ts`, монтируется как `/:testId/assignments` между `export.ts` и `attempts.ts`. Маршруты ученика - `app/server/src/routes/tests/public.ts`, монтируется в `app/server/src/routes/index.ts` после `/tests`.
- Порядок `router.use(...)` значим: `GET /:id` с `validateUUID` отвечает 400 на любой односегментный путь, зарегистрированный после него (`/topics`, `/question-types`, `/scoring-rules`). Порядок держит снимок `app/server/route-inventory.txt`: после правки маршрута или middleware снимок перегенерирует `routes:inventory` (`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory`), перенос без изменения поведения проверяет `routes:inventory --check`.
- ZIP-экспорт: обработчики `app/server/src/routes/tests/admin/export.ts` вызывают `prepareTestArchive` или `prepareTopicArchive`, доставку делает `sendArchive` из `app/server/src/routes/tests/export-response.ts` поверх `streamArchive` и `archiveToBuffer` из `app/server/src/services/question-content/export.ts`. Потоковое ядро архива - `app/server/src/services/storage/zip.ts`. Файлы `app/server/src/routes/tests` не импортируют `services/storage`.

## Содержимое вопроса и файлы

- `app/server/src/services/question-content`: создание и правка вопроса (`createQuestion`, `updateQuestion`), чтение (`readAdminTest`, `readQuestionMarkdown`), перенос и переупорядочивание, удаление, экспорт архива, индекс ссылок на картинки (`indexQuestionAssets`, `assetUsage`), сверка хранилища (`reconcileStorage`). Маршруты содержимого вызывают этот модуль.
- Файлы - только через `storage()` из `app/server/src/services/storage/index.ts`: модуль `StorageModule` поверх порта `StorageAdapter` (`app/server/src/services/storage/port.ts`). Адаптеры: `local`, `supabase` и `memory` в `app/server/src/services/storage/adapters`; `memory` работает только при `BIO_EXAM_ISOLATED_ENV=1`, `supabase` в этом режиме запрещён (`docs/adr/0004-storage-port-two-adapters.md`).
- Ключи живут в пространствах `images/`, `topics/`, `avatars/` (`app/server/src/services/storage/keys.ts`); файл отдаётся маршрутом `storageUrl(key)` → `/api/docs/assets/proxy?path=...`.
- Маршруты не импортируют `fs`, не собирают литералы ключей `topics/` и `avatars/`; `app/server/src/routes/tests` работает с файлами через `app/server/src/services/question-content`, без прямого импорта хранилища: это держит `scripts/storage-no-private-access.test.mjs`.

## exam-core как контракт HTTP

- Шаблоны вопросов, оценка, схемы ответов, сессии и результата попытки, коды ошибок сдачи живут в `packages/exam-core/src` (`docs/adr/0002-shared-exam-core-package.md`). Тело запроса сервер разбирает схемой оттуда (`SaveAttemptDraftRequestSchema`, `SubmitAttemptRequestSchema`, `SUBMIT_ERROR_CODES`), web берёт оттуда те же схемы и типы.
- Приватные копии логики шаблона в `app/web` и `app/server/src` ловит `scripts/exam-core-no-private-copies.test.mjs`.
- Пакет потребляется из `packages/exam-core/dist`: `yarn test` и `yarn typecheck` собирают его сами, перед отдельным `yarn workspace @bio-exam/server test` после правки пакета нужен `yarn workspace @bio-exam/exam-core build`.

## Известные дефекты

- Характеризационный тест (`*.characterization.test.ts`) объявляет `KNOWN_DEFECTS = new Set<string>(...)` и функцию `defectTest(id, title, fn)`: id из набора запускается как `test.fails`, остальные как `test`. Образец: `app/server/src/services/storage/storage-known-defects.test.ts`.
- Исправленный дефект убирается из `KNOWN_DEFECTS`, тест становится обычным.

```bash
yarn workspace @bio-exam/server test
node scripts/with-test-db.mjs yarn workspace @bio-exam/server test
yarn workspace @bio-exam/server typecheck
yarn workspace @bio-exam/exam-core test
```
