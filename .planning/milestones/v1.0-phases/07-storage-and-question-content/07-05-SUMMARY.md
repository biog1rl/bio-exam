---
phase: 07-storage-and-question-content
plan: 05
subsystem: storage
tags: [storage, media-library, avatar, users, characterization, known-defects, d-23, adr-0003]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-01: in-memory адаптер по умолчанию в изоляции, test-support/storage.ts (memoryStorage())"
provides:
  - "Характеризация медиатеки через app.ts: GET/POST/DELETE /api/docs/assets, /proxy, /signed, 401 без сессии"
  - "Характеризация POST /api/users/avatar (загрузка с кропом, 400 без файла и без аватара, 400 на текст под image/png)"
  - "Характеризация GET /api/users (401, полный набор полей у администратора, limit/total)"
  - "Пять красных проверок KNOWN_DEFECTS: STOR-student-reads-answer-keys, STOR-student-deletes-asset, STOR-delete-used-asset, STOR-avatar-crop-delete-supabase, PRIV-user-gets-users"
affects: [07-06, 07-08, 07-11, 07-15]

actuals:
  tokens: 6200
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "KNOWN_DEFECTS + defectTest (test.fails) по образцу storage-known-defects.test.ts"
    - "Multipart через FormData и cookie из cookieHeader(jar), без vi.mock хранилища"

key-files:
  created:
    - app/server/src/routes/docs/assets.characterization.test.ts
    - app/server/src/routes/users/avatar.characterization.test.ts
    - app/server/src/routes/users/users-list.characterization.test.ts
  modified: []

key-decisions:
  - "Список медиатеки проверяется после mem.reset() в начале теста, чтобы total = 3 не зависел от порядка тестов в файле"
  - "Каждый тест аватара работает со своим пользователем: старые объекты под avatars/<userId>/ на адаптере memory не удаляются при повторной загрузке"
  - "Причина падения каждой красной проверки подтверждена прогоном без KNOWN_DEFECTS (было/ожидание в таблице SUMMARY)"

requirements-completed: []

coverage:
  - id: D1
    description: "Медиатека закреплена через маршруты на test_* и in-memory адаптере; tracer: загрузка → /proxy отдаёт те же байты"
    requirement: ASSET-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/docs/assets.characterization.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Аватар и список пользователей закреплены через маршруты"
    requirement: ASSET-02
    verification:
      - kind: integration
        ref: "app/server/src/routes/users/avatar.characterization.test.ts"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/users/users-list.characterization.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Пять дефектов D-23 воспроизведены красными test.fails"
    requirement: PRIV-03
    verification:
      - kind: integration
        ref: "app/server/src/routes/docs/assets.characterization.test.ts#известные дефекты медиатеки (D-23)"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/users/avatar.characterization.test.ts#известные дефекты аватара (D-23)"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/users/users-list.characterization.test.ts#известные дефекты списка пользователей (D-23)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 73f1033
plan_head_after: 73f1033
---

# Phase 7 Plan 05: Характеризация медиатеки, аватара и списка пользователей Summary

**Три тестовых файла через `app.ts` на `test_*` и in-memory адаптере закрепляют текущее поведение `/api/docs/assets` (список, загрузка, удаление, proxy, signed), `POST /api/users/avatar` и `GET /api/users`. Пять дефектов D-23 воспроизведены красными `test.fails`. Код приложения не менялся, `vi.mock` хранилища нет.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** около 20 мин
- **Completed:** 2026-10-04
- **Tasks:** 2 из 2
- **Files:** 3 новых

## Accomplishments

- `assets.characterization.test.ts` (`test_assets_char`), 10 обычных тестов:
  - `GET /api/docs/assets?limit=2&offset=0`: 200, `total` = 3, у элементов ровно ключи `createdAt`, `filename`, `path`, `signedUrl`, `size`; `signedUrl` начинается с `/api/docs/assets/proxy?path=images%2F`; `size` равен длине объекта; без cookie 401.
  - `POST /api/docs/assets` с PNG: 200 `{ success, path, filename }`, `path` = `^images/[0-9a-f]{32}\.webp$`, объект в памяти с типом `image/webp`, формат webp.
  - Tracer: загруженная картинка отдаётся `/proxy` теми же байтами.
  - `DELETE`: `images/<hex>.webp` → 200 `{ success: true }`, объекта нет; `topics/t/s/prompt.md` → 400 `Invalid path`, объект на месте.
  - `/proxy`: администратор получает байты; `..%2Fx` → 400 `Invalid path`; без cookie 401.
  - `/signed`: 200, `signedUrl` ведёт на маршрут proxy.
- `avatar.characterization.test.ts` (`test_avatar_char`), 3 обычных теста:
  - PNG с кропом `0/0/32/32`, zoom 1, rotation 0: 200, ключи ответа ровно `avatarUrl`, `avatarCroppedUrl`, `cropParams`; под `avatars/<userId>/` два объекта (оригинал совпадает с PNG, кроп 256×256); `users.avatar` и `users.avatar_cropped` равны URL ответа. На memory URL — маршрут proxy с ключом объекта.
  - Без файла у пользователя без аватара: 400 `Нет загруженного аватара для редактирования`.
  - Текст под `image/png`: 400 `Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)`, объектов нет.
- `users-list.characterization.test.ts` (`test_users_list_char`), 3 обычных теста: без cookie 401 `Unauthorized`; администратор 200, у каждой строки есть `login`, `phone`, `email`, `telegram`, `birthdate`, `roles`, `isActive`; `?limit=1` → одна строка, `total` ≥ 2.

## Состав KNOWN_DEFECTS по файлам

| Файл | id | Ожидание теста | Сейчас (прогон без KNOWN_DEFECTS) | Кто переключает |
|---|---|---|---|---|
| `routes/docs/assets.characterization.test.ts` | `STOR-student-reads-answer-keys` | студент `GET /proxy?path=topics%2Ft%2Fs%2Fanswer_keys.json` → 400 | 200 | 07-06 |
| `routes/docs/assets.characterization.test.ts` | `STOR-student-deletes-asset` | студент `DELETE images/<hex>.webp` → 403, объект на месте | 200 | 07-06 |
| `routes/docs/assets.characterization.test.ts` | `STOR-delete-used-asset` | администратор `DELETE` картинки из промпта вопроса → 409, объект на месте | 200 | 07-15 |
| `routes/users/avatar.characterization.test.ts` | `STOR-avatar-crop-delete-supabase` (кроп без файла) | 200, новый объект `_cropped` под `avatars/<userId>/`, `avatar_cropped` изменился | 500: `Input file is missing: …/app/web/public/api/docs/assets/proxy?path=avatars%2F…` | 07-08 |
| `routes/users/avatar.characterization.test.ts` | `STOR-avatar-crop-delete-supabase` (удаление) | 200 `{ message: 'Аватар удален' }`, объектов нет, поля `null` | 500: `[storage] legacy web/public/uploads fallback is disabled in isolated mode` | 07-08 |
| `routes/users/users-list.characterization.test.ts` | `PRIV-user-gets-users` | роль `user` → 403 | 200 | 07-11 |

Каждая причина проверена отдельным прогоном с `test` вместо `test.fails` (файлы после прогона восстановлены из копии). Все шесть падений — ожидаемые статусы, а не сбой подготовки данных.

## codegraph impact (D-24, Task 1)

Запуск из основного дерева.

- `isSafeStoragePath` (`routes/docs/assets.ts:19`) — 6 символов: `GET /api/docs/assets/proxy` (200), `GET /api/docs/assets/signed` (232), `routes/index.ts`, на web `lib/image-signed-url-cache.ts` `getSignedUrl` (51).
- `buildProxyUrl` (`routes/docs/assets.ts:25`) — 7 символов: `GET /api/docs/assets/signed` (232), `GET /api/docs/assets` (63), `routes/index.ts`, на web `getSignedUrl` (51) и `MediaLibrary.tsx` `loadAssets` (51).

## codegraph affected (Task 2)

- По трём файлам плана: `Affected test files (3)` — только сами новые файлы.
- Для справки по маршрутам, которые они закрепляют (`routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/users/index.ts`): 10 записей — `db/answer-keys-jsonb.test.ts`, `db/timestamps.test.ts`, `lib/tests/question-type-resolver.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, на web `QuestionEditor.tsx`, `admin/tests/layout.tsx`, `MdxRenderer.tsx`, `TestRunner.tsx`. Все прошли в `yarn verify`.

## Решения исполнителя (автономно)

1. Тест списка медиатеки вызывает `mem.reset()` в начале, чтобы `total` = 3 не зависел от объектов других тестов файла.
2. Каждый тест аватара заводит своего пользователя. На memory старые объекты не удаляются при повторной загрузке: регулярка в `avatar.ts` ищет только публичный URL Supabase. С общим пользователем «ровно два объекта» зависело бы от порядка.
3. Красная проверка кропа меняет `cropX`/`cropY` на 8, чтобы новый кроп отличался от первого.
4. `PRIV-user-gets-users` проверяет только статус 403. Наличие персональных полей при 200 уже закреплено тестом администратора.
5. `KNOWN_DEFECTS` и `defectTest` по образцу `storage-known-defects.test.ts` и 07-04. `failOn` в этих файлах не нужен.
6. `requirements-completed` пуст: план закрепляет поведение и воспроизводит дефекты, но ASSET-01, ASSET-02 и PRIV-03 не закрывает. Отметку делают 07-06, 07-08 и 07-11.

## Deviations from Plan

None - план выполнен как написан. В `POST /api/tests/save` для `STOR-delete-used-asset` вопрос передаёт обязательное поле `order: 0` (схема `QuestionSchema`). Без него сохранение отвечало 400, и красная проверка падала бы не по замыслу. Это поправлено до фиксации причины падения.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/docs/assets.characterization.test.ts` → `Tests 10 passed | 3 expected fail (13)`.
- Task 2: прогон трёх файлов → `Test Files 3 passed (3)`, `Tests 16 passed | 6 expected fail (22)`.
- `yarn verify` → `yarn verify: OK`. Все шаги `passed`: `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`. Тесты:
  - server: 31 файл, `620 passed | 13 expected fail`;
  - web: 454;
  - exam-core: 498;
  - rbac: 2.
- Сверка с отпечатком `.planning/commit-snapshots/before-07-05/fingerprint.json` (0 путей до плана) → `07-05 changed only its files`.
- Красные тесты не пишут в рабочее дерево: каталога `app/web/public/uploads` в worktree нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **Коммит файлов плана** делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет. Новых маршрутов нет. T-7-08 закреплён красными `STOR-student-reads-answer-keys` и `PRIV-user-gets-users`, T-7-SC — установок пакетов нет.

## Файлы к коммиту

```
app/server/src/routes/docs/assets.characterization.test.ts
app/server/src/routes/users/avatar.characterization.test.ts
app/server/src/routes/users/users-list.characterization.test.ts
```

## Self-Check: PASSED

- Все три файла существуют (`git status` показывает три новых файла и ничего больше).
- Коммитов нет по правилу пользователя.
