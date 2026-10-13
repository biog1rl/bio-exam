---
phase: 08-client-requests-runtime-and-decomposition
plan: 19
subsystem: web/users (приглашения, свой профиль, аватар)
tags: [HTTP-02, D-05, D-06, D-08, swr, users, invites, avatar]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: request, RequestOutcome, RequestFailure, failureMessage, MalformedBodyError
  - phase: 08-11
    provides: usersKeys
  - phase: 08-13
    provides: groupsKeys.my(), groupsKeys.list(), myGroupsFetcher, groupsListFetcher
provides:
  - lib/users/profile-api.ts — uploadAvatar(FormData), deleteAvatar, updateOwnProfile, changeOwnPassword, parseAvatarUpload; типы AvatarUpload, OwnProfileBody, PasswordBody
  - lib/users/invites-api.ts — createInvite, reissueInvite, parseInviteLink; типы InviteBody (= InvitePayload), InviteLink
  - image-upload.tsx, ProfileClient.tsx, InviteUserDialog.tsx, ReinviteUserDialog.tsx на модуле запросов
affects: [08-23, 08-28]

actuals:
  tokens: 9000
  tasks: 3
  commits: 0
plan_head_before: 07fdaa023a471b3c5fb6d5898fd97153731d6c8b
plan_head_after: 07fdaa023a471b3c5fb6d5898fd97153731d6c8b

tech-stack:
  added: []
  patterns:
    - "Загрузка файла через модуль: request(url, { method: 'POST', body: FormData, parse }) — тело передаётся тем же объектом, Content-Type не ставится"
    - "Действие → RequestOutcome → failureMessage(outcome, запасной); пустая строка (auth/aborted) — без текста и тоста"
    - "Ключи SWR строками groupsKeys.my()/groupsKeys.list() с фетчерами уровня модуля lib/groups/api.ts; инвалидация mutate(usersKeys.list())"

key-files:
  created:
    - app/web/lib/users/profile-api.ts
    - app/web/lib/users/profile-api.test.ts
    - app/web/lib/users/invites-api.ts
    - app/web/lib/users/invites-api.test.ts
  modified:
    - app/web/components/ui/image-upload.tsx
    - app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
    - app/web/components/users/dialogs/InviteUserDialog.tsx
    - app/web/components/users/dialogs/ReinviteUserDialog.tsx

key-decisions:
  - "uploadAvatar типизирован по реальному ответу сервера { avatarUrl, avatarCroppedUrl } (services/assets/avatars.ts), а не по наброску { avatar } из interfaces плана: план требует сверить формы по коду; экран берёт avatarCroppedUrl || avatarUrl, как раньше (решение исполнителя, автономно)"
  - "Тело PATCH /api/users/profile прежнее: { ...profileData, initials } с null в пустых полях (исправление 28b4cee сохранено)"
  - "ReinviteUserDialog: 403 и 409 по-прежнему через reinviteErrorText 07.1 (текст восстанавливается из failure.body через JSON.stringify, invite-form.ts не в файлах плана); остальные отказы — failureMessage(outcome) без запасного: вместо сырого res.text()/`HTTP N` — `Запрос отклонён (код N).`/`Ошибка сервера (код N).`, сеть — текст модуля; auth — без текста (решение исполнителя, автономно)"
  - "InviteUserDialog: http → inviteErrorText({ status, body, variant }), network → inviteErrorText({ network: true }), malformed (2xx без ссылки) → прежний текст «Сервис не вернул ссылку приглашения», auth/aborted — без текста"
  - "ProfileClient: catch вокруг refresh() оставлен с запасным текстом «Ошибка при сохранении профиля» без error.message; у смены пароля исключений вне исхода нет — catch убран"
  - "Приглашение не вызывает mutate само: onCreated из UsersClient — связанный mutate() хука useSWR(usersKeys.list()), тот же ключ"

metrics:
  duration: 20min
  completed: 2026-10-05
---

# Phase 8 Plan 19: приглашения, свой профиль и аватар на модуле запросов Summary

**Аватар загружается и удаляется через `uploadAvatar(FormData)`/`deleteAvatar()` поверх `apiFetch` (401 уходит в веб-сессию, Content-Type не ставится), свой профиль и пароль — через `lib/users/profile-api.ts`, приглашение и повторная ссылка — через `lib/users/invites-api.ts`; в четырёх файлах не осталось голого `fetch`, локальных фетчеров и `@/lib/api-fetch`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer, TDD): аватар через модуль с FormData

- Снимок `08-plan-files.cjs snapshot 08-19` — `fingerprint 08-19 0 paths` (дерево чистое, HEAD 07fdaa0).
- RED: `profile-api.test.ts` (10 тестов: POST с тем же `FormData` и без Content-Type, 400 `Файл слишком большой` → `http` с текстом сервера, ответ без адресов → `malformed`, `AuthExpiredError` → `auth` с пустым текстом, `parseAvatarUpload`, `DELETE`, `PATCH /api/users/profile` с `null`-полями, 409 `Логин уже используется`, `POST /api/users/profile/password`). Прогон — `Test Files 1 failed`, модуля нет (лог `scratchpad/08-19-red1.log`).
- GREEN: `lib/users/profile-api.ts`; прогон — 10 passed.
- `image-upload.tsx`: оба голых `fetch` заменены на `uploadAvatar(formData)` и `deleteAvatar()`; отказ → `failureMessage(outcome, 'Ошибка загрузки' | 'Ошибка удаления')`, пустой текст (auth/aborted) — строка ошибки не ставится. `versionedUrl(value, imageKey)`, сборка `FormData`, кроп и локальная ошибка «Файл не найден» не тронуты.
- Шлюз tracer: повторный прогон `vitest run lib/users/profile-api.test.ts` — 10 passed; tracer подтверждён, расширение продолжено.

### Task 2 (TDD): свой профиль и приглашения

- RED: `invites-api.test.ts` (9 тестов: POST `/api/auth/invites` с json и ссылкой в ответе, 409 → `http` 409 с телом, ответ без ссылки → `malformed`, auth, network, повторная ссылка с `{ userId }`, 409 повторной ссылки, `parseInviteLink`). Прогон — `Test Files 1 failed` (лог `scratchpad/08-19-red2.log`).
- GREEN: `lib/users/invites-api.ts` (`parse` требует непустую строку `inviteLink`); прогон — 9 passed.
- `ProfileClient.tsx`: группы — `useSWR(groupsKeys.my(), myGroupsFetcher)`, `myGroups = data?.groups ?? []` (при ошибке первой загрузки блок «Группы» не рендерится, как при отсутствии групп — UI-SPEC ⚠ unresolved без изменения); сохранение — `updateOwnProfile({ ...profileData, initials })`, пароль — `changeOwnPassword`; тосты — `failureMessage(outcome, 'Ошибка при сохранении профиля' | 'Ошибка при смене пароля')`, при auth тоста нет. Локальный `fetcher` (голый `fetch`) и импорт `@/lib/api-fetch` удалены.
- `InviteUserDialog.tsx`: группы — `useSWR(groupsKeys.list(), groupsListFetcher)`, `parseInviteGroups(error ? undefined : data)` и `loaded` как в 07.1; приглашение — `createInvite(invitePayload(...))`; тексты — `inviteErrorText` 07.1 по статусу и телу; `auth` — без текста. `fetchGroups`, `GROUPS_URL`, `AuthExpiredError`/`apiFetch` удалены.
- `ReinviteUserDialog.tsx`: `reissueInvite(user.id)`, тексты 403/409 — `reinviteErrorText`, инвалидация `mutate(usersKeys.list())`; тип `InviteResponse` и путь «Неизвестная ошибка» удалены.
- `<automated>` Task 2: `vitest run lib/users` — 7 файлов, 101 passed; проверка четырёх файлов — `invite and profile ok`.

### Task 3: codegraph affected, verify, e2e, сверка

- `yarn verify` — `yarn verify: OK` (web 1307, server 1670, exam-core 605, rbac 9; лог `scratchpad/08-19-verify.log`).
- `yarn e2e` — 194 passed, 0 failed (chromium-desktop и chromium-mobile, в том числе `teacher-zone.spec.ts` шаг 4 — приглашение ученика учителем со ссылкой; лог `scratchpad/08-19-e2e.log`). Строки `[WebServer] ⨯ Error: Server request for /admin/attempts/not-a-uuid failed: status 400` — штатный вывод сценария страниц сервера.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-19` — `08-19 changed only its files`.

## codegraph

Индекс построен по основному дереву, в worktree `.codegraph/` нет; команды запускались из `/Users/kdvornichenko/bio-exam`.

`codegraph impact` (до правок):
- `ImageUpload` — 5 символов: `AvatarEditor` (`components/users/AvatarEditor.tsx`), `ProfileClient`.
- `ProfileClient` — 4 символа: `ProfilePage` (`profile/page.tsx`), маршрут `/web/app/profile`.
- `InviteUserDialog` — 5 символов: `UsersClient`, `UsersPage` (`admin/users/page.tsx`).
- `ReinviteUserDialog` — 5 символов: `UsersTable`, `UsersClient`.

`codegraph affected` по шести исходным файлам плана — `No test files affected by the changed files` (новые тесты `profile-api.test.ts`, `invites-api.test.ts` в индексе ещё нет; все web-тесты прошли в `yarn verify`).

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/users/profile-api.test.ts` — 10 passed.
- `yarn workspace @bio-exam/web vitest run lib/users` — 7 файлов, 101 passed.
- `yarn workspace @bio-exam/web typecheck` — exit 0.
- Старый `fetch` аватара ставил `credentials: 'include'`; `apiFetch` его не ставит, действует умолчание `same-origin`: адрес `/api/users/avatar` относительный (тот же источник через прокси Next), cookie сессии уходят так же, как у всех остальных запросов через `apiFetch`.
- `yarn workspace @bio-exam/web lint` — в новых файлах предупреждений нет; в изменённых остались только существовавшие (`set-state-in-effect` в `ReinviteUserDialog`, `ProfileClient`, `image-upload`; `purity` `Date.now` в `image-upload`).
- Проверка четырёх файлов на локальный `fetcher`, голый `fetch(` и `lib/api-fetch` — `invite and profile ok`.
- `oxfmt` по каждому файлу с `./`; `format-check` в `yarn verify` — passed.
- `yarn verify` — `yarn verify: OK`; `yarn e2e` — 194 passed; сверка — `08-19 changed only its files`.

## TDD Gate Compliance

Task 1: RED (модуль `profile-api` отсутствует) → GREEN (10 passed). Task 2: RED (модуль `invites-api` отсутствует) → GREEN (9 passed). Порядок соблюдён по сути; RED/GREEN-коммиты не делались по правилу пользователя. REFACTOR не понадобился.

## Deviations from Plan

### Auto-fixed Issues

**1. Форма ответа `uploadAvatar`** — `RequestOutcome<AvatarUpload>` с `{ avatarUrl, avatarCroppedUrl }` вместо наброска `{ avatar }`: сервер отдаёт `{ avatarUrl, avatarCroppedUrl, cropParams }`, план велит сверить формы по коду.

**2. [Rule 1 - Bug] Сырые и английские тексты отказов** — `ReinviteUserDialog` показывал сырой `res.text()` (JSON вроде `{"error":"User not found"}`) и `e.message` сетевой ошибки; `ProfileClient` — английский `error.error` сервера. Теперь — тексты модуля (Поверхность 2 UI-SPEC), 403/409 повторной ссылки — тексты 07.1.

Различие поведения, не ошибка: при ответе `/api/groups` 2xx неверной формы диалог приглашения теперь считает группы не загруженными (`error`, `loaded false`), раньше — загруженными пустыми; при отказах HTTP поведение 07.1 прежнее.

Иначе план выполнен как написан.

## Threat Flags

Новой поверхности нет. T-8-45: загрузка аватара идёт через `apiFetch` (401 → веб-сессия). T-8-46: модуль не ставит Content-Type для `FormData`, тест проверяет отсутствие заголовка и тот же объект тела. T-8-SC: установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- Загрузка, перекадрирование и удаление аватара в браузере (`/profile`): фото появляется сразу, адрес — `/api/docs/assets/proxy?path=…&v=…` через `versionedUrl`; при истёкшей сессии — переход на вход без текста ошибки. Проверка сводно в 08-28 (preview).
- Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-23: `reinviteErrorText({ status, text })` в `invite-form.ts` по-прежнему принимает текст; `ReinviteUserDialog` восстанавливает его через `JSON.stringify(failure.body)`. Можно перевести функцию на `body` и убрать круговой разбор (с правкой `invite-form.test.ts`).
- 08-23: в `ProfileClient`, `image-upload.tsx`, `InviteUserDialog`, `ReinviteUserDialog` нет импортов `@/lib/api-fetch` — минус четыре импортёра.
- Любой план с аватаром: `uploadAvatar(form)` возвращает `{ avatarUrl, avatarCroppedUrl }`, экран берёт `avatarCroppedUrl || avatarUrl`; к адресу не дописывать `?v=` — только `versionedUrl`.
- Свой профиль: `updateOwnProfile(body)` шлёт тело как есть, пустые поля — `null` (сервер очищает значение).

## Файлы к коммиту

- app/web/lib/users/profile-api.ts
- app/web/lib/users/profile-api.test.ts
- app/web/lib/users/invites-api.ts
- app/web/lib/users/invites-api.test.ts
- app/web/components/ui/image-upload.tsx
- app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
- app/web/components/users/dialogs/InviteUserDialog.tsx
- app/web/components/users/dialogs/ReinviteUserDialog.tsx

## Self-Check: PASSED

Все восемь файлов на месте (`git status`), `yarn verify: OK`, e2e 194 passed, сверка `08-19 changed only its files`; коммитов нет по правилу пользователя (`commits: 0`, HEAD прежний).
