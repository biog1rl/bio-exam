---
phase: 07-storage-and-question-content
plan: 06
subsystem: storage
tags: [storage, media-library, assets, links, rbac, tests.write, d-01, d-06, d-14, d-15, d-19]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-01: модуль хранилища (storage(), storageUrl, normalizeKey, isServableImageKey, isMediaLibraryKey), in-memory адаптер в изоляции"
  - phase: 07-storage-and-question-content
    provides: "07-05: характеризация медиатеки и красные STOR-student-reads-answer-keys, STOR-student-deletes-asset"
provides:
  - "services/storage/links.ts: parseStorageLink, resolveImageLink, avatarUrl, ownStorageKey, storedAvatarValue"
  - "services/assets: uploadImage, listImages, deleteImage, readServableImage, resolveImageUrl"
  - "/api/docs/assets: GET, POST, DELETE под tests.write; /proxy и /signed только картинки в images/, topics/*/*/assets/, avatars/"
  - "Статика /uploads в app.ts и rewrite /uploads/:path* в next.config.ts удалены"
affects: [07-08, 07-09, 07-11, 07-14, 07-15]

actuals:
  tokens: 12400
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Правило «ссылка → ключ → URL» в одном модуле services/storage/links.ts"
    - "Ошибки сервиса ApiError < 500 отдаются статусом и текстом, остальные — 500 с прежним текстом маршрута"

key-files:
  created:
    - app/server/src/services/storage/links.ts
    - app/server/src/services/storage/links.test.ts
    - app/server/src/services/assets/images.ts
    - app/server/src/services/assets/index.ts
    - app/server/src/routes/docs/assets.test.ts
  modified:
    - app/server/src/routes/docs/assets.ts
    - app/server/src/routes/docs/assets.characterization.test.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/app.ts
    - app/web/next.config.ts

key-decisions:
  - "Отказ по пути в /proxy, /signed и DELETE — 400 с прежним текстом 'Invalid path', а не текстом StorageKeyError: характеризация 07-05 сравнивает текст"
  - "Абсолютный URL маршрута proxy на любом хосте считается внешним; ключом становится только относительный /api/docs/assets/proxy?path=…"
  - "Ссылки /uploads/… декодируются один раз до normalizeKey; прямой ключ не декодируется"
  - "avatarUrl для некорректного значения (не ключ и не http) возвращает значение как есть, как сейчас делают маршруты"
  - "Медиатека — право без объекта: прямой requirePerm('tests', 'write') по must-have плана, функции scope.ts здесь не применяются"

requirements-completed: [STOR-01, STOR-04, ASSET-01, ASSET-02]

coverage:
  - id: D1
    description: "Студент получает 400 на answer_keys.json, промпт, settings.json и SVG через /proxy и /signed, 200 на картинки в трёх пространствах"
    requirement: ASSET-02
    verification:
      - kind: integration
        ref: "app/server/src/routes/docs/assets.test.ts#GET /api/docs/assets/proxy: только картинки в пространствах имён"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/docs/assets.characterization.test.ts#STOR-student-reads-answer-keys"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET, POST, DELETE медиатеки: admin 200, user 403, user + allow 200, admin + deny 403, аноним 401"
    requirement: ASSET-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/docs/assets.test.ts#право tests.write"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/docs/assets.characterization.test.ts#STOR-student-deletes-asset"
        status: pass
    human_judgment: false
  - id: D3
    description: "Устаревшие формы ссылок разрешаются /signed в URL proxy, и по нему отдаются байты объекта; внешний URL возвращается как есть"
    requirement: STOR-04
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/links.test.ts"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/docs/assets.test.ts#GET /api/docs/assets/signed: разрешение ссылки"
        status: pass
    human_judgment: false
  - id: D4
    description: "Загрузки идут через in-memory адаптер без vi.mock; статика /uploads и rewrite удалены"
    requirement: STOR-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/uploads.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 1effce4
plan_head_after: 1effce4
---

# Phase 7 Plan 06: Медиатека и файловый маршрут через модуль хранилища Summary

**`/api/docs/assets` работает через сервис `services/assets` и правило ссылок `services/storage/links.ts`. Список, загрузка и удаление требуют `tests.write`. `/proxy` и `/signed` отдают по сессии только картинки в `images/`, `topics/*/*/assets/`, `avatars/`. Удаление принимает только `images/<имя>`. Запасной путь на диск, статика `/uploads` и rewrite удалены.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** около 25 мин
- **Started:** 2026-10-04T11:14:00Z
- **Completed:** 2026-10-04
- **Tasks:** 3 из 3 исполнены, Task 4 (blocking-human) отложен
- **Files:** 5 новых, 5 изменённых

## Accomplishments

- `services/storage/links.ts`:
  - `parseStorageLink` различает `key`, `external` и `invalid`;
  - свой бакет — `SUPABASE_STORAGE_BUCKET || 'main'`, хост сверяется с `SUPABASE_URL`, только если переменная задана;
  - понимает пути `/storage/v1/object/(public|sign|authenticated)/<bucket>/…`, `/uploads/…` и `uploads/…` (`tests/<t>/<s>/…` → `topics/<t>/<s>/…`) и относительный URL proxy;
  - каждый ключ проходит `normalizeKey`.
  - Остальные функции: `resolveImageLink`, `avatarUrl`, `ownStorageKey`, `storedAvatarValue`.
- `services/assets/images.ts`:
  - `uploadImage`: сигнатура `file-type`, sharp 1920 px WebP q85, ключ `images/<32 hex>.webp`, `upsert: false`, `Cache-Control 3600`;
  - `listImages`: `listPage('images')`, `signedUrl` через `storageUrl`;
  - `deleteImage`: только `isMediaLibraryKey`;
  - `readServableImage`: только `isServableImageKey`; отсутствующий объект → 404 `Изображение не найдено`;
  - `resolveImageUrl`.
- `routes/docs/assets.ts`:
  - GET, POST и DELETE `/` идут через `sessionRequired(), requirePerm('tests', 'write')`, у POST multer стоит после проверки права;
  - `multer.memoryStorage()` всегда;
  - нет `fs`, `path`, `crypto`, `sharp`, `file-type`, `process.cwd()`, `assertLegacyUploadsAllowed`, `isSafeStoragePath`, `buildProxyUrl` и веток по `isConfigured()`;
  - ответ `/proxy` с `X-Content-Type-Options: nosniff`.
- `app.ts`: блок `express.static` для `/uploads` и импорт `path` удалены. `next.config.ts`: правило `/uploads/:path*` удалено.
- `uploads.test.ts`:
  - `vi.hoisted`, `createClientSpy` и оба `vi.mock` удалены, объекты читаются из `memoryStorage()`, `mem.reset()` в `beforeEach`;
  - ответ аватара: `avatarUrl` и `avatarCroppedUrl` начинаются с `/api/docs/assets/proxy?path=<ключ>&`, `users.avatar` равен `avatarUrl`;
  - тест «клиент Supabase не создаётся» удалён вместе со шпионом.

## TDD (Task 2)

Коммиты RED/GREEN не делались (правило пользователя). Порядок соблюдён по сути:

- RED: `assets.test.ts` написан до правки GET/POST/DELETE. Прогон `vitest run src/routes/docs` → `12 failed | 75 passed | 2 expected fail (89)`. Все 12 падений — статусы:
  - `user` и `admin_deny_tests_write` получали 200 вместо 403 на GET, POST и DELETE (6 тестов);
  - DELETE `images/sub/a.webp`, `images/../topics/…`, `images/..%2fx`, `images/%2e%2e/x`, `images/%252e%252e/x`, `images/a\u0000.webp` отвечал не 400 (6 тестов).
- GREEN: после правки маршрута и снятия `STOR-student-deletes-asset` → `88 passed | 1 expected fail (89)`.

Tracer-гейт после Task 1: `<verify>` перегнан → `Tests 39 passed | 2 expected fail (41)`. Затем исполнение продолжено.

## Состав KNOWN_DEFECTS после плана

| Файл | id | Статус |
|---|---|---|
| `routes/docs/assets.characterization.test.ts` | `STOR-student-reads-answer-keys` | снят, обычный тест, зелёный (Task 1) |
| `routes/docs/assets.characterization.test.ts` | `STOR-student-deletes-asset` | снят, обычный тест, зелёный (Task 2) |
| `routes/docs/assets.characterization.test.ts` | `STOR-delete-used-asset` | остаётся, переключает 07-15 |

Красные проверки других файлов (`STOR-avatar-crop-delete-supabase` → 07-08, `PRIV-user-gets-users` → 07-11) не трогались.

## codegraph impact (D-24, Task 1)

Запуск из основного дерева.

- `isSafeStoragePath` (`routes/docs/assets.ts:19`) — 6 символов: `GET /api/docs/assets/proxy`, `GET /api/docs/assets/signed`, `routes/index.ts`, на web `lib/image-signed-url-cache.ts` `getSignedUrl`.
- `buildProxyUrl` (`routes/docs/assets.ts:25`) — 7 символов: `GET /api/docs/assets/signed`, `GET /api/docs/assets`, `routes/index.ts`, на web `getSignedUrl` и `MediaLibrary.tsx` `loadAssets`.
- `assertLegacyUploadsAllowed` (`services/storage/storage.ts:15`) — 21 символ:
  - `routes/docs/assets.ts`: `multerStorage`, `upload`, DELETE, POST;
  - `routes/users/avatar.ts`: `multerStorage`, `upload`, `POST/DELETE /api/users/avatar`;
  - `routes/tests/index.ts`: `POST /api/tests/:id/assets`;
  - на web `MediaLibrary.tsx` `handleDeleteConfirm` и `handleUpload`, `drag-drop-paste-plugin.tsx` `uploadImageToAPI`, `images-plugin.tsx` `handleUpload`.

  Из `assets.ts` вызовы удалены. `avatar.ts` и `tests/index.ts` не трогались: их переводят 07-08 и 07-15. Web-вызовы работают с тем же API: поля ответов не изменились.

## codegraph affected (Task 3)

По `routes/docs/assets.ts`, `app.ts`, `next.config.ts`, `uploads.test.ts`, `assets.characterization.test.ts` — 12 записей:

- server: `db/answer-keys-jsonb.test.ts`, `db/timestamps.test.ts`, `lib/tests/question-type-resolver.ts`, `routes/docs/assets.characterization.test.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/uploads.test.ts`;
- web: `QuestionEditor.tsx`, `admin/tests/layout.tsx`, `MdxRenderer.tsx`, `TestRunner.tsx`.

Все прошли в `yarn verify`. В `app/web` и `e2e` нет ссылок на `/uploads` (`grep` пуст).

## Решения исполнителя (автономно)

1. Отказ по пути в `/proxy`, `/signed` и DELETE отвечает `400 Invalid path`, а не текстом `StorageKeyError` (`Некорректный путь в хранилище`). Так характеризация 07-05 остаётся зелёной без правки ожиданий.
2. Абсолютный URL маршрута proxy на любом хосте считается внешним и возвращается как есть. Ключом становится только относительный `/api/docs/assets/proxy?path=…`. Так `/signed` не принимает посторонний хост за свой.
3. Путь `/uploads/…` декодируется один раз (query и `#` отбрасываются) и затем проходит `normalizeKey`, который сам проверяет повторно кодированный traversal. Прямой ключ не декодируется.
4. `avatarUrl` возвращает некорректное значение (не ключ и не `http(s)`) как есть, как сейчас делают маршруты. Перевод в маршрутах подключает 07-08.
5. `SUPABASE_URL` с неразбираемым значением считается чужим хостом: URL остаётся внешним.
6. Медиатека проверяет право прямым `requirePerm('tests', 'write')`. Это право без объекта, так велит must-have плана, поэтому функции `services/access-policy/scope.ts` здесь не применяются. Новых `hasPermission(req, 'tests.read')` нет.
7. Ошибки multer (фильтр MIME, `File too large`, сломанный multipart) по-прежнему уходят в общий обработчик и отвечают 500 с текстом multer. Это закреплено `uploads.test.ts`, поведение не менялось.

## Deviations from Plan

None - план выполнен как написан.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage/links.test.ts src/routes/docs/assets.characterization.test.ts` → `Test Files 2 passed (2)`, `Tests 39 passed | 2 expected fail (41)`.
- Task 2:
  - `vitest run src/routes/docs` → `Test Files 2 passed (2)`, `Tests 88 passed | 1 expected fail (89)`;
  - проверка маршрута → `assets route through module`.
- Task 3:
  - `vitest run src/routes/uploads.test.ts src/routes/docs src/services/storage/links.test.ts` → `Test Files 4 passed (4)`, `Tests 136 passed | 1 expected fail (137)`;
  - проверка статики → `uploads static gone`.
- `yarn verify` → `yarn verify: OK`, все шаги `passed`, typecheck web внутри `lint-typecheck-test`. Тесты:
  - server: 33 файла, `725 passed | 11 expected fail`;
  - web: 454;
  - exam-core: 498;
  - rbac: 2.
- Сверка с отпечатком `.planning/commit-snapshots/before-07-06/fingerprint.json` (0 путей до плана) → `07-06 changed only its files`.
- Каталога `app/web/public/uploads` в worktree нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

Task 4 (`checkpoint:human-verify`, `gate="blocking-human"`): инвентаризация хранилища на проде и решения по правам и бакету до деплоя.

1. Read-only в SQL-консоли Supabase (`<specifics>` п. 1):
   ```sql
   SELECT split_part(name, '/', 1) AS prefix, count(*) FROM storage.objects WHERE bucket_id = 'main' GROUP BY 1 ORDER BY 2 DESC;
   ```
   и счётчики `answer_keys.json`, `settings.json`, `topics/%/assets/%`. Префикс вне `images`, `topics`, `avatars` → STOP ASSET-02: до деплоя плана нужно решение пользователя, иначе такие картинки перестанут открываться.
2. `SELECT id, public FROM storage.buckets;` (п. 2). Если `main` публичный, сохранённые `answer_keys.json` и промпты читаются без входа по публичному URL. Нужно решение пользователя: сделать бакет приватным и отдавать аватары маршрутом приложения либо завести отдельный публичный бакет аватаров. Сохранённые `answer_keys.json` удаляет скрипт сверки 07-16.
3. Подтвердить D-06 (п. 3): `/proxy` и `/signed` больше не отдают `.md` и `.json` из `topics/`.
4. Подтвердить D-14 (п. 4): список, загрузка и удаление в медиатеке только с `tests.write`. Для ролей `admin` и `user` видимых изменений нет, меняется поведение для переопределений.
5. Локальная разработка (п. 13): статика `/uploads` и rewrite удалены. Картинки, сохранённые раньше в `app/web/public/uploads`, больше не открываются.

Кроме того: коммит файлов плана делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет. Новых маршрутов нет. Поверхность `/proxy`, `/signed` и медиатеки сужена:

- T-7-09: `isServableImageKey` до адаптера;
- T-7-10: `requirePerm` до multer;
- T-7-11: `isMediaLibraryKey` до адаптера;
- T-7-14: SVG не отдаётся, есть `nosniff`.

`/signed` не делает исходящих запросов: внешний URL только возвращается (T-7-13). T-7-12 передан пользователю в Task 4 п. 2.

## Файлы к коммиту

```
app/server/src/services/storage/links.ts
app/server/src/services/storage/links.test.ts
app/server/src/services/assets/images.ts
app/server/src/services/assets/index.ts
app/server/src/routes/docs/assets.ts
app/server/src/routes/docs/assets.test.ts
app/server/src/routes/docs/assets.characterization.test.ts
app/server/src/routes/uploads.test.ts
app/server/src/app.ts
app/web/next.config.ts
```

## Self-Check: PASSED

- Все десять файлов существуют. `git status` показывает ровно их: 5 `M` и 5 `??`.
- Коммитов нет по правилу пользователя, HEAD = `1effce4`.
