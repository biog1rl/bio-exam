---
phase: 07-storage-and-question-content
plan: 02
subsystem: storage
tags: [storage, contract-tests, traversal, supabase-fake, local-fs, in-memory, readme, d-05]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-01: порт StorageAdapter, createStorage, адаптеры memory/local/supabase, подделка Supabase (d80e2bf)"
provides:
  - "Контрактный набор storage.contract.test.ts: describe.each по local, supabase-fake и memory за createStorage, шпион адаптера"
  - "storage.local.test.ts только для createLocalAdapter: symlink, висячий symlink, атомарная запись, временные файлы, выбор драйвера"
  - "Раздел README сервера «Хранилище файлов»"
affects: [07-03, 07-04, 07-05, 07-14, 07-16]

actuals:
  tokens: 9000
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Шпион адаптера через Proxy: считает вызовы методов порта, 0 вызовов на враждебный ключ"
    - "Контрактный набор describe.each по фабрикам { name, make() } с новым адаптером на каждый тест"

key-files:
  created:
    - app/server/src/services/storage/storage.contract.test.ts
  modified:
    - app/server/src/services/storage/storage.local.test.ts
    - app/server/README.md

key-decisions:
  - "Расхождений адаптеров с портом набор не нашёл: адаптеры, keys.ts, index.ts и подделка не менялись"
  - "Тесты выбора драйвера (index.ts) оставлены в storage.local.test.ts через resolveStorageDriver и storage(), без StorageService"
  - "Таблица выхода за корень на уровне самого createLocalAdapter оставлена: контрактный набор доказывает, что такие ключи до адаптера не доходят, а защита адаптера проверяется отдельно"

requirements-completed: [STOR-02, STOR-03]

coverage:
  - id: D1
    description: "Один контрактный набор на трёх адаптерах: запись и чтение, upsert и конфликт, отсутствие одним обращением, удаление, copy, 150 объектов, listPage, storageUrl"
    requirement: STOR-03
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.contract.test.ts#storage contract: $name"
        status: pass
    human_judgment: false
  - id: D2
    description: "Враждебные ключи (15 входов) отклоняются StorageKeyError на write, read, readText, exists, remove, copy (оба аргумента), list, listPage; шпион адаптера — 0 вызовов, у local каталог над корнем не меняется"
    requirement: STOR-02
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.contract.test.ts#hostile keys never reach the adapter"
        status: pass
    human_judgment: false
  - id: D3
    description: "Containment локального адаптера: symlink на каталог и файл за корнем, висячий symlink, sibling-prefix, атомарная запись и временные файлы"
    requirement: STOR-02
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#local adapter: containment"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 93de4ad
plan_head_after: 93de4ad
---

# Phase 7 Plan 02: Контрактный набор хранилища Summary

**Один набор `describe.each` прогоняет createStorage над локальным адаптером (временный каталог), адаптером Supabase на поддельном HTTP под настоящим `createClient` и in-memory адаптером: 30 случаев на адаптер, включая 15 враждебных ключей с нулём вызовов адаптера и полный обход 150 объектов. `storage.local.test.ts` переписан на `createLocalAdapter`, README сервера описывает хранилище.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** около 10 мин
- **Started:** 2026-10-04T10:36Z
- **Completed:** 2026-10-04T10:46Z
- **Tasks:** 2 из 2
- **Files:** 3 (1 новый, 2 изменённых)

## Accomplishments

- `storage.contract.test.ts` — 90 тестов (30 × 3 адаптера):
  - фабрики `local` (`fs.mkdtempSync(os.tmpdir()/bio-exam-contract-)`, корень `data`, рядом `outside/secret.md`, удаление в `afterEach`), `supabase-fake` (`createSupabaseAdapter({ client: fakeSupabaseClient(fake, createClient), bucket: 'main', retries: 2, baseDelayMs: 1 })`), `memory` (`createMemoryAdapter()`);
  - каждый адаптер обёрнут шпионом `Proxy` (счёт вызовов по методам) и передан в `createStorage`;
  - отсутствующий ключ: `readText` → `null`, у шпиона ровно один `read` и всего один вызов; у `supabase-fake` журнал `fake.calls` равен `[{ GET /object/main/<ключ> }]` при `retries: 2`;
  - 150 файлов в одном каталоге (плюс один вложенный, который в прямой список не попадает) и 150 файлов в 3 подкаталогах для рекурсивного списка;
  - `listPage('images', { limit: 2, offset: 1 })` → `two.webp` (2 байта), `one.webp` (1 байт), `total` 3, `createdAt` строго убывает;
  - враждебные ключи — `test.each` с полем `name`, 11 обращений на ключ, после них `spy.total() === 0`, `fake.calls` пуст, снимок родительского каталога корня (имена и содержимое файлов) не изменился.
- `storage.local.test.ts` — 34 теста на `createLocalAdapter({ root })` и выбор драйвера. Импорта `./storage.js`, `StorageService` и `assertLegacyUploadsAllowed` нет. Комментарии из прежней версии файла удалены.
- `app/server/README.md` — раздел `## Хранилище файлов`: драйверы, порядок выбора, ключи и пространства имён, ключ → URL, таблица ошибок 400/404/409/503/500. Строка «Документы» — «картинки медиатеки через модуль хранилища». Команд `yarn` в разделе нет.

## Tracer (Task 1)

Первый прогон контрактного набора после написания: `Tests 90 passed (90)`. Красного прогона нет: адаптеры уже соответствовали порту после 07-01. Чтобы проверить, что набор ловит обход нормализации, на время сделана мутация `createStorage.read` (`adapter.read(key)` без `normalizeKey`): упали 45 случаев «hostile keys never reach the adapter» на всех трёх адаптерах. Файл `index.ts` восстановлен из копии, `git diff` по нему пуст. Повторный прогон после `oxfmt` зелёный, тогда начат Task 2.

## Расхождения адаптеров с портом

Расхождений нет. `adapters/local.ts`, `adapters/supabase.ts`, `adapters/memory.ts`, `keys.ts`, `index.ts` и `test-support/supabase-storage-fake.ts` не менялись: подделка уже сортирует, отдаёт `metadata.size` и `created_at` и держит лимит 100 по умолчанию.

## codegraph impact (D-24, до правок)

- `createStorage` — 20 символов: `index.ts` (`createStorage`, `storage`, `storageUrl`), `storage-known-defects.test.ts`, все методы оболочки `storage.ts` (`readFile`, `writeFile`, `readJson`, `writeJson`, `uploadBuffer`, `downloadBuffer`, `readFilesParallel`, `exists`, `deleteFiles`, `deleteDirectory`, `listFiles`, `listFilesRecursive`, `listFilesWithMeta`, `createZip`, `moveDirectory`).
- `createLocalAdapter` — 4 символа: `adapters/local.ts`, `index.ts` (`localAdapter`, `selectAdapter`).
- `createSupabaseAdapter` — 6 символов: `adapters/supabase.ts`, `storage-known-defects.test.ts` (`fakeAdapter`), `index.ts` (`selectAdapter`, `storage`).

Символы не менялись, правки только в тестах и README.

## codegraph affected (Task 2)

`codegraph affected storage.contract.test.ts storage.local.test.ts README.md` — 2 тестовых файла: `storage.contract.test.ts`, `storage.local.test.ts`. Оба зелёные, `yarn verify` зелёный.

## Удалённые случаи storage.local.test.ts

| Было (через `StorageService`) | Чем заменено |
|---|---|
| `relative STORAGE_LOCAL_DIR is rejected`, `missing STORAGE_LOCAL_DIR is rejected` | в том же файле: `a relative STORAGE_LOCAL_DIR is a StorageConfigError`, `an empty STORAGE_LOCAL_DIR …` через `resolveStorageDriver`, плюс `createLocalAdapter refuses a relative root` |
| `writeFile then readFile round-trips text` | контракт `writes and reads text` |
| `readFile of a missing key returns an empty string` | контракт `a missing object reads as null and does not exist`; `''` — поведение оболочки, закрепят тесты маршрутов 07-03…07-05 |
| `readFile of a directory returns an empty string` | в том же файле `a directory reads as null and does not exist as an object` |
| `writeFile overwrites and leaves no temporary files behind` | контракт `upsert true overwrites an existing object`; в том же файле `an overwrite is atomic and leaves no temporary files behind` |
| `writeJson and readJson round-trip`, `readJson of invalid JSON rejects` | контракт `writes and reads text`; JSON — оболочка, 07-03…07-05 |
| `uploadBuffer and downloadBuffer round-trip bytes` | контракт `writes and reads a buffer with its content type` |
| `uploadBuffer with upsert false refuses to overwrite` | контракт `upsert false over an existing object is a StorageConflictError and keeps the object` |
| `downloadBuffer of a missing key rejects` | контракт `a missing object reads as null …`; 404 — оболочка, 07-03…07-05 |
| `readFilesParallel returns a Map with only the existing keys` | контракт `a missing object reads as null …`, `writes and reads text`; оболочка — 07-03…07-05 |
| `exists is true for files only` | контракт `writes and reads text` (`exists` = true), `a missing object …` (false); каталог — в том же файле |
| `deleteFiles removes files and ignores missing keys` | контракт `remove deletes the listed objects and keeps the rest`, `removing a missing object is not an error` |
| `listFiles returns direct files sorted by name` | контракт `list of a directory with 150 objects returns all of them without recursion` (вложенный файл не попадает) |
| `listFiles of a lone subdirectory returns no entries` | контракт `recursive list returns 150 objects …`: прямой список каталога только с подкаталогами — `[]` |
| `listFilesRecursive returns full file keys` | контракт `recursive list returns 150 objects spread over 3 subdirectories` (и пустой префикс → `[]`) |
| `deleteDirectory removes a whole prefix and leaves siblings` | в том же файле `remove prunes empty parent directories …`; удаление префикса — оболочка, 07-03…07-05 |
| `getQuestionPath and getTestPath keep their shape` | оболочка; раскладку путей забирает модуль содержимого вопроса (07-03…07-05) |
| таблица `rejects <label>` через 12 методов оболочки | контракт `hostile keys never reach the adapter`; на уровне адаптера — в том же файле `the adapter itself rejects $name` |
| `a literal %2e%2e segment is rejected …` | контракт `encoded parent segment`, `double encoded parent segment` |
| `moveDirectory`: 9 случаев (перенос, перезапись, в свой подкаталог, нет источника, оба префикса, выход за корень, symlink приёмника, legacy `uploads`) | контракт `copy overwrites an existing destination …`, `copy into a new destination creates it`, `copy without a source is a StorageNotFoundError`; symlink — в том же файле `copy` в обе стороны через symlink; перенос как операция — оболочка, 07-03…07-05 |
| `getPublicUrl returns the proxy route` | контракт `storageUrl for images/ is the proxy route` |
| `createZip packs the files …` | оболочка; ZIP — 07-14 |
| `listFilesWithMeta pages direct files newest first` | контракт `listPage pages direct objects newest first with size, createdAt and total` |
| `createSignedUrl no longer exists` | оболочка; удалено |
| `isolated env never constructs a Supabase client … in-memory adapter serves it`, `isolated env selects the in-memory adapter` | в том же файле `an isolated process without a driver gets the in-memory adapter and no client`; работа маршрутов на памяти — `storage-memory-default.test.ts` |
| `without isolation … client is created once from the env values` | `storage-known-defects.test.ts#the Supabase client is created from SUPABASE_URL outside isolation` (проверка «ровно один раз» не перенесена) |
| `isolated env refuses the legacy … fallback`, `outside isolation the legacy fallback guard is a no-op` | удалены по плану (`assertLegacyUploadsAllowed` уходит вместе с запасным путём) |

Оставлены и переведены на `createLocalAdapter`: тип по расширению, сбой записи и временный файл, список без symlink, symlink на каталог (запись, чтение, `exists`, удаление, `copy` из и в, `list`), symlink на файл (чтение, перезапись, удаление, `copy` из и в), висячий symlink (запись и `copy` на него), sibling-prefix, symlink внутри корня, сообщение без путей хоста. Новые: временный файл `.tmp-<12 hex>` не попадает в список; удаление подрезает пустые каталоги до корня. Выбор драйвера: `local` в изоляции и вне её без клиента, изоляция без драйвера → memory, изоляция + `supabase` → `StorageConfigError`, без конфигурации → `StorageConfigError`.

## Решения исполнителя (автономно)

1. Тесты выбора драйвера оставлены в `storage.local.test.ts` (через `resolveStorageDriver`/`storage()` из `./index.js`). План требовал оставить только случай `STORAGE_DRIVER=local` в изоляции. Остальные проверки T-7-02 (изоляция + `supabase`, нет конфигурации) иначе пропали бы, а покрытие D1 из 07-01 ссылается на этот файл.
2. Таблица выхода за корень на уровне `createLocalAdapter` оставлена: это вторая линия защиты адаптера, контрактный набор её не проверяет.
3. Пауза между записями в `listPage` — 10 мс вместо 5 мс: время создания у local берётся из `birthtime`.
4. В README фраза «единственный путь к файлам хранилища» отнесена к модулю. Ветки `LOCAL_UPLOAD_DIR` в `assets.ts` и `/tmp/avatars` в `avatar.ts` пока на месте, их удаляют 07-03…07-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Пакеты `@bio-exam/rbac` и `@bio-exam/exam-core` в worktree не собраны**
- **Found during:** Task 2, прогон `vitest run src/services/storage`
- **Issue:** `storage-memory-default.test.ts` падал на `Failed to resolve entry for package "@bio-exam/rbac"`: нет `dist`.
- **Fix:** `yarn workspace @bio-exam/rbac build`, `yarn workspace @bio-exam/exam-core build`. `dist` в `.gitignore`, файлов к коммиту не добавилось.

**2. Первый `yarn verify` упал на таймаутах 5000 мс в тестах авторизации**
- **Found during:** Task 2
- **Issue:** `auth-known-defects.test.ts`, `refresh-rotation.test.ts`, `session-revocation.test.ts` — 5 тестов `Test timed out in 5000ms` при load average 14 (параллельно идёт фаза 5). Хранилище эти тесты не затрагивают.
- **Fix:** правок нет. Три файла отдельно — `47 passed`, повторный `yarn verify` — `OK`.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage/storage.contract.test.ts` → `Tests 90 passed (90)`; проверка содержимого → `contract cases present`.
- Task 2:
  - `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage` → `Test Files 4 passed (4)`, `Tests 171 passed (171)`;
  - `yarn verify` → `yarn verify: OK`, все шаги `passed`; server 26 файлов, 584 теста; web 454; exam-core 498; rbac 2;
  - проверка `local adapter tests and docs ok`;
  - сверка с отпечатком `.planning/commit-snapshots/before-07-02/fingerprint.json` (0 путей до плана) → `07-02 changed only its files`.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **Живой адаптер Supabase** проверяется на preview Vercel по списку 07-16 (D-27). В `yarn verify` он проходит набор на подделке клиента.
2. **Коммит файлов плана** делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет. Новых маршрутов и путей доступа нет. Митигации:

- T-7-04: шпион адаптера, 0 вызовов на каждый из 15 враждебных ключей по всем операциям на трёх адаптерах;
- T-7-05: symlink и висячий symlink в `storage.local.test.ts` на `createLocalAdapter`;
- T-7-SC: установок пакетов нет.

## Файлы к коммиту

```
app/server/src/services/storage/storage.contract.test.ts
app/server/src/services/storage/storage.local.test.ts
app/server/README.md
```

## Self-Check: PASSED

- `storage.contract.test.ts` существует (`??` в `git status`), `storage.local.test.ts` и `README.md` изменены (` M`).
- Коммитов нет по правилу пользователя; `commits: 0` при изменениях в рабочем дереве — следствие этого правила.
