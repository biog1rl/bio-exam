---
phase: 07-storage-and-question-content
plan: 01
subsystem: storage
tags: [storage, supabase, storage-js, local-fs, in-memory, adr-0004, d-23]

requires:
  - phase: 04-auth
    provides: "services/access-policy/scope.ts (предусловие фазы 7, коммит 256aca8)"
provides:
  - "Модуль хранилища services/storage: порт, нормализация ключей, адаптеры memory/local/supabase, выбор драйвера без тихого запасного пути"
  - "Оболочка storage.ts со старыми именами методов StorageService поверх storage()"
  - "test-support/storage.ts (memoryStorage()) и test-support/supabase-storage-fake.ts (поддельный HTTP Storage под настоящим createClient)"
  - "Изолированный процесс без STORAGE_DRIVER получает in-memory адаптер"
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-16, 05-01]

actuals:
  tokens: 30500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Порт StorageAdapter + createStorage(adapter) с нормализацией ключей до адаптера"
    - "Подделка Supabase на уровне fetch под настоящим клиентом supabase-js"
    - "Типизированные ошибки хранилища — подклассы ApiError с полем name"

key-files:
  created:
    - app/server/src/services/storage/port.ts
    - app/server/src/services/storage/keys.ts
    - app/server/src/services/storage/index.ts
    - app/server/src/services/storage/adapters/memory.ts
    - app/server/src/services/storage/adapters/local.ts
    - app/server/src/services/storage/adapters/supabase.ts
    - app/server/src/services/storage/storage-known-defects.test.ts
    - app/server/src/services/storage/storage-memory-default.test.ts
    - app/server/src/test-support/storage.ts
    - app/server/src/test-support/supabase-storage-fake.ts
  modified:
    - app/server/src/services/storage/storage.ts
    - app/server/src/services/storage/storage.local.test.ts
    - app/server/.env.example

key-decisions:
  - "STORAGE_DRIVER=memory вне изолированного режима — StorageConfigError (memory только для тестов)"
  - "Выход за корень у локального адаптера (realpath, symlink) — StorageKeyError (400), как у normalizeKey"
  - "createClient вызывается с двумя аргументами (URL, ключ), как раньше; клиент кешируется на пару URL+ключ"
  - "Ошибка 404 у list/remove/write Supabase (нет бакета) — StorageUnavailableError; StorageNotFoundError только у copy и выдачи файла"
  - "readFilesParallel возвращает только найденные ключи; listFiles возвращает только файлы"
  - "getPublicUrl на любом драйвере — storageUrl(key): avatars/ на Supabase — публичный URL, остальное — маршрут proxy"

patterns-established:
  - "Тесты маршрутов в изоляции работают на in-memory адаптере без vi.mock; доступ к нему — memoryStorage() после startAuthApp"
  - "Классификация ошибок Supabase по форме storage-js 2.93: download — StorageUnknownError + originalError.status; JSON — StorageApiError.statusCode"

requirements-completed: [STOR-01, STOR-02]

coverage:
  - id: D1
    description: "Порт, три адаптера и выбор драйвера; изоляция без STORAGE_DRIVER — memory, Supabase в изоляции запрещён"
    requirement: STOR-01
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#Supabase client lock-out"
        status: pass
      - kind: integration
        ref: "app/server/src/services/storage/storage-memory-default.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeKey/normalizePrefix, containment локального адаптера, единые ошибки D-03"
    requirement: STOR-02
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage-known-defects.test.ts#normalizeKey and normalizePrefix (D-02)"
        status: pass
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#local mode: containment"
        status: pass
    human_judgment: false
  - id: D3
    description: "C1: классификатор ошибок Supabase на настоящем createClient поверх поддельного HTTP; промах → null одним GET"
    requirement: STOR-02
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage-known-defects.test.ts#Supabase adapter error classification (D-03, storage-js 2.93)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-23: STOR-supabase-100-limit и STOR-readFile-empty-on-outage воспроизведены красными и закрыты"
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage-known-defects.test.ts#storage known defects (D-23)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 256aca8
plan_head_after: 256aca8
---

# Phase 7 Plan 01: Модуль хранилища Summary

**Порт StorageAdapter с адаптерами memory, local и Supabase (страницы list по 100, серверный copy, повторы только при 5xx и без статуса), нормализация ключей до адаптера, типизированные ошибки 400/404/409/503/500 и оболочка StorageService над storage(); изолированный процесс без STORAGE_DRIVER работает на in-memory адаптере.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** около 25 мин
- **Started:** 2026-10-04T10:05Z
- **Completed:** 2026-10-04T10:30Z
- **Tasks:** 3 из 3
- **Files:** 13 (10 новых, 3 изменённых)

## Accomplishments

- `port.ts`: `StorageAdapter`, `StorageObject`, `WriteOptions`, ошибки `StorageKeyError` (400), `StorageNotFoundError` (404), `StorageConflictError` (409), `StorageUnavailableError` (503), `StorageConfigError` (500). Все наследуют `ApiError`, у каждой своё `name`. Сообщения не содержат ключ.
- `keys.ts`: `normalizeKey`, `normalizePrefix`, `STORAGE_NAMESPACES`, `isServableImageKey`, `isMediaLibraryKey`. Проверки идут по исходной строке и по каждой ступени `decodeURIComponent` (до 3). В адаптер уходит исходный ключ.
- `adapters/memory.ts`: `createMemoryAdapter()` и общий `memoryStorage`. Тестовый интерфейс: `failOn`, `clearFailures`, `reset`, `put`, `get`, `keys`.
- `adapters/local.ts`: перенос локального режима. Сохранены realpath и symlink, атомарная запись через `.tmp-<12 hex>`. Добавлены `copy` (временный файл и `rename`), список с метаданными и подрезка пустых каталогов при удалении.
- `adapters/supabase.ts`: классификатор C1, `list` страницами по 100 до короткой страницы, рекурсия по `id === null`, серверный `copy` (при конфликте удаление приёмника и повтор), `remove` пакетами по 100, `exists` через SDK `exists()`, `publicUrl`.
- `index.ts`: `resolveStorageDriver()` без параметров, `createStorage(adapter)`, `storage()`, `storageUrl(key)`. Ключи окружения читаются литералами `process.env.X` при каждом вызове.
- `storage.ts`: только оболочка над `storage()`. Удалены `fs`, `path`, `process.cwd()`, клиент Supabase, `createSignedUrl`, `withRetry` и ветка `../web/public/uploads` в `moveDirectory`.
- `test-support/storage.ts` и `test-support/supabase-storage-fake.ts`.
- Новые тесты: `storage-known-defects.test.ts` (46 тестов) и `storage-memory-default.test.ts` (tracer через `app.ts`).

## Проверка C1 (squad review)

- **Классификатор.**
  - `read` (download): «не найден» = `error.name === 'StorageUnknownError'` и `originalError.status` равен 400 или 404, как в SDK `exists()`.
  - JSON-операции: «не найден» = `StorageApiError` со `statusCode '404'`, конфликт = `statusCode '409'`.
  - Повтор только при `originalError.status >= 500`, при `status >= 500` или когда статуса нет совсем (сбой fetch). Прочие 4xx дают `StorageUnavailableError` без повторов. Текст сообщения не разбирается.
- **Подделка.** `createSupabaseStorageFake()` — маршрутизатор `fetch` под `https://fake-project.supabase.test/storage/v1`. В тестах его использует настоящий `createClient` из `vi.importActual('@supabase/supabase-js')`. Ошибки строит сам storage-js 2.93.2, поэтому их форма совпадает с SDK по построению. Ведётся журнал `calls`. Сам модуль подделки пакет не импортирует.
- **Промах → null одним GET.** Тест «a missing object is null after exactly one GET, without retries»: `fake.calls` содержит ровно один `GET /object/main/<ключ>` и больше ничего.
- **Повторы до исчерпания.** Сбой download — три GET при `retries: 2`, затем `StorageUnavailableError`. Так же ведут себя `exists` при 503 (три HEAD) и `list` при 503.
- **Без повторов.** Конфликт `write` с `upsert: false` — `StorageConflictError` после одного POST. `copy` без источника — `StorageNotFoundError` после одного POST.

## Task 1: красный прогон на старом коде (шаг 3)

Прогон до любых правок `storage.ts`:

```
yarn workspace @bio-exam/server vitest run src/services/storage/storage-known-defects.test.ts --reporter=verbose
 ✓ ... > STOR-supabase-100-limit: a directory with 150 objects is listed completely 169ms
 ✓ ... > STOR-readFile-empty-on-outage: readFile rejects when the storage is unavailable 3ms
 ✓ ... > readFile of a missing object gives an empty string 1ms
 ✓ ... > the Supabase client is created from SUPABASE_URL outside isolation 2ms
 Test Files  1 passed (1)
      Tests  2 passed | 2 expected fail (4)
```

Причина падения проверена отдельным прогоном без `KNOWN_DEFECTS` на старом коде:

| Случай | Результат на старом коде |
|---|---|
| `STOR-supabase-100-limit` | `AssertionError: 100 !== 150` |
| `STOR-readFile-empty-on-outage` | `AssertionError: Missing expected rejection.` |

После Task 2 оба id убраны из `KNOWN_DEFECTS` (пустой `Set`). Тела тестов переведены на модуль `storage()`, оба теста обычные и зелёные.

## Task 2: TDD

- **RED.** Тесты `<behavior>` написаны до `keys.ts` и адаптеров: строки `normalizeKey`/`normalizePrefix`, классификация Supabase, (а) и (б) на модуле. Прогон упал на импорте `./keys.js` (модуля ещё нет), «Tests no tests».
- **GREEN.** После `keys.ts`, `local.ts`, `supabase.ts` и полного `index.ts` прошли все 46 тестов файла.
- **REFACTOR.** Отдельных изменений не было.

## codegraph impact (D-24, до правок)

- `StorageService` — 70 символов:
  - методы класса в `storage.ts`;
  - маршруты `routes/tests/index.ts`: GET/DELETE/PATCH/POST тестов, вопросов, экспорта, ассетов, `writeTestSettingsFile`;
  - `routes/tests/public.ts`: `readFirstMarkdown`, публичные GET и submit;
  - `routes/docs/assets.ts`: GET `/`, `/proxy`, DELETE, POST, `multerStorage`;
  - `routes/users/avatar.ts`: POST, `useSupabase`, `multerStorage`;
  - `scripts/backfill-question-search.ts`, `scripts/e2e-seed.ts`;
  - на web через HTTP: `MediaLibrary.tsx`, `image-upload.tsx`, `drag-drop-paste-plugin.tsx`, `images-plugin.tsx`.
- `storageService` — 8 символов:
  - `routes/docs/assets.ts`, `routes/index.ts`;
  - `routes/tests/index.ts`, `routes/tests/public.ts`;
  - `routes/users/avatar.ts`, `routes/users/index.ts`;
  - `scripts/backfill-question-search.ts`.
- `assertLegacyUploadsAllowed` — 25 символов:
  - `storage.ts` `moveDirectory`;
  - `assets.ts`: `multerStorage`, `upload`, DELETE/POST;
  - `avatar.ts`: `multerStorage`, `upload`, POST/DELETE;
  - `routes/tests/index.ts`: PATCH settings, POST move, POST assets;
  - `storage.local.test.ts`;
  - на web: `MediaLibrary.tsx`.

Экспорты `StorageService`, `storageService`, `assertLegacyUploadsAllowed`, `getQuestionPath`, `getTestPath` сохранены, маршруты не менялись.

## codegraph affected (Task 3)

`codegraph affected` по изменённым файлам плана — 13 записей:

- сервер:
  - `routes/tests/assignments.ts`, `routes/tests/exam-flow.test.ts`;
  - `routes/tests/index.ts`, `routes/tests/public.ts`;
  - `services/storage/storage-known-defects.test.ts`, `services/storage/storage-memory-default.test.ts`, `services/storage/storage.local.test.ts`;
- web:
  - `admin/tests/components/QuestionEditor.tsx`, `admin/tests/layout.tsx`;
  - `components/tests/MdxRenderer.tsx`, `components/tests/TestRunner.tsx`;
  - `lib/session/server.test.ts`, `proxy.test.ts`.

Все они прошли в `yarn verify`.

## Изменённые ожидания в storage.local.test.ts

| Тест | Было → стало | Причина |
|---|---|---|
| Ключи `a/…`, `p/…`, `e/…`, `d/…`, `l/…`, `mv/…`, `m/…`, `n/…`, `ct/…`, `nothing/…`, `taken` | перенесены под `topics/…` | D-02: ключ вне пространств `images`, `topics`, `avatars` отклоняется |
| `ESCAPE_MESSAGE` (регулярка) | предикат `KEY_ERROR` по `name === 'StorageKeyError'` | D-03: ключ некорректен или выходит за корень → `StorageKeyError` (400); локальный адаптер бросает ту же ошибку при выходе через symlink |
| Тесты symlink (каталог, файл, висячий, sibling, внутри корня) | symlink лежат в `root/topics/…`, ключи `topics/…` | Смысл тех же проверок: ключ проходит `normalizeKey`, отказ даёт realpath-проверка адаптера. Позитивный тест «symlink внутри корня» подтверждает, что эти ключи не режет нормализация |
| `readJson of invalid JSON returns null` | `rejects SyntaxError` | D-03: `readJson` не прячет ошибку разбора |
| `uploadBuffer with upsert false` `/already exists/` | `StorageConflictError` | D-03 |
| `downloadBuffer of a missing key` `/not found/i` | `StorageNotFoundError` | D-03 |
| `listFiles returns direct entries` с подкаталогом `x` | только файлы `a.md`, `b.md` | порт: `list` возвращает только файлы (D-01) |
| `listFiles of a lone subdirectory` → `['topics/t/x']` | `[]` | то же |
| `a literal %2e%2e segment is a plain directory name` | отклоняется `StorageKeyError`, ничего не записано; добавлен `%252e%252e` | D-02 |
| `rejects a source/destination that escapes` | ожидание `KEY_ERROR` | D-02/D-03 |
| `local mode: unsupported methods fail loudly` | `local mode: URL, ZIP and media listing`: `getPublicUrl` → маршрут proxy, `createZip` собирает архив без `answer_keys.json` (и с ним при `true`), `listFilesWithMeta` пагинирует по `createdAt` убыв. с `total`, `createSignedUrl` удалён | D-01: у локального адаптера есть список с метаданными и URL по ключу |
| `isolated env never constructs a Supabase client` | изоляция без драйвера работает на memory: запись, чтение, JSON, буфер, список, удаление проходят; `createClientSpy` не вызван | решение планировщика: memory по умолчанию в изоляции (D-01, T-7-02) |
| `isolated env reports Supabase as not configured` | `isConfigured()` = `true`, `resolveStorageDriver()` = `'memory'`, клиент не создан | то же |
| новый: `isolated env refuses STORAGE_DRIVER=supabase` | `StorageConfigError`, клиент не создан | D-01: Supabase в изоляции запрещён всегда |
| `client is created once from the env values` | шпион отдаёт промах в форме SDK (`StorageUnknownError`, `originalError.status` 400), `readFile` → `''`, клиент создан один раз с `[URL, KEY]` | C1: простая `Error` без статуса теперь повторяется и даёт 503 |
| `without any configuration the old fallbacks stay` | `isConfigured()` = `false`, чтение и запись → `StorageConfigError`, без предупреждения в консоль | D-01: без тихого запасного пути |
| `the local driver takes precedence` | `isConfigured()` = `true` (раньше означало «Supabase настроен») | must_haves: `isConfigured()` истинно, если адаптер выбирается без ошибки |
| `isolated env refuses the legacy … fallback` | `moveDirectory` проходит на memory; проверки «каталог `../web/public/uploads` не изменился» и `assertLegacyUploadsAllowed()` throws остались | план, Task 2 п.7 |
| `the local driver works in an isolated process` | `isConfigured()` = `true` | то же |

Тесты «outside isolation … no-op», конфигурации `STORAGE_LOCAL_DIR`, round-trip, атомарной записи, перемещения и `deleteDirectory` по смыслу не менялись.

## Решения исполнителя (автономно)

1. `STORAGE_DRIVER=memory` вне изоляции даёт `StorageConfigError`. Пример env называет memory только тестовым, а must_haves относят такой случай к «прочим».
2. Выход за корень у локального адаптера — `StorageKeyError` (400), а не голый `Error`.
3. `createClient(url, key)` вызывается без опций, как раньше. Тест `deepEqual(calls[0], [URL, KEY])` сохраняет смысл.
4. Статус 404 у `write`, `list`, `remove` Supabase (бакета нет) — `StorageUnavailableError`. По D-03 `StorageNotFoundError` бывает только у `copy` и при выдаче файла.
5. `readFilesParallel` возвращает только найденные ключи, как раньше локальный режим. Вызывающие используют `get(...) || ''`, ошибки больше не прячутся.
6. Удалён метод `withRetry` у `StorageService`: вызывающих вне класса нет, повторы живут в адаптере Supabase (D-03).
7. В подделке есть помощник `put(key, data, contentType)` для наполнения. Экспортируются `FAKE_SUPABASE_URL` и `FAKE_SUPABASE_KEY`.
8. `listFilesWithMeta` отдаёт `id` = ключ объекта. Маршрут медиатеки `id` не читает.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Тип `BodyInit` недоступен в tsconfig сервера**
- **Found during:** Task 1
- **Issue:** `lib: ES2022` с `types: node` не даёт глобальный `BodyInit`, typecheck падал в `supabase-storage-fake.ts`.
- **Fix:** `ConstructorParameters<typeof Response>[0]`.
- **Files modified:** app/server/src/test-support/supabase-storage-fake.ts

**2. [Rule 3 - Blocking] Тип клиента Supabase в кеше**
- **Found during:** Task 2
- **Issue:** `ReturnType<typeof createClient>` не совместим с результатом generic-вызова `createClient(url, key)`.
- **Fix:** кеш типизирован как `SupabaseClient`.
- **Files modified:** app/server/src/services/storage/index.ts

Других отклонений нет. План выполнен как написан, решения 1–8 выше приняты в рамках Discretion.

## Изменения поведения для следующих планов

- Оболочка нормализует ключи. Чтение кандидата вне пространств имён (`readFirstMarkdown` в `public.ts`, копия в `routes/tests/index.ts:2674`) теперь бросает `StorageKeyError`, а не возвращает `''`. Характеризация 07-03…07-05 и модуль содержимого вопроса это закрепят.
- Маршруты, которые при загрузке модуля читают `storageService.isConfigured()` (`assets.ts`, `avatar.ts`), в изоляции видят `true` (memory). Вне изоляции без конфигурации видят `false` и пока идут прежним путём на диск. Его удаляют следующие планы фазы.
- `createZip(basePath)` обрезает имена записей по длине исходного `basePath`, а `list` нормализует префикс. С завершающим `/` в `basePath` имена сдвинутся на один символ. Текущие вызывающие (`getTestPath`, путь темы) слеш не передают. Учесть в 07-14 (ZIP).
- `getPublicUrl` для `avatars/…` при отсутствии конфигурации бросает `StorageConfigError`, раньше возвращал `''`. Маршрут аватара ловит ошибку в общем `try`.

## Verification

- Task 1 verify: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage/storage-known-defects.test.ts src/services/storage/storage-memory-default.test.ts` — `Tests 3 passed | 2 expected fail (5)` на этапе Task 1. Typecheck сервера зелёный.
- Task 2 verify: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage src/routes/uploads.test.ts src/routes/tests/exam-flow.test.ts` — `Test Files 5 passed (5)`, `Tests 205 passed (205)`. `uploads.test.ts` и `exam-flow.test.ts` прошли без правок. Проверка печатает `storage facade only`.
- Task 3: `yarn verify` → `yarn verify: OK`:
  - все шаги `passed`, `env-contract: OK`;
  - server: 24 файла, 482 теста;
  - web: 430 тестов, exam-core: 498, rbac: 2.
- Сверка с отпечатком `.planning/commit-snapshots/before-07-01/fingerprint.json` → `07-01 changed only its files`.
- Дополнительно `yarn e2e` (план не требует): `132 passed`, код выхода 0. Строки `✘` относятся к ожидаемо падающим `@known-defect`.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **Локальная разработка без Supabase** (`<specifics>` п. 13, часть). Вне тестов без `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` и без `STORAGE_DRIVER=local` сервер отвечает `StorageConfigError` при первом обращении к файлам.
   - Шаги: в локальном `.env` задать `STORAGE_DRIVER=local` и абсолютный `STORAGE_LOCAL_DIR`, запустить `yarn dev`, открыть страницу теста и медиатеку редактора. README обновит 07-02.
   - Прод не меняется: в env Vercel заданы `SUPABASE_URL` и `SUPABASE_SERVICE_KEY`.
2. **Коммит файлов плана** делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет. Новых маршрутов и путей доступа нет. Митигации T-7-01…T-7-03 покрыты тестами:

- T-7-01: строки `normalizeKey` и containment;
- T-7-02: `createClientSpy` не вызывается в изоляции, `STORAGE_DRIVER=supabase` в изоляции → `StorageConfigError`;
- T-7-03: `STOR-readFile-empty-on-outage`.

## Файлы к коммиту

```
app/server/.env.example
app/server/src/services/storage/port.ts
app/server/src/services/storage/keys.ts
app/server/src/services/storage/index.ts
app/server/src/services/storage/adapters/memory.ts
app/server/src/services/storage/adapters/local.ts
app/server/src/services/storage/adapters/supabase.ts
app/server/src/services/storage/storage.ts
app/server/src/services/storage/storage.local.test.ts
app/server/src/services/storage/storage-known-defects.test.ts
app/server/src/services/storage/storage-memory-default.test.ts
app/server/src/test-support/storage.ts
app/server/src/test-support/supabase-storage-fake.ts
```

## Self-Check: PASSED

- Все 13 файлов существуют (`git status` показывает 3 изменённых и 10 новых).
- Коммитов нет по правилу пользователя.
