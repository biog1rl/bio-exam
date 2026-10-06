---
phase: 08-client-requests-runtime-and-decomposition
plan: 11
subsystem: web
tags: [http, swr, users, D7, SEC-07, HTTP-02, HTTP-03, HTTP-04]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: модуль запросов lib/http, fetcherWith, LoadErrorAlert, requestBlob, hasZipEndOfCentralDirectory, exportFailureMessage
  - phase: 08-05
    provides: serverRequest и requireServerData в lib/session/server.ts
  - phase: 08-06
    provides: GET /api/users/:id и GET /api/users/by-login/:login с конвертом { user }
provides:
  - доменный слой пользователей app/web/lib/users/api.ts (usersKeys, parseUserEnvelope, фетчеры, действия страницы ученика)
  - admin-слой тестов app/web/lib/tests/admin-api.ts (adminTestsKeys, parseAdminTestsList, adminTestsListFetcher, exportTestArchive, exportTopicArchive с проверкой конца архива)
  - /admin/users/[id] на serverRequest, /profile/<login> на GET /api/users/by-login
  - удалён lib/http/absoluteUrl.ts и ключи APP_ORIGIN, NEXT_PUBLIC_APP_ORIGIN
  - 110 массовых пользователей в сиде e2e и сценарий e2e/tests/user-lookup.spec.ts
affects: [08-13, 08-15, 08-16, 08-18, 08-19, 08-20, 08-23, 08-28]

actuals:
  tokens: 11400
  tasks: 3
  commits: 0
plan_head_before: b91f4888c96b97b5f8ad0d4e712b203f1c513d84
plan_head_after: b91f4888c96b97b5f8ad0d4e712b203f1c513d84

tech-stack:
  added: []
  patterns:
    - "Ключ пользователя по логину — usersKeys.byLogin(login) с encodeURIComponent; страница передаёт логин из адреса как есть, нормализует сервер"
    - "Карточка страницы ученика получает список источников { data, error, mutate }; блок ошибки — по источникам с error и data === undefined, «Повторить» перезапрашивает только их"
    - "Экспорт admin-слоя: requestBlob, затем hasZipEndOfCentralDirectory; усечённый архив — { ok: false, kind: 'network', status: 200, message: 'Не удалось скачать архив. Попробуйте ещё раз.' }"

key-files:
  created:
    - app/web/lib/users/api.ts
    - app/web/lib/users/api.test.ts
    - app/web/lib/tests/admin-api.ts
    - app/web/lib/tests/admin-api.test.ts
    - e2e/tests/user-lookup.spec.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx
    - app/web/components/users/UserProfileAssignmentsPage.tsx
    - app/web/.env.example
    - scripts/lib/e2e-web-env.mjs
    - scripts/lib/e2e-web-env.test.mjs
    - e2e/fixtures/seed.json
    - app/server/src/scripts/e2e-seed.ts
  deleted:
    - app/web/lib/http/absoluteUrl.ts

key-decisions:
  - "parseUserEnvelope принимает login: null: иначе пользователь без логина на /admin/users/[id] давал бы страницу ошибки, а не notFound() (D-12)"
  - "Массовым пользователям сид ставит created_at = 2020-01-01 + n минут: bulk-user-001 самый старый, учётные записи проектов остаются в первых 100"
  - "adminTestsKeys.bySlug не кодирует slug: строки совпадают с ключами экранов; slug ASCII"
  - "adminTestsKeys.scoringGlobal() и scoringTest(id) равны questionTypes({ includeInactive: true }) и questionTypes({ testId, includeInactive: true }): это сегодняшние URL экрана правил баллов"
  - "onSaved диалога правки на странице ученика инвалидирует usersKeys.byLogin(login) и usersKeys.list(), как раньше инвалидировался '/api/users'"
  - "e2e-web-env.mjs сохраняет requireVar(env, 'E2E_WEB_PORT') без присваивания: тест «throws naming each missing source variable» продолжает требовать порт web"

duration: ~20min
completed: 2026-10-05
---

# Phase 8 Plan 11: D7 в web, удаление absoluteUrl и доменный слой пользователей Summary

Пользователь за пределами первых 100 открывается из глобального поиска: `/admin/users/<id>` берёт `GET /api/users/:id` через `serverRequest`, `/profile/<login>` — `GET /api/users/by-login/:login` через новый `lib/users/api.ts`. Страница ученика целиком на модуле запросов, `absoluteUrl` и доверие к `x-forwarded-host` удалены, ключи `APP_ORIGIN`/`NEXT_PUBLIC_APP_ORIGIN` ушли из примера env и e2e-окружения.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `gsd/phase-08`.

## Что сделано

- **Task 1 (tracer).** Сид: `seed.json` получил `bulkUsers: { prefix: 'bulk-user', count: 110, name: 'Массовый пользователь' }`; `e2e-seed.ts` вставляет их одним `insert` (тот же bcrypt-хеш, активные ученики без групп, `created_at` в 2020 году с шагом в минуту) и одним `insert` ролей `user`; строка счётчиков `e2e-seed: users=122 tests=16 questions=24 prompts=24`. Проверка изолированного окружения не менялась. `lib/users/api.ts` (ключи, `parseUserEnvelope`, `userByLoginFetcher`, `getUserByLogin`), `admin/users/[id]/page.tsx` на `requireServerData(await serverRequest(...))` (401 → вход с возвратом, 403/404 → `notFound()`, без логина → `notFound()`, прочее → исключение; гейт `tests.manage_assignments` и `getServerMe` как были). `UserProfileAssignmentsPage`: `useSWR(usersKeys.byLogin(login), userByLoginFetcher)`; исходы Поверхности 4. Шлюз tracer: `yarn e2e tests/user-lookup.spec.ts` — 12 passed (8 setup + 2 сценария на chromium-desktop и chromium-mobile), затем расширение.
- **Task 2 (TDD).** Тесты слоёв, затем реализация: `parseUserAssignments`, `parseUserAttempts`, `userAssignmentsFetcher`, `userAttemptsFetcher`, `assignTest`, `unassignTest`, `revokeUserSessions`, `clearLoginThrottle`; `lib/tests/admin-api.ts`. Страница ученика: локальный `fetcher` и импорт `@/lib/api-fetch` удалены; назначения, попытки и список тестов — строковые ключи слоёв и фетчеры уровня модуля; карточки при ошибке без данных — `LoadErrorAlert` «Не удалось загрузить данные», повтор своих ключей, фокус на `CardTitle` с `tabIndex={-1}`; действия через функции слоя с исходом, тосты `assignmentErrorText(status, failureMessage(outcome, <прежний запасной текст>))` и `actionErrorText(kind, status ?? 0)`; при `auth` и `aborted` тоста нет.
- **Task 3.** `lib/http/absoluteUrl.ts` удалён (`rm`, без индекса git), строки ключей и их комментарий удалены из `app/web/.env.example`, ключи ушли из `buildWebEnv` и ожидаемого объекта теста.

## Исходы страницы `/profile/<login>`

| Исход | Вид |
|-------|-----|
| загрузка | рамка `rounded-4xl … p-12` с `Loader2`, `role="status"`, `aria-label="Загрузка пользователя"` |
| 200 | страница как раньше |
| 403, 404 | блок «Пользователь не найден» |
| сеть, некорректный ответ, 5xx, прочие 4xx | `LoadErrorAlert` «Не удалось загрузить пользователя» с «Повторить» |
| auth | ничего (переход на вход делает `apiFetch`) |

## codegraph impact (индекс основного дерева на старте фазы, до 08-05)

- `UserProfileAssignmentsPage`: 4 символа — сам компонент, `profile/[id]/page.tsx` (`ProfileByIdPage`), маршрут `/web/app/profile/:id`.
- `resolveLoginByUserId`: 3 символа — функция, `AdminUserPageRedirect`, маршрут `/web/app/admin/users/:id`. Функция удалена вместе с самовызовом.
- `absoluteUrl`: 13 символов в 5 файлах — `absoluteUrl.ts`, `admin/tests/[topicSlug]/[testSlug]/layout.tsx`, `admin/users/[id]/page.tsx`, `admin/attempts/[id]/page.tsx`, `admin/attempts/page.tsx`. Индекс отражает дерево до 08-05; в worktree перед удалением `git grep -n absoluteUrl -- app/web` нашёл единственного вызывающего — `admin/users/[id]/page.tsx` (остальные перевёл 08-05). После перевода страницы — 0 вызывающих, файл удалён (STOP не требовался).

## codegraph affected

По файлам плана (`lib/users/api.ts`, `lib/tests/admin-api.ts`, `UserProfileAssignmentsPage.tsx`, `admin/users/[id]/page.tsx`, `absoluteUrl.ts`, `e2e-web-env.mjs`, `e2e-seed.ts`, `seed.json`): 4 файла — `admin/tests/[topicSlug]/[testSlug]/layout.tsx`, `lib/tests/admin-api.ts`, `e2e/fixtures/seed.json`, `scripts/lib/e2e-web-env.test.mjs`. Новые файлы в индексе отсутствуют. Все прогнаны в `yarn verify` и `yarn e2e`.

## TDD

- RED: `yarn vitest run lib/users/api.test.ts lib/tests/admin-api.test.ts` — `Test Files 2 failed (2)`, `Tests 8 failed | 10 passed (18)`: модуль `./admin-api` отсутствовал, `parseUserAssignments`, `userAssignmentsFetcher`, `assignTest`, `unassignTest`, `revokeUserSessions`, `clearLoginThrottle` не экспортировались. Зелёные 10 — функции, созданные в tracer Task 1 (ключи, `parseUserEnvelope`, `getUserByLogin`).
- GREEN: `yarn workspace @bio-exam/web vitest run lib/users lib/tests/admin-api.test.ts` — `Test Files 6 passed (6)`, `Tests 81 passed (81)`.

## D7

Проверен на `bulk-user-001` («Массовый пользователь 001», самый старый из 110). В e2e: `GET /api/users` отдаёт 100 строк, в них все 12 учётных записей проектов сида и нет `bulk-user-001`; `GET /api/users?limit=500` его содержит; `GET /api/users/by-login/bulk-user-001` — 200; поиск по имени в диалоге (`Ctrl+K`, поле «Введите запрос») → строка результата → `/admin/users/<id>` → `/profile/bulk-user-001`, виден `h1` с именем. `/profile/нет-такого` → «Пользователь не найден».

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/users lib/tests/admin-api.test.ts` — 6 файлов, 81 passed.
- Проверка страницы ученика (`const fetcher` и `lib/api-fetch` отсутствуют) — `profile page ok`.
- Проверка SEC-07 (`git grep -nE --untracked "x-forwarded-host|absoluteUrl|APP_ORIGIN" -- app/web scripts`) — `sec07 clean`, совпадений нет, файл удалён.
- `node --test scripts/lib/e2e-web-env.test.mjs` — 21 pass; `node scripts/check-env-contract.mjs` — `check-env-contract: OK`.
- `yarn verify` — `yarn verify: OK` (web 64 файла / 1198 тестов, server 70 / 1620, exam-core 12 / 605, rbac 1 / 9). Перед этим два прогона: первый упал на `format-check` (`admin-api.ts` был отформатирован из `app/web`, переформатирован из корня), второй — на необработанной ошибке `57P01` в `src/db/timestamps.test.ts` при 70/70 файлах и 1620/1620 тестах сервера; файл к плану не относится, записан в `deferred-items.md`.
- `yarn e2e` — код 0, `190 passed (1.6m)` на chromium-desktop и chromium-mobile; строки `Server request for /admin/attempts/not-a-uuid failed: status 400` в логе — ожидаемые, это сценарий страницы ошибки из 08-05.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-11` — `08-11 changed only its files`.
- `yarn oxfmt --check .` — формат верный; комментариев в новом коде нет. `yarn workspace @bio-exam/web lint` — в файлах плана предупреждений нет.
- Маршруты Express не менялись, снимок `route-inventory.txt` не перегенерировался.
- Логи: `scratchpad/08-11-impact.txt`, `08-11-affected.txt`, `08-11-e2e-spec.log`, `08-11-verify.log`, `08-11-verify-run2-flake.log`, `08-11-e2e.log`.

## Deviations from Plan

1. **[решение исполнителя (автономно)] `parseUserEnvelope` пропускает `login: null`.** Behavior плана называл форму `{ user: { id, login } }`; без `null` пользователь без логина на `/admin/users/[id]` давал бы исход `error` (исключение), а не `notFound()` по D-12. Тест закрепляет оба случая.
2. **[решение исполнителя (автономно)] `requireVar(env, 'E2E_WEB_PORT')` оставлен без присваивания.** После удаления `webOrigin` порт web больше не нужен окружению Next, но тест «throws naming each missing source variable» требует ошибку при его отсутствии; тест не менялся, кроме ожидаемого объекта.
3. **[решение исполнителя (автономно)] Экспорт: `message` усечённого архива уже равен «Не удалось скачать архив. Попробуйте ещё раз.»** (`exportFailureMessage` с запасным «Ошибка экспорта»), чтобы 08-15 и 08-16 могли показывать `outcome.message` либо `exportFailureMessage(outcome, 'Ошибка экспорта')` с одинаковым текстом.
4. **[решение исполнителя (автономно)] Повтор в карточках с двумя источниками** перезапрашивает только источники с ошибкой без данных; заголовок блока одинаковый «Не удалось загрузить данные», причина — от первого упавшего источника.
5. **Порядок TDD:** часть `lib/users/api.ts` (ключи, `parseUserEnvelope`, `userByLoginFetcher`, `getUserByLogin`) написана в tracer Task 1 до тестов Task 2, как требует порядок задач плана; RED Task 2 был красным по остальным функциям и модулю `admin-api`.
6. **`/admin/users/<не-UUID>` теперь страница ошибки, а не 404.** Старый код возвращал `null` на любой `!res.ok`; сервер отвечает 400 от `validateUUID`, `serverRequest` даёт `error`, `requireServerData` бросает исключение — как `/admin/attempts/not-a-uuid` в 08-05 и по шагу плана «`error` → исключение».
7. **`lib/session/object-access.ts` не удалён:** страницы его не импортируют (`git grep "session/object-access" -- app/web` пуст, остался только его тест), но файла нет в `files_modified` плана. Решение — 08-23.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. T-8-24: последний вызывающий `absoluteUrl` переведён на `serverRequest` (`API_ORIGIN`), файл удалён, проверка `git grep` чистая. T-8-25: решение о чужом ученике принимает сервер (`canReadUser`, 08-06); страница показывает 403 как «Пользователь не найден». T-8-26: проверка `isIsolatedEnv()` и `STORAGE_DRIVER=local` в начале `e2e-seed.ts` не менялась, массовые пользователи вставляются после неё. T-8-SC: установок пакетов нет.

## Deferred human verification

- D7 на реальных данных preview (D-35): администратор находит поиском пользователя, которого нет среди первых 100 в «Пользователях», и попадает на `/profile/<login>`; `/admin/users/<id>` чужого или несуществующего — 404. Не выполнено, ждёт пользователя; исполнитель не одобрял. Сводно в 08-28.
- Env web-проекта Vercel: ключи `APP_ORIGIN` и `NEXT_PUBLIC_APP_ORIGIN` можно удалить (читателей в коде нет, оставить безвредно). Не выполнено, ждёт пользователя; исполнитель не одобрял. Сводно в 08-28.
- Вид блока «Не удалось загрузить пользователя» и блоков карточек страницы ученика на 375px и перенос фокуса на `CardTitle` после успешного повтора (Поверхность 1, backstop): e2e-сценария отказа нет, Vitest веба идёт без DOM. Сводно в 08-28.
- Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- app/web/lib/users/api.ts
- app/web/lib/users/api.test.ts
- app/web/lib/tests/admin-api.ts
- app/web/lib/tests/admin-api.test.ts
- app/web/components/users/UserProfileAssignmentsPage.tsx
- app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx
- app/web/lib/http/absoluteUrl.ts (удалён)
- app/web/.env.example
- scripts/lib/e2e-web-env.mjs
- scripts/lib/e2e-web-env.test.mjs
- e2e/fixtures/seed.json
- app/server/src/scripts/e2e-seed.ts
- e2e/tests/user-lookup.spec.ts
- .planning/phases/08-client-requests-runtime-and-decomposition/08-11-SUMMARY.md
- .planning/phases/08-client-requests-runtime-and-decomposition/deferred-items.md (одна строка 08-11)

## Передачи между планами

- 08-18 (`EditUserDialog`), 08-19, 08-13: ключ пользователя по логину — `usersKeys.byLogin(login)` (логин кодируется `encodeURIComponent`); страница ученика кэширует пользователя под этим ключом и в `onSaved` сама инвалидирует `usersKeys.byLogin(login)` и `usersKeys.list()`. Функции записи и списка добавляются в `lib/users/api.ts` рядом с существующими; `usersKeys.list()` возвращает литерал `'/api/users'`.
- 08-15 и 08-16 (экспорт): `exportTestArchive(testId, withAnswers)` (запасное имя `test.zip`; старый `exportTestArchive(testId, slug, withAnswers)` в `test-editor-api.ts` давал `${slug || 'test'}.zip`) и `exportTopicArchive(topicSlug, withAnswers)` (запасное `<topicSlug>.zip`). При `ok` — `saveBlob(outcome.data.blob, outcome.data.filename)`; при отказе тост `exportFailureMessage(outcome, 'Ошибка экспорта')`, при `auth` и `aborted` (пустая строка) — без тоста; усечённый архив приходит как `{ kind: 'network', status: 200 }`, файл не сохранять.
- 08-15, 08-16, 08-20: `adminTestsKeys` готов целиком (`list`, `topics`, `bySlug(topicSlug, testSlug, 'summary'?)` без кодирования slug, `questionTypes({ testId?, includeInactive? })` с порядком `testId`, затем `includeInactive`, `questionDrafts`, `questionDraft`, `assignments`, `scoringGlobal`, `scoringTest`). `scoringGlobal()` совпадает с `questionTypes({ includeInactive: true })` — один кэш у правил баллов и страницы типов вопросов; данные одинаковые, но `parse` у обоих фетчеров должен давать одну и ту же форму (тело без преобразования или одинаковое преобразование). `parseAdminTestsList` возвращает тот же объект; `adminTestsListFetcher` годится для всех экранов с ключом `'/api/tests'`.
- 08-23: `lib/session/object-access.ts` и его тест больше никем не импортируются — удалить. `lib/api-fetch` импортируют 23 файла web (страница ученика больше нет). Старый `readApiError(response, fallback)` из `test-editor-api.ts` не трогался: его переводят 08-15/08-16.
- e2e: сид создаёт 122 пользователя; 110 массовых старше всех учётных записей проектов. Учётные записи проектов остаются в первых 100 строках `GET /api/users`, пока сценарии одного прогона создают меньше 88 новых пользователей. Массовые пользователи видны администратору в полных списках (например, в выборе ученика для назначения с `limit=500`); их имена «Массовый пользователь NNN» с остальными фикстурами не пересекаются.
- e2e: тип `SeedFile` в `e2e/fixtures/accounts.ts` поля `bulkUsers` не знает (файла нет в `files_modified`); `user-lookup.spec.ts` читает его через локальное приведение типа. План, которому нужен типизированный доступ, расширяет `accounts.ts`.
- `plans/011-architecture-deepening.md:139` упоминает `absoluteUrl` как описание прошлого состояния; вне области проверки SEC-07 (`app/web`, `scripts`), не менялся.
- 08-28: пункты из «Deferred human verification».

## Состояние планирования

- STATE.md, ROADMAP.md и REQUIREMENTS.md не менялись: их обновляет оркестратор после коммита плана (правило worktree фазы 8).

## Self-Check: PASSED

Все пять созданных файлов на месте, семь изменённых и один удалённый — в `git status`; `commits: 0` — по правилу пользователя изменения оставлены в рабочем дереве, `plan_head_before` равен `plan_head_after`.
