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
- Куки: `app/server/src/services/session/cookies.ts`; токены: `app/server/src/services/session/tokens.ts`; разбор сессии в запросе: `app/server/src/middleware/auth/session.ts`; маршруты: `app/server/src/routes/auth`.
- Ограничение попыток входа: `app/server/src/services/login-throttle`.

## Попытка теста

- `app/server/src/services/attempt-sessions`: доступ к попытке (`checkAttemptAccess`, `findVisibleTest`), старт и черновик сессии (`startAttemptSession`, `saveSessionDraft`), сдача (`precheckSubmit`, `submitAttempt`, `closeExpiredSession`).
- `app/server/src/services/scored-attempt`: оценка (`scoreSubmission`), хранимые факты, чтение результата (`readAttemptView`, `readAdminAttemptView`) и вид попытки (`buildAttemptView`).
- `testAttempts.results` читается только в `app/server/src/services/scored-attempt`; маршруты попытки не читают `answer_keys` и назначения напрямую: это держит `scripts/attempt-integrity-guards.test.mjs`.
- Маршруты: `app/server/src/routes/tests/public.ts` (ученик) и `app/server/src/routes/tests/index.ts`.

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
