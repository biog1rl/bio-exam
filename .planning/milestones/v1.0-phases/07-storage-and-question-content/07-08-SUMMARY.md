---
phase: 07-storage-and-question-content
plan: 08
subsystem: storage
tags: [storage, avatar, users, profile, auth-me, d-07, d-01, d-25, stor-01, stor-04]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-02/07-03: порт хранилища, storage(), storageUrl(); links.ts (avatarUrl, ownStorageKey, storedAvatarValue)"
  - phase: 07-storage-and-question-content
    provides: "07-05: характеризация аватара и красная STOR-avatar-crop-delete-supabase"
  - phase: 07-storage-and-question-content
    provides: "07-06: services/assets/images.ts, медиатека через модуль, статика /uploads убрана"
provides:
  - "services/assets/avatars.ts: saveAvatar, recropAvatar, deleteAvatar"
  - "POST и DELETE /api/users/avatar через модуль хранилища на любом адаптере, без fs"
  - "Ключ avatars/<userId>/<24 hex>.<ext> в users.avatar и avatars/<userId>/<24 hex>_cropped.png в users.avatar_cropped для новых загрузок"
  - "avatarUrl() в ответах POST /api/users/avatar, GET /api/auth/me, PATCH /api/users/profile; storedAvatarValue() перед записью avatar в PATCH профиля"
affects: [07-11, 07-16, 07-17]

actuals:
  tokens: 9000
  tasks: 4
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Сервис ассета: проверка сигнатуры → запись новых объектов → UPDATE users → тихое удаление прежних объектов своего пространства avatars/<userId>/"
    - "При сбое до UPDATE новые объекты удаляются, ошибка уходит дальше"

key-files:
  created:
    - app/server/src/services/assets/avatars.ts
    - app/server/src/routes/users/avatar-urls.test.ts
  modified:
    - app/server/src/services/assets/index.ts
    - app/server/src/routes/users/avatar.ts
    - app/server/src/routes/auth/me.ts
    - app/server/src/routes/users/profile.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/routes/users/avatar.characterization.test.ts
  deleted:
    - app/web/components/users/AvatarUpload.tsx

key-decisions:
  - "Удаляются только ключи под avatars/<userId>/ из прежних значений users.avatar и avatar_cropped (T-7-17); /uploads/avatars/<hex>.png и ключи другого пользователя не трогаются"
  - "PATCH профиля без поля avatar не меняет столбец: storedAvatarValue вызывается только при body.avatar !== undefined"
  - "Кроп с нулевой областью после прижатия к границам даёт 400 «Некорректная область кропа» вместо 500 от sharp"
  - "GET /api/users по-прежнему отдаёт сырые avatar/avatar_cropped: файл вне allow-list плана, перевод по D-07 остаётся плану 07-11"

requirements-completed: [STOR-01, STOR-04]

coverage:
  - id: D1
    description: "Tracer: загрузка аватара → ключ в БД → URL proxy в ответе и в /api/auth/me"
    requirement: STOR-04
    verification:
      - kind: integration
        ref: "app/server/src/routes/uploads.test.ts#POST /api/users/avatar"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/users/avatar-urls.test.ts#GET /api/auth/me: avatar"
        status: pass
    human_judgment: false
  - id: D2
    description: "Кроп без файла и DELETE через модуль на memory, STOR-avatar-crop-delete-supabase обычная и зелёная"
    requirement: STOR-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/users/avatar.characterization.test.ts"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/users/avatar-urls.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Аватары на проде: формы значений, preview, схема профиля на локальном адаптере"
    requirement: STOR-04
    verification: []
    human_judgment: true

duration: 25min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 3533582
plan_head_after: 3533582
---

# Phase 7 Plan 08: Аватары через модуль хранилища Summary

**Новый сервис `services/assets/avatars.ts` (`saveAvatar`, `recropAvatar`, `deleteAvatar`) пишет в БД ключ `avatars/<userId>/…`. Ответы `POST /api/users/avatar`, `GET /api/auth/me` и `PATCH /api/users/profile` переводят его в URL через `avatarUrl()`. Кроп без файла и удаление работают на любом адаптере и удаляют свои объекты. В маршруте аватара больше нет `fs`, `sharp`, `/tmp/avatars` и `../web/public`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** около 25 мин
- **Completed:** 2026-10-04
- **Tasks:** 3 из 3 автоматических; Task 4 (blocking-human) записан в Deferred
- **Files:** 2 новых, 6 изменённых, 1 удалён

## Accomplishments

- `services/assets/avatars.ts`:
  - `saveAvatar({ userId, buffer, crop })`. Тип определяется по сигнатуре `fileTypeFromBuffer` (JPEG, PNG, WebP, GIF). При отказе — `ApiError(400, 'Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)')`.
  - Оригинал пишется в `avatars/<userId>/<24 hex>.<jpg|png|webp|gif>` с MIME по сигнатуре.
  - Кроп создаётся, только когда заданы `x`, `y`, `width`, `height`, `rotation`. Обработка: поворот с прозрачным фоном, `extract` с прижатием к границам, `resize(256, 256)`, `.png()`. Результат пишется в `avatars/<userId>/<24 hex>_cropped.png`.
  - Затем `UPDATE users`. После него ключи прежних значений извлекаются через `ownStorageKey`, и удаляются только ключи под `avatars/<userId>/`. Сбой удаления → `console.warn('[assets] orphan objects', keys, error)`, ответ остаётся успешным.
  - `recropAvatar({ userId, crop })` читает оригинал из хранилища по `ownStorageKey(users.avatar)`. Нет значения, посторонний URL или нет объекта → `ApiError(400, 'Нет загруженного аватара для редактирования')`. Порядок: новый кроп → `UPDATE` полей кропа и `avatar_cropped` → удаление прежнего объекта кропа.
  - `deleteAvatar(userId)`: `UPDATE users` обнуляет все поля аватара, затем удаляет объекты своего пространства.
- `routes/users/avatar.ts` (было 437 строк, стало 84):
  - `multer.memoryStorage()` с прежними лимитом 5 МБ и фильтром MIME.
  - `POST /`: при файле — `saveAvatar`, без файла — `recropAvatar`. Форма ответа `{ avatarUrl, avatarCroppedUrl, cropParams }` прежняя.
  - `DELETE /` → `deleteAvatar(req.authUser.id)`. `userId` берётся только из сессии, параметра пользователя у маршрута нет.
  - Ошибки: `ApiError` с кодом ниже 500 → его статус и `error`, прочие → 500 `Ошибка при загрузке аватара` / `Ошибка при удалении аватара`.
- `routes/auth/me.ts`: `avatar: avatarUrl(row.avatar)`, `avatarCropped: avatarUrl(row.avatarCropped)`.
- `routes/users/profile.ts`:
  - `avatar` пишется как `body.avatar === undefined ? undefined : storedAvatarValue(body.avatar)`;
  - в ответе `avatar: avatarUrl(updatedUser.avatar)`;
  - схема `updateProfileSchema` не менялась.
- `app/web/components/users/AvatarUpload.tsx` удалён: вызывающих нет.

## Изменённые ожидания характеризации (D-07)

| Файл | Было | Стало | Причина |
|---|---|---|---|
| `avatar.characterization.test.ts`, загрузка PNG с кропом | `users.avatar` и `users.avatar_cropped` равны `avatarUrl` и `avatarCroppedUrl` ответа | в БД ключи объектов `avatars/<userId>/…`; `avatarUrl` и `avatarCroppedUrl` начинаются с `/api/docs/assets/proxy?path=<кодированный ключ>&` | D-07: новая загрузка хранит ключ, ответ отдаёт URL по правилу модуля |
| `avatar.characterization.test.ts`, `KNOWN_DEFECTS` | `['STOR-avatar-crop-delete-supabase']` (две проверки `test.fails`, 500) | пустой набор, обе проверки обычные и зелёные | кроп и удаление идут через модуль |
| `uploads.test.ts`, `POST /api/users/avatar` | `row.avatar === reply.body.avatarUrl`, `row.avatarCropped === reply.body.avatarCroppedUrl` | `users.avatar` по `^avatars/<adminId>/[0-9a-f]{24}\.png$`, `users.avatar_cropped` по `^avatars/<adminId>/[0-9a-f]{24}_cropped\.png$`, совпадают с ключами объектов; URL ответа — proxy этих ключей (проверка была) | D-07 |

## TDD (Task 2): порядок красный → зелёный

- Красный для кропа без файла и удаления — две проверки `STOR-avatar-crop-delete-supabase` из 07-05: 500 `Input file is missing …/app/web/public/api/docs/assets/proxy?…` и 500 `legacy web/public/uploads fallback is disabled in isolated mode`. Сам маршрут через `recropAvatar` и `deleteAvatar` подключён в Task 1: план требует, чтобы ветка без файла шла через сервис уже там, а старая ветка удаления держалась на `fs`, удалённом в Task 1.
- `avatar-urls.test.ts` написан до правки `profile.ts`. Прогон `vitest run src/routes/users src/routes/uploads.test.ts` дал `Tests 2 failed | 43 passed | 1 expected fail (46)`:
  - «публичный URL Supabase своего бакета записывается ключом» — в БД был URL, а не `avatars/<id>/a.png`;
  - «без поля avatar значение в БД не меняется» — старый код писал `undefined` и столбец не трогал, но в ответе был ключ, а не URL proxy.
- После правки `profile.ts`: `Test Files 4 passed (4)`, `Tests 45 passed | 1 expected fail (46)`. Оставшийся `expected fail` — `PRIV-user-gets-users` из `users-list.characterization.test.ts`, его переключает 07-11.
- Коммиты RED/GREEN не создавались (правило пользователя).

## codegraph impact (D-24)

Индекс основного дерева, запуск из `/Users/kdvornichenko/bio-exam`.

- `createCroppedImage` — 5 символов: сама функция (`avatar.ts:77`), файл `avatar.ts`, маршрут `POST /api/users/avatar` (136), `routes/users/index.ts`, на web `components/ui/image-upload.tsx` `handleCropComplete` (112). Web вызывает тот же маршрут, форма ответа не менялась.
- `AvatarUpload` — 1 символ: только сам `AvatarUpload` (`AvatarUpload.tsx:28`). `rg -n "AvatarUpload" app/web --glob '!node_modules'` нашёл только сам файл. Файл удалён через `rm`.
- `avatarUrl` — `Symbol "avatarUrl" not found`: `links.ts` создан в 07-03, индекс старше. По `rg` вызывающие: `services/assets/avatars.ts`, `routes/auth/me.ts`, `routes/users/profile.ts`, тесты `links.test.ts` и `avatar-urls.test.ts`.

## codegraph affected (Task 3)

По `routes/users/avatar.ts`, `routes/auth/me.ts`, `routes/users/profile.ts`, `services/assets/index.ts`, `AvatarUpload.tsx` — 30 записей:

- server: `logger.test.ts`, `me-requirePerm-parity.test.ts`, `exam-flow.test.ts`, `uploads.test.ts`, `scope.test.ts`, `storage-known-defects.test.ts`, `storage-memory-default.test.ts`, `storage.local.test.ts`, `routes/tests/{assignments,index,public}.ts`;
- web: страницы и компоненты `admin/tests/**`, `MdxRenderer.tsx`, `TestRunner.tsx`, `lib/session/*.test.ts`, `lib/tests/api.ts`, `proxy.test.ts`;
- `e2e/fixtures/exam.ts`.

Все тесты server и web прошли в `yarn verify`. `e2e` не входит в `yarn verify` и не запускался.

## Решения исполнителя (автономно)

1. `PATCH /api/users/profile` без поля `avatar` не меняет столбец. `storedAvatarValue(undefined)` вернул бы `null` и стёр бы аватар, поэтому функция вызывается только при `body.avatar !== undefined`. Поведение закреплено тестом.
2. Кроп, у которого после прижатия к границам ширина или высота не больше 0, даёт 400 `Некорректная область кропа`. Раньше `sharp` бросал ошибку, и маршрут отвечал 500.
3. Если запись кропа или `UPDATE` падает после записи нового оригинала, только что записанные объекты удаляются (тихо), ошибка уходит в маршрут → 500. Так в бакете не остаются объекты, на которые нет ссылки.
4. Ключ кропа получает свой случайный hex, а не hex оригинала. Повторный кроп создаёт новый ключ, и кэш браузера не показывает старую картинку.
5. `recropAvatar` без полного набора параметров кропа ведёт себя как старая ветка: `avatar_cropped` → `null`, прежний объект кропа удаляется, оригинал на месте.
6. Удаление прежних объектов ограничено префиксом `avatars/<userId>/`. Значения `/uploads/avatars/<hex>.png` (ключ `avatars/<hex>.png`) и ключи другого пользователя не удаляются.
7. `GET /api/users` (`routes/users/index.ts:116-117`) отдаёт сырые значения. Файл вне allow-list плана, перевод `avatarUrl` для списка — план 07-11 (D-07 перечисляет этот маршрут).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] PATCH профиля без avatar не стирает аватар**
- **Found during:** Task 2
- **Issue:** `storedAvatarValue(undefined)` возвращает `null`. Прямая подстановка затёрла бы аватар при любой правке профиля без поля `avatar`.
- **Fix:** вызов только при `body.avatar !== undefined`, тест «без поля avatar значение в БД не меняется».
- **Files modified:** `app/server/src/routes/users/profile.ts`, `app/server/src/routes/users/avatar-urls.test.ts`

**2. [Rule 2 - Correctness] Откат новых объектов при сбое до UPDATE**
- **Found during:** Task 1
- **Fix:** `saveAvatar` и `recropAvatar` удаляют только что записанные ключи, если запись или `UPDATE` упали.
- **Files modified:** `app/server/src/services/assets/avatars.ts`

Других отклонений нет. `DELETE /` подключён к `deleteAvatar` уже в Task 1: старая ветка удаления держалась на `fs`, а Task 1 удаляет его из маршрута.

## Verification

- Task 1 (tracer): `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/routes/auth` → `Test Files 7 passed (7)`, `Tests 125 passed (125)`. Этот `<verify>` прогнан один раз, после Task 1. `uploads.test.ts` прогнан повторно в команде Task 2, тесты `src/routes/auth` — в `yarn verify`.
- Task 2:
  - `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/users src/routes/uploads.test.ts` → `Test Files 4 passed (4)`, `Tests 45 passed | 1 expected fail (46)`;
  - проверка маршрута → `avatar route through module`.
- Task 3:
  - `yarn workspace @bio-exam/web typecheck` зелёный;
  - `yarn workspace @bio-exam/server typecheck` → код 0;
  - `yarn verify` → `yarn verify: OK`, все шаги `passed`: `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`. Тесты: server 35 файлов, `759 passed | 9 expected fail`; web 454; exam-core 498; rbac 2;
  - сверка с отпечатком `.planning/commit-snapshots/before-07-08/fingerprint.json` (0 путей до плана) → `07-08 changed only its files`.
- Каталога `app/web/public/uploads` в worktree нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **Формы значений аватара на проде (`<specifics>` п. 10), только чтение:**
   ```sql
   SELECT CASE WHEN avatar LIKE 'http%' THEN 'url' WHEN avatar LIKE '/uploads/%' THEN 'legacy_local' ELSE 'key' END AS kind, count(*)
   FROM users WHERE avatar IS NOT NULL GROUP BY 1;
   SELECT CASE WHEN avatar_cropped LIKE 'http%' THEN 'url' WHEN avatar_cropped LIKE '/uploads/%' THEN 'legacy_local' ELSE 'key' END AS kind, count(*)
   FROM users WHERE avatar_cropped IS NOT NULL GROUP BY 1;
   ```
   После деплоя значения `legacy_local` не откроются: статика `/uploads` удалена в 07-06. Новый код переводит их в `avatars/<hex>.png`, а такого объекта в бакете нет.
2. **Preview Vercel тестовой учёткой:** загрузить аватар, сделать только кроп, удалить. После удаления в бакете под `avatars/<userId>/` объектов нет. В `users.avatar` новой загрузки лежит ключ, `/api/auth/me` отдаёт публичный URL Supabase.
3. **Риск для Milestone 2:** на локальном адаптере URL аватара относительный (`/api/docs/assets/proxy?...`). Схема `PATCH /api/users/profile` (`z.string().url()`, по D-07 не меняется) отклонит его, если профиль сохраняется с аватаром. На Supabase URL абсолютный, проблемы нет. Решение пользователя нужно до включения локального адаптера.
4. **Откат сервера после деплоя:** прежний код покажет сломанными аватары, загруженные новым кодом (в БД ключ, а не URL). Они починятся только повторной загрузкой.
5. **Коммит файлов плана** делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности.

- T-7-17 закрыт: `userId` берётся из сессии, удаляются только ключи `avatars/<userId>/`, тесты «объекты другого пользователя на месте» и «ключ другого пользователя не удаляется».
- T-7-18 закрыт: расширение и MIME берутся по сигнатуре.
- T-7-19 принят: посторонний URL в PATCH пишется как есть.
- T-7-SC: установок пакетов нет.

## Файлы к коммиту

```
app/server/src/services/assets/avatars.ts            (новый)
app/server/src/services/assets/index.ts
app/server/src/routes/users/avatar.ts
app/server/src/routes/auth/me.ts
app/server/src/routes/users/profile.ts
app/server/src/routes/uploads.test.ts
app/server/src/routes/users/avatar.characterization.test.ts
app/server/src/routes/users/avatar-urls.test.ts      (новый)
app/web/components/users/AvatarUpload.tsx            (удалён)
```

## Self-Check: PASSED

- `avatars.ts` и `avatar-urls.test.ts` существуют, `AvatarUpload.tsx` удалён. `git status` показывает ровно 9 путей плана.
- Коммитов нет по правилу пользователя (`plan_head_before` = `plan_head_after` = 3533582).
