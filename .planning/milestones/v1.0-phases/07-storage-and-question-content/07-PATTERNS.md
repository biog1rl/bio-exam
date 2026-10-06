# Phase 7: Storage and question content - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 38 (новых и изменяемых; список по `07-CONTEXT.md` D-01...D-27 и `<code_context>`)
**Analogs found:** 33 / 38 (5 без полного аналога, см. «No Analog Found»)

Статус аналогов в git (HEAD 806c6d4). Все названные аналоги отслеживаются git (`git ls-files` проверен для `services/access-policy/*`, `services/session/*` (кроме правок рабочего дерева), `test-support/*`, `db/session-backfill.test.ts`, `routes/auth/me-requirePerm-parity.test.ts`, `scripts/auth-no-role-string-checks.test.mjs`, `scripts/exam-core-no-private-copies.test.mjs`, `src/scripts/*`, `MediaLibrary.tsx`). Зеркал `.gsd/capabilities` в аналогах нет.

Рабочее дерево: фаза 4 ещё правит `routes/auth/*`, `routes/users/index.ts`, `routes/users/profile.ts`, `middleware/auth/session.ts`, `services/session/index.ts` (не закоммичено; `routes/users/sessions.ts` untracked). Номера строк сняты с рабочего дерева. Для `routes/users/index.ts` сверить строки перед планированием: `/` сейчас `:37-132`, подключение `sessionsRouter` добавлено в начале файла.

Фаза 7 ничего не копирует из `routes/*` по структуре модулей: модулей `services/storage/*` и `services/question-content/*` в виде каталогов ещё нет, есть монолит `services/storage/storage.ts` (913 строк). Образец формы каталога-модуля с `index.ts`, чистым ядром и шовом адаптера: `services/access-policy/` (фаза 4).

## File Classification

### Хранилище (план 2)

| Новый/изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|---|---|---|---|---|
| `app/server/src/services/storage/port.ts` (типы порта, типизированные ошибки) | service (интерфейс) | CRUD / file-I/O | `services/access-policy/policy.ts` (типы `GrantsLoader`, `AccessPolicy`) + публичные сигнатуры `StorageService` (`storage.ts:329-870`) | role-match |
| `.../keys.ts` (нормализация ключа, пространства имён, «чужой префикс») | utility | transform | `storage.ts:133-143` `assertSafeLocalKey`, `:122-126` `isInsideRoot` | role-match |
| `.../adapters/local.ts` | service | file-I/O | `storage.ts:76-327` (локальный режим) | exact (вынос) |
| `.../adapters/supabase.ts` | service | file-I/O | `storage.ts:329-913` (ветки Supabase, `withRetry` `:340-360`) | exact (вынос) |
| `.../adapters/memory.ts` (с инъекцией сбоев) | service (test double) | file-I/O | `routes/uploads.test.ts:18-30` (подделка) | role-match |
| `.../index.ts` (выбор адаптера, ключ → URL, `createZip` из списка) | service | request-response | `services/access-policy/index.ts` (сборка синглтона через фабрику) | role-match |
| `.../storage.contract.test.ts` (`describe.each` по трём адаптерам) | test | file-I/O | `services/storage/storage.local.test.ts` | role-match |
| `services/storage/storage.local.test.ts` (symlink-тесты остаются у локального адаптера) | test | file-I/O | сам файл | exact |
| `app/server/src/services/assets/*` (загрузка, удаление, разрешение ссылок) | service | file-I/O + transform | `routes/docs/assets.ts:60-250` (логика уходит в сервис) | exact (вынос) |
| `app/server/.env.example`, `README.md` (порядок выбора драйвера) | config | - | существующие строки `STORAGE_DRIVER` в `.env.example:59-65` | exact |

### Маршруты ассетов и аватаров, права (план 3)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `routes/docs/assets.ts` (права `tests.write`, пространства имён, `/signed` как разрешение ссылки) | controller | request-response | сам файл + `middleware/auth/requirePerm.ts:23-33` | exact |
| `routes/users/avatar.ts` (ключи `avatars/<id>/<hex>.<ext>`, кроп и удаление через модуль) | controller | CRUD / file-I/O | сам файл, `routes/uploads.test.ts:203-238` (поведение) | exact |
| `routes/users/profile.ts:18,78,92` (URL → ключ перед записью) | controller | CRUD | сам файл | exact |
| `routes/auth/me.ts:31-32` (ключ → URL аватара) | controller | request-response | сам файл | exact |
| `routes/tests/index.ts:2306-2350` (`POST /:id/assets` на сервис ассетов) | controller | file-I/O | `routes/docs/assets.ts` POST (сигнатура `file-type`, sharp 1920 q85) | exact |
| `app.ts:86-89` (удалить статику `/uploads`), `app/web/next.config.ts:34` | config | - | сами файлы | - |
| `routes/uploads.test.ts` (переключить на in-memory адаптер) | test | request-response | сам файл `:1-80` | exact |

### Модуль содержимого вопроса (планы 5, 6, 7)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `services/question-content/index.ts` + операции (create/update/move/delete/read/reorder/export) | service | CRUD + file-I/O | `routes/tests/index.ts:1381-2457` (логика уходит из роутера), форма каталога: `services/access-policy/` | exact (вынос) |
| `.../paths.ts` (кандидаты чтения, канонический ключ с ревизией) | utility | transform | `routes/tests/public.ts:53-90` `buildQuestionMarkdownCandidates`, `storage.ts:852-864` `getQuestionPath`/`getTestPath` | exact (вынос) |
| `.../order.ts` (перенумерация под `FOR UPDATE`) | service | CRUD | `routes/tests/index.ts:1742-1750, 1993-1998, 2134-2155, 2219-2225` (четыре механизма) | exact (консолидация) |
| `.../asset-refs.ts` (извлечение ссылок на картинки) | utility | transform | `TestRunner.tsx:93-110` `extractImagePaths`, `MediaLibrary.tsx:89-106` `checkUsageInEditor` | role-match |
| `services/search/question-documents.ts` (запись в транзакции) | service | CRUD | сам файл (сейчас `pgPool` вне транзакции) | exact |
| `routes/tests/index.ts`, `public.ts` (делегирование модулю) | controller | request-response | `routes/auth/login.ts` и `me.ts` после фазы 4 (тонкий обработчик над `services/session`) | role-match |
| `src/scripts/backfill-question-search.ts:56`, `src/scripts/e2e-seed.ts:152-185` | script | batch | сами файлы | exact |
| `src/scripts/asset-refs.ts` (инвентаризация и бэкфилл, `assets:refs`) | script | batch | `src/scripts/backfill-question-search.ts` + скрипт в `app/server/package.json:18` (`search:backfill`) | exact |
| `src/scripts/storage-reconcile.ts` (сверка, отчёт по умолчанию) | script | batch | `src/scripts/backfill-question-search.ts` | role-match |

### Индекс ссылок: миграция и схема (план 7)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/drizzle/00NN_<имя>.sql` (номер: следующий свободный на момент исполнения) | migration | batch | `drizzle/0021_auth_sessions.sql` | exact |
| `drizzle/meta/_journal.json`, `meta/00NN_snapshot.json`, `migrations-manifest.json` | config | - | записи `idx 21` | exact |
| `app/server/src/db/schema.ts` (таблица ссылок, колонка-маркер) | model | CRUD | `schema.ts` `authSessions` (RLS, `denyDirectAccessPolicy()`, FK cascade, индекс) | exact |
| `app/server/src/db/asset-refs-backfill.test.ts` (миграция над существующими вопросами) | test | CRUD / batch | `app/server/src/db/session-backfill.test.ts` | exact |

### Справочник (план 8)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `packages/rbac/src/roles.ts:25-30` (`user.grants` → `{}`), `packages/rbac/src/index.test.ts` | config/test | transform | сами файлы | exact |
| `routes/users/index.ts` (`GET /directory` перед параметрическими) | controller | request-response | `routes/users/index.ts:37-132` (`GET /`) | role-match |
| `routes/users/directory.test.ts` (матрица 401/403/200) | test | request-response | `routes/tests/access-routes.test.ts` | exact |
| `services/access-policy/policy.test.ts:175-179`, `routes/auth/me-requirePerm-parity.test.ts:112-116,123-126,172` | test | request-response | сами файлы | exact |

### Тесты, красные проверки, охрана, e2e (планы 1, 9)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `routes/tests/question-content-characterization.test.ts`, `routes/docs/assets-characterization.test.ts`, `routes/users/avatar-characterization.test.ts` (`KNOWN_DEFECTS` + `test.fails`) | test | request-response | `routes/auth/auth-known-defects.test.ts:6-18` + `routes/tests/access-routes.test.ts` | exact |
| `scripts/storage-no-private-access.test.mjs` (охранный тест, D-25) | test (repo guard) | transform | `scripts/auth-no-role-string-checks.test.mjs`, `scripts/exam-core-no-private-copies.test.mjs` | exact |
| `e2e/tests/assets.spec.ts` (картинка в редакторе, студент видит, отказ удаления, 403 на `/api/users`) | test | e2e | `e2e/tests/authoring.spec.ts`, `e2e/tests/session.spec.ts`, `e2e/fixtures/exam.ts` | exact / role-match |
| `app/web/lib/image-signed-url-cache.ts`, `MdxRenderer.tsx:39-43`, `image-component.tsx:86`, `TestRunner.tsx:93-110,572-587` | component/utility | request-response | `lib/image-signed-url-cache.ts` (оставить одну функцию «src → URL через API» с кэшем) | exact |
| `MediaLibrary.tsx:110-131` (текст отказа сервера, скрытие без `tests.write`) | component | request-response | сам файл `:110-131` | exact |

## Pattern Assignments

### `services/storage/adapters/*`, `port.ts`, `keys.ts` (service, file-I/O)

**Analog:** `app/server/src/services/storage/storage.ts` (разбирается на части; публичные сигнатуры класса: `readFile`, `downloadBuffer`, `readFilesParallel`, `writeFile`, `uploadBuffer`, `getPublicUrl`, `createSignedUrl`, `writeJson`, `deleteFiles`, `listFiles`, `listFilesRecursive`, `deleteDirectory`, `moveDirectory`, `createZip`, `exists`, `listFilesWithMeta`).

**Выбор драйвера: что сейчас и во что превращается** (`storage.ts:35-95`):
```typescript
function isConfigured(): boolean {
	if (isIsolatedEnv()) return false
	return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
}
function getClient(): SupabaseClient | null {
	if (isIsolatedEnv()) return null
	if (isLocalStorage()) return null
	if (!isConfigured()) { showConfigWarning(); return null }
	if (!supabase) { supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!) }
	return supabase
}
function isLocalStorage(): boolean { return process.env.STORAGE_DRIVER === 'local' }
```
D-01: вместо `return null` и тихого запасного пути без конфигурации — явная ошибка конфигурации при первом обращении; Supabase в изолированном процессе запрещён всегда (`isIsolatedEnv()` из `config/test-database-url.js` сохраняется). Переменные читаются при каждом вызове (`isLocalStorage` комментарий `:95`), чтобы тесты могли менять окружение: сохранить.

**Containment локального адаптера (переносится как есть)** (`storage.ts:133-196`): `assertSafeLocalKey` (пустой ключ, NUL, `/`, `\`, буква диска, сегмент `..`), `resolveLocalPath(key, { forWrite })` с realpath корня, проверкой глубокого существующего предка и отклонением висячего symlink. D-02 добавляет к этому одну общую `normalizeKey` в `keys.ts`: декодирование до неподвижной точки (до 3 раз), сегменты `.`/`..`/пустые, управляющие символы. Сейчас литерал `%2e%2e` в локальном адаптере остаётся обычным именем (`:157-158` JSDoc): контрактный набор D-05 требует отказ на `%2e%2e` и `%252e%252e` на всех адаптерах, это меняет поведение локального адаптера. Тесты в `storage.local.test.ts`, закрепляющие «литерал не декодируется», переключить.

**Атомарная запись** (`storage.ts:199-212`): временный файл с суффиксом `.tmp-<12 hex>` (`LOCAL_TEMP_SUFFIX` `:80`) и `rename`; список обходит `LOCAL_TEMP_SUFFIX`. Копировать в локальный адаптер без изменений, добавить `copy` и `listWithMeta` (сейчас `listFilesWithMeta` бросает `unsupportedInLocal`, `:879`).

**Повторы Supabase** (`storage.ts:340-360`, `withRetry(fn, retries = 3, baseDelayMs = 500)`, экспоненциальная задержка): живёт внутри адаптера Supabase (D-03).

**Пагинация и метаданные, что чинится (D-04)** (`storage.ts:627-669`): `list(prefix, { sortBy })` без `limit` отдаёт 100 записей; рекурсивный обход различает папку по `item.id === null`. Адаптер обходит `offset += limit` до пустой страницы. Подделка клиента в контрактном наборе воспроизводит лимит 100 по умолчанию, `id: null` у папок и ошибку «not found».

**Ошибки (D-03):** сейчас `readFile` возвращает `''` при ошибке (`storage.ts:368-385`), `readFilesParallel` прячет ошибки в `''` (`:441-447`), `listFiles` возвращает `[]` при ошибке (`:635-638`). Новый порт: отсутствие объекта → `null`, остальное → типизированная ошибка (400 ключ, конфликт при `upsert: false`, 5xx недоступно). Образец типизированной ошибки с HTTP-статусом: `app/server/src/lib/errors.ts`.

**`moveDirectory` Supabase** (`storage.ts:690-733`): download+upload+delete. D-01 заменяет на серверный `copy` SDK; ветка `:735-782` (запасной путь `../web/public/uploads`) удаляется.

---

### `services/storage/storage.contract.test.ts` (test, file-I/O)

**Analog:** `app/server/src/services/storage/storage.local.test.ts` (603 строки; тесты без БД, временный каталог).

**Imports и подделка клиента Supabase** (`storage.local.test.ts:1-50`):
```typescript
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import { StorageService } from './storage.js'

const createClientSpy = vi.hoisted(() => vi.fn())
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))

beforeAll(() => {
	base = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-storage-'))
	root = path.join(base, 'data')
	...
})
```
`vi.hoisted` обязателен, чтобы шпион переживал `vi.resetModules()`. `createClientSpy.mockImplementation(() => ({ storage: { from: () => ({...}) } }))` в `beforeEach` (`:48-50`): расширить до подделки со стабильным состоянием `Map<string, Buffer>`, лимитом 100 в `list` и `id: null` у папок.

**`describe.each` по адаптерам** (D-05): образец таблицы случаев — `test.each` в `services/access-policy/policy.test.ts:42-64` (`test.each<{ name; ... }>([...])('$name', ...)`); для набора: `describe.each([{ name: 'local', make }, { name: 'supabase-fake', make }, { name: 'memory', make }])`. Обязательные случаи: запись/чтение, upsert и конфликт, отсутствие → `null`, удаление отсутствующего, `copy`, 150 объектов в одном каталоге, метаданные и пагинация, URL по ключу, отказ на `../`, `..%2f`, `%2e%2e`, `%252e%252e`, абсолютный путь, `\`, NUL, `main/…`, URL Supabase как ключ. Тесты symlink остаются в `storage.local.test.ts` (только у локального адаптера).

**Проверка «ничего не изменилось за корнем»** (`storage.local.test.ts:23-34`): функция `snapshot(dir)` рекурсивно собирает относительные пути; применять в отрицательных случаях локального адаптера.

---

### `services/storage/adapters/memory.ts` (service, test double)

**Analog:** `app/server/src/routes/uploads.test.ts:18-30`

```typescript
const uploads = vi.hoisted(() => [] as Array<{ path: string; buffer: Buffer; contentType: string }>)
const createClientSpy = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))

vi.mock('../services/storage/storage.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../services/storage/storage.js')>()
	const fake = Object.create(actual.storageService) as typeof actual.storageService
	fake.isConfigured = () => true
	fake.uploadBuffer = async (path: string, buffer: Buffer, contentType?: string) => {
		uploads.push({ path, buffer, contentType: contentType ?? '' })
	}
	fake.getPublicUrl = (path: string) => `https://storage.test/${path}`
	fake.deleteFiles = async () => {}
	return { ...actual, storageService: fake }
})
```
Это самодельная подделка, которую заменяет in-memory адаптер: `Map<string, { data: Buffer; contentType; createdAt }>` внутри адаптера, те же операции порта, инъекция сбоев `failOn({ op: 'write' | 'copy' | 'delete', key })`. Тесты выбирают адаптер через `STORAGE_DRIVER=memory` или подмену фабрики в `services/storage/index.ts`; `vi.resetModules()` + динамический `import('../app.js')` (`uploads.test.ts:55-62`) подхватывает выбор.

**Условия выбора в изолированном процессе:** `uploads.test.ts` идёт на подделке потому, что изолированный `isConfigured()` возвращает `false` (`storage.ts:35-39`). После фазы 7 тесты, не задающие адаптер, получают явную ошибку конфигурации (D-01), поэтому каждому тесту маршрутов, который ходит в хранилище, нужен in-memory адаптер по умолчанию в изолированном режиме: решение планировщика (по умолчанию: `BIO_EXAM_ISOLATED_ENV=1` без `STORAGE_DRIVER` → memory).

---

### `services/storage/index.ts` и `services/question-content/index.ts` (service, фабрика с синглтоном)

**Analog:** `app/server/src/services/access-policy/index.ts` (фаза 4, tracked)

**Форма модуля: фабрика с портом + синглтон + функции уровня запроса** (`index.ts:1-40`):
```typescript
import { db } from '../../db/index.js'
import { createDrizzleGrantsLoader } from './grants-loader.js'
import { createAccessPolicy, type AccessSet } from './policy.js'

export { computeAccess, createAccessPolicy, ..., type GrantsLoader } from './policy.js'
export { createDrizzleGrantsLoader, createInMemoryGrantsLoader } from './grants-loader.js'

export const accessPolicy = createAccessPolicy({ loader: createDrizzleGrantsLoader(db) })
```
Применение: `createQuestionContent({ db, storage })` принимает шов хранилища и транзакцию БД; синглтон `questionContent` собирается в `index.ts`; тесты модуля собирают его с in-memory адаптером и подделкой `db` не нужны (через `test_*`). Раскладка `policy.ts` (чистое ядро, без импорта `db`) + `grants-loader.ts` (адаптеры шва) + `index.ts` (сборка) переносится: чистое ядро путей, ревизий и извлечения ссылок отдельно от записи.

**Модуль сессии как второй образец транзакционной операции** (`services/session/index.ts:1-40`): `type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]`, дискриминируемые результаты операций (`{ outcome: 'rotated' } & IssuedSession`), атомарность в `db.transaction`. Операции содержимого вопроса возвращают результат того же вида, маршрут отображает его в код ответа.

---

### `services/question-content/*` (service, CRUD + file-I/O)

**Analog (логика, откуда выносится):** `app/server/src/routes/tests/index.ts` и `routes/tests/public.ts`. Файл `index.ts` большой, поэтому для каждой операции сначала `codegraph node` по символу, затем чтение диапазона из D-08 (`:344-385`, `:971-1074`, `:1291-1379`, `:1381-1544`, `:1546-1700`, `:1702-1832`, `:1834-1954`, `:1957-2013`, `:2016-2187`, `:2190-2286`, `:2358-2457`).

**Перебор кандидатов чтения (сводится в одну функцию модуля, список и порядок не меняются)** (`public.ts:53-90`):
```typescript
const candidates = [
	storedPath,
	`topics/${topicSlug}/${testSlug}/questions/${questionId}/${fileName}`,
	`topics/${topicSlug}/${testSlug}/questions/${testId}/${fileName}`,
	`topics/${topicSlug}/${testId}/questions/${questionId}/${fileName}`,
	`topics/${topicSlug}/${testId}/questions/${testId}/${fileName}`,
].filter((value): value is string => typeof value === 'string' && value.length > 0)
return [...new Set(candidates)]
...
async function readFirstMarkdown(candidates: string[]): Promise<string> {
	for (const candidate of candidates) {
		const content = await storageService.readFile(candidate)
		if (content.trim().length > 0) return content
	}
	return ''
}
```
Изменение по D-03: `readFile` теперь бросает при недоступном хранилище и возвращает `null` при отсутствии; `readFirstMarkdown` пропускает `null` и пустой текст, итог `''` только если ни один кандидат не найден (D-08: отсутствие файла у вопроса — пустой текст; недоступность — ошибка). Копия в `index.ts:2668-2672` удаляется.

**Запись: порядок D-09** (файлы → транзакция → удаление старых), образец транзакции с побочными записями вне её: `scripts/e2e-seed.ts:152-185` (`db.transaction`, затем `writeFile` и `upsertQuestionSearchDocument` после commit). Новое: документ поиска и индекс ссылок пишутся внутри транзакции (поэтому `question-documents.ts` принимает `tx`/исполнитель вместо глобального `pgPool`), компенсация (удаление новых файлов) при сбое транзакции, лог сирот при сбое удаления после commit.

**Порядок (D-11):** `SELECT … FOR UPDATE` на строке теста и перенумерация 0…n-1 по `(order, created_at, id)`. Образец блокировки и сдвига в Drizzle внутри `db.transaction`: текущие четыре места `index.ts:1742-1750`, `:1993-1998`, `:2134-2155`, `:2219-2225`; в новом коде они заменяются одной функцией `renumberTest(tx, testId)`. Образец `FOR UPDATE` в проекте искать: `codegraph explore "forUpdate FOR UPDATE transaction"` (в аналогах фазы 4 `services/session/index.ts` использует `sql` с блокировкой при ротации; сверить прямым чтением перед копированием).

**Копировать, переключить, удалить (D-10):** в проекте аналога нет (см. «No Analog Found»); текущий `moveDirectory` (`storage.ts:690-733`) — единственный перенос и он ненадёжен.

---

### `routes/docs/assets.ts` и сервис ассетов (controller, request-response + file-I/O)

**Analog:** сам `app/server/src/routes/docs/assets.ts`

**Imports и точки, которые уходят** (`assets.ts:1-30`):
```typescript
import crypto from 'crypto'
import { Router } from 'express'
import { fileTypeFromBuffer } from 'file-type'
import fs from 'fs'
import multer from 'multer'
import path from 'path'
import sharp from 'sharp'

import { sessionRequired } from '../../middleware/auth/session.js'
import { assertLegacyUploadsAllowed, storageService } from '../../services/storage/storage.js'

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '../web/public/uploads/images')
...
function isSafeStoragePath(filePath: string): boolean { ... }      // :19-23, режет только traversal
function buildProxyUrl(filePath: string): string {                  // :25-27
	return `/api/docs/assets/proxy?path=${encodeURIComponent(filePath)}&cacheNonce=${Date.now()}`
}
```
(`fs`, `path`, `multer.diskStorage`, `assertLegacyUploadsAllowed`, `LOCAL_UPLOAD_*` удаляются; `multer.memoryStorage()` остаётся; лимит 5 МБ и `ALLOWED_MIMES` (`:32-52`) остаются.)

**Права (D-14):** добавить `requirePerm('tests', 'write')` после `sessionRequired()` на `GET`, `POST`, `DELETE` (`:63`, `:113`, `:144`); `/proxy` и `/signed` — только сессия. Образец записи маршрута: `routes/users/index.ts:37`:
```typescript
router.get('/', sessionRequired(), requirePerm('users', 'read'), async (req, res, next) => {
```
Для пространств имён `/proxy` и `/signed`: функция `isServableImageKey(key)` в `services/storage/keys.ts`, параметризованная списком пространств (`images/`, `topics/*/*/assets/`, `avatars/`) и расширениями изображений; отклонение до обращения к адаптеру.

**Сигнатура и конвертация (остаются, переезжают в сервис ассетов)**: проверка `fileTypeFromBuffer` против `ALLOWED_MIMES`, `sharp(...).resize(1920, ...).webp({ quality: 85 })`, ключ `images/${crypto.randomBytes(16).toString('hex')}.webp` (D-15). Сервис — единственное место, куда пишут `images/`.

**Тест маршрута (сквозной через `app.ts`)** — `routes/uploads.test.ts:1-80` (см. ниже); множество кодов ответа и форма `GET /api/docs/assets` (`files`, `total`) не меняются.

---

### `routes/users/avatar.ts` (controller, CRUD + file-I/O)

**Analog:** сам файл + поведение `routes/uploads.test.ts:203-238`.

Что меняется: `fs`, `UPLOAD_DIR`, `/tmp/avatars` (`:5-53`, `:77-133`, `:252-316`, `:331-349`, `:399-417`) уходят; запись и удаление через порт. Ключ `avatars/<userId>/<hex>.<ext>` (D-07). Извлечение ключа из старого значения вместо регулярки (`:190-196`) — функция модуля «значение из БД → ключ».

Перевод «значение → URL» применяется в трёх ответах (`routes/users/index.ts:53-54`, `routes/auth/me.ts:31-32`, `routes/users/profile.ts:92`); имя и место — Discretion. Рекомендация планировщику: одна функция `avatarUrl(value)` в `services/storage/index.ts` + общий сериализатор DTO пользователя; ровно такой же двойной адаптер принимает ключ, публичный URL своего бакета, `/uploads/avatars/…` и пропускает чужой URL как есть.

**Переключаемые тесты** (`uploads.test.ts:203-238`): ожидания `reply.body.avatarUrl`/`avatarCroppedUrl` (`:224-225`) становятся «в БД ключ, в ответе URL по правилу модуля»; подделка `getPublicUrl → https://storage.test/…` (`:28`) заменяется на in-memory адаптер.

---

### `routes/uploads.test.ts`, характеризационные тесты маршрутов (test, request-response)

**Analog:** `app/server/src/routes/uploads.test.ts:1-80` и `app/server/src/test-support/auth-app.ts` (предпочтительнее для новых файлов).

**Предпочтительный старт сервера: `startAuthApp`** (`test-support/auth-app.ts:46-75`; `access-routes.test.ts:100-125`, `me-requirePerm-parity.test.ts:32-58`):
```typescript
import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

let ctx: AuthApp
const jars = new Map<Profile, CookieJar>()

beforeAll(async () => {
	ctx = await startAuthApp('test_access_routes')
	const { db, schema } = ctx
	const [topic] = await db.insert(schema.topics).values({ slug: 'access-topic', title: 'Тема доступа', isActive: true })
		.returning({ id: schema.topics.id, slug: schema.topics.slug })
	...
	for (const profile of PROFILES) {
		const id = await seedUser(ctx, { login: `access_${profile.name}`, roles: profile.roles, password: PASSWORD })
		if (profile.grants.length > 0) {
			await db.insert(schema.rbacUserGrants).values(profile.grants.map((grant) => ({ userId: id, ...grant })))
		}
		const reply = await login(ctx, `access_${profile.name}`, PASSWORD)
		assert.equal(reply.status, 200, `login ${profile.name}`)
		jars.set(profile.name, reply.jar)
	}
}, 60_000)

afterAll(async () => { await ctx?.stop() })
```
`startAuthApp(prefix)` создаёт `test_*` базу, мигрирует, делает `vi.resetModules()` и импортирует `app.js`, поэтому переменные окружения (`STORAGE_DRIVER`) надо задать до вызова. `call(ctx, method, path, { cookies, body })` и `login()` проходят настоящий вход; `sessionCookieFor(user)` из `test-support/http.ts:5-9` теперь асинхронный и выдаёт настоящую сессию через `openSession`.

**Загрузка multipart и ожидаемые ответы:** `uploads.test.ts` (мультипарт через `http`, `sharp`-генерируемый PNG, `oversize` на 5 МБ) остаётся образцом для `POST /api/docs/assets` и аватара.

**Красные проверки (`KNOWN_DEFECTS` + `test.fails`)** (`auth-known-defects.test.ts:6-18`):
```typescript
const KNOWN_DEFECTS = new Set(['AUTH-06-foreign-ip'])

function defectTest(id: string, title: string, fn: () => Promise<void>): void {
	const name = `${id}: ${title}`
	if (KNOWN_DEFECTS.has(id)) test.fails(name, fn)
	else test(name, fn)
}
```
Идентификаторы D-23 (`STOR-D6a`, `STOR-D6b`, `STOR-rename-topic-files`, `STOR-rename-test-rollback`, `STOR-student-reads-answer-keys`, `STOR-student-deletes-asset`, `STOR-delete-used-asset`, `STOR-zip-no-images`, `STOR-export-writes-answer-keys`, `STOR-save-order-holes`, `PRIV-user-gets-users`, `STOR-supabase-100-limit`, `STOR-readFile-empty-on-outage`, `STOR-avatar-crop-delete-supabase`). Чинящий план удаляет свой id из константы (тест тогда обязан пройти).

---

### `app/server/drizzle/00NN_<имя>.sql` + `meta/*` + `migrations-manifest.json` (migration, batch)

**Analog:** `app/server/drizzle/0021_auth_sessions.sql` (аддитивная миграция с бэкфиллом, сгенерирована `drizzle-kit generate`)

Формат (разделитель `--> statement-breakpoint`, RLS и политика отдельными операторами):
```sql
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	...
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_user_id" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "auth_sessions" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);--> statement-breakpoint
INSERT INTO "auth_sessions" ("id", "user_id", "created_at", "last_refreshed_at")
SELECT "id", "user_id", "created_at", "created_at"
FROM "refresh_tokens"
WHERE "revoked_at" IS NULL AND "expires_at" > now() AND "session_id" IS NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "refresh_tokens" SET "session_id" = "id"
WHERE ... AND "session_id" IS NULL AND EXISTS (...);
```
Применение: таблица `question_asset_refs (question_id uuid FK ON DELETE cascade, asset_key text, PK (question_id, asset_key), индекс по asset_key)` + RLS + `deny_direct_access`; колонка-маркер `questions.assets_indexed boolean DEFAULT false NOT NULL` (D-17). Бэкфилл миграции идемпотентен (`ON CONFLICT DO NOTHING`, `WHERE ... IS NULL`), и на базе без вопросов индекс полон сам собой (маркер-колонка). Номер миграции — следующий свободный на момент исполнения (после фаз 4 и 5): не фиксировать `0022` в плане, брать `_journal.json` последнюю запись.

**Метаданные** (шаблон — запись `idx 21` в `drizzle/meta/_journal.json` и `migrations-manifest.json`; `scripts/check-migrations.mjs` в `yarn verify` сверяет sha256): никогда не править применённую миграцию; новый снапшот `meta/00NN_snapshot.json` генерирует `drizzle-kit generate` (проверить, что манифест обновлён тем же способом, что в плане 04-03; сверить с `scripts/check-migrations.test.mjs`).

**Схема Drizzle** (`db/schema.ts`, образец `authSessions`):
```typescript
export const authSessions = pgTable(
	'auth_sessions',
	{ ...},
	(t) => ({
		userIdIdx: index('idx_auth_sessions_user_id').on(t.userId),
		userIdFk: foreignKey({ name: 'auth_sessions_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()
```
Имена индекса и внешнего ключа в схеме совпадают с именами в SQL миграции (иначе `drizzle-kit generate` предложит дрейф). `denyDirectAccessPolicy()` — `schema.ts:42-51`.

---

### `app/server/src/db/asset-refs-backfill.test.ts` (test, CRUD / batch)

**Analog:** `app/server/src/db/session-backfill.test.ts` (193+ строк)

**Подготовка: мигрировать до N-1, вставить данные, применить N настоящим мигратором** (`:60-110`):
```typescript
function prepareMigrationsUpTo0020(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-backfill-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')) as { entries: Array<{ idx: number }> }
	journal.entries = journal.entries.filter((entry) => entry.idx <= 20)
	...
	for (const file of fs.readdirSync(dir)) {
		if (file.startsWith('0021_')) fs.rmSync(path.join(dir, file))
	}
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_auth_backfill')
	copyDir = prepareMigrationsUpTo0020()
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	... INSERT исходных строк ...
	await migrateTestDatabase(scratch.url)
}, 120_000)
```
Применение: параметризовать номером новой миграции (`MIGRATION_TAG`, порог `idx <=` = номер минус один, количество записей `__drizzle_migrations` на единицу больше), вставить вопросы с разными `prompt_path`, применить миграцию, проверить: на базе с вопросами признак полноты `false` у всех, на пустой базе индекс полон, повторный прогон операторов бэкфилла меняет 0 строк (`backfillStatements()` `:63-78`, фильтр по `startsWith('INSERT INTO ...')` и `rowCount === 0`), таблица имеет RLS и политику `deny_direct_access` (`:195-`), манифест sha256 совпадает (`:121-136`). Имя базы `test_*` через `createScratchDatabase('test_<имя>')` из `test-support/test-database.ts`.

---

### `app/server/src/scripts/asset-refs.ts` и `storage-reconcile.ts` (script, batch)

**Analog:** `app/server/src/scripts/backfill-question-search.ts`

**Шапка и обход всех вопросов** (`:1-40`):
```typescript
import '../config/env.js'
import { asc, eq, inArray } from 'drizzle-orm'

import { db, pgPool } from '../db/index.js'
import { questions, tests, topics } from '../db/schema.js'
import { storageService } from '../services/storage/storage.js'

type BackfillCounters = { processed: number; inserted: number; skipped: number; failed: number }

async function main() {
	const counters: BackfillCounters = { processed: 0, inserted: 0, skipped: 0, failed: 0 }
	const rows = await db.select({ ... }).from(questions)
		.innerJoin(tests, eq(tests.id, questions.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.orderBy(asc(questions.createdAt))
```
Подключение команды: `app/server/package.json:18` `"search:backfill": "tsx src/scripts/backfill-question-search.ts"` → `"assets:refs": "tsx src/scripts/asset-refs.ts"`. Правило README: команда `yarn ...`, написанная в доке, обязана существовать (`scripts/check-docs-commands.mjs`). По умолчанию скрипт печатает инвентаризацию, запись и признак полноты — только по флагу (D-17); то же для сверки (D-27). Чтение промптов идёт через модуль содержимого, не через `storageService` напрямую (D-08).

**Сид e2e** (`src/scripts/e2e-seed.ts:152-185`): `storageService.getQuestionPath(...) + '/prompt.md'` и `storageService.writeFile` после транзакции заменяются вызовом модуля содержимого (D-26); `getQuestionPath` и `getTestPath` (`storage.ts:852-864`) переходят в модуль.

---

### `routes/users/index.ts` `GET /directory` и тесты прав (controller + test)

**Analog (маршрут):** `routes/users/index.ts:37-132` (`GET /`)

Шапка маршрута и пагинация (`:37-41`): `sessionRequired()`, `requirePerm`, `Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)`. Для `/directory`: только `sessionRequired()`, `limit` 1…20 (по умолчанию 10), `q` ≥ 2 символов иначе 400, только активные, выбор строго `id, name, firstName, lastName, initials, avatarColor, avatarCropped` (поля из того же `select`, `:45-60`). Регистрация до параметрических маршрутов (`/:id`, `/:userId/...`) и после `router.use('/', sessionsRouter)`: проверить порядок после фазы 4, `sessionsRouter` может перехватывать пути первым (`routes/users/sessions.ts`).

Экранирование поиска: в `routes/` использовать существующий образец поиска по имени (`codegraph explore "ilike users search name"`); `services/search/database-search.ts:81-92` уже показывает условие `privileged && users.read` для поиска пользователей и не меняется.

**Analog (тест, матрица прав):** `routes/tests/access-routes.test.ts:1-100` — таблица `PROFILES` с ролями, грантами `rbac_user_grants` и именованными профилями, цикл `for (const profile of PROFILES)` сеет пользователя и входит. Для D-22:
```typescript
const PROFILES = [
	{ name: 'admin', roles: ['admin'], grants: [] },
	{ name: 'user', roles: ['user'], grants: [] },
	{ name: 'user_allow_users_read', roles: ['user'], grants: [{ domain: 'users', action: 'read', allow: true }] },
	{ name: 'admin_deny_users_read', roles: ['admin'], grants: [{ domain: 'users', action: 'read', allow: false }] },
]
```
Анонимный запрос: `call(ctx, 'GET', '/api/users/directory')` без `cookies` → 401. Проверка «ровно минимальный набор ключей»: `assert.deepEqual(Object.keys(item).sort(), [...].sort())`.

**Analog (паритет с `/api/auth/me`):** `routes/auth/me-requirePerm-parity.test.ts:1-70` — `ALL_KEYS` из `PERMISSION_DOMAINS`, пробный Express-сервер с `requirePermKey` через `startTestServer`, `seeds: Array<[string, string[]]>`, прямая вставка в `rbac_user_grants`. Переключаемые места: `:112-116` (`user` имеет `users.read` → не имеет), `:123-126` (deny `users.read` у `user` бессмысленен: переписать на admin + deny или user + allow), `:172` (`grants.roleKeys` `['users.read']` → `[]`).

**Analog (чистая политика):** `services/access-policy/policy.test.ts:175-179` (по умолчанию `ROLE_REGISTRY` даёт `['users.read']` → `[]`).

**Изменение кода:** `packages/rbac/src/roles.ts:25-30`: `user: { key: 'user', name: 'Пользователь', grants: { users: ['read'] }, order: 10 }` → `grants: {}`. Тест гейтов 04-12 «набор роли user не открывает ни один раздел» остаётся зелёным. Перед планированием повторить `rg "users.read"` по тестам: фаза 4 ещё исполняется.

---

### `scripts/storage-no-private-access.test.mjs` (repo guard, transform)

**Analog:** `scripts/auth-no-role-string-checks.test.mjs` (форма «детектор + положительные и отрицательные примеры + сканирование + поимённые исключения»), `scripts/exam-core-no-private-copies.test.mjs` (область `app/web` + `app/server/src`).

**Константы сканирования** (`auth-no-role-string-checks.test.mjs:1-18`):
```javascript
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_ROOTS = ['app/server/src/routes', 'app/server/src/middleware', 'app/server/src/services']
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/
```
**Таблица правил** (`:20-28`): `{ label, pattern }` на правило; для D-25: `import ... from 'fs'|'node:fs'`, `path.join(process.cwd()`, `getQuestionPath|getTestPath`, литералы `topics/`, `avatars/`, `web/public/uploads`, импорт `services/storage` из `routes/tests`; web: `/storage/v1/`, `getStoragePathFromSupabaseUrl`, `isStoragePath`; server: `assertLegacyUploadsAllowed`; `packages/rbac`: роль `user` без `users.read`.

**Поимённые исключения** (`:30-52`): массив `{ file, reason, fragment, count }`; функция `exceptionFor(file, text)` (`:73-75`). Сканирование: `collectSources(root)` (`:58-71`, пропускает тестовые файлы), `assert.ok(files.length > 0, ...)`, нижняя граница `assert.ok(scanned >= N)`, итоговый `assert.deepEqual(violations, [], '...')`.

**Самопроверка детектора** (`:91-120`): отдельный `test(...)` на массивах `violating` и `allowed` (чтобы охранный тест не молчал при поломанной регулярке): копировать. Образец JSON/конфигов для `packages/rbac`: проверять не регулярками по исходнику, а импортом `ROLE_REGISTRY` из собранного `dist` (`scripts/check-rbac-dist.mjs`): сверить, собирается ли пакет перед `node --test`.

Подключение к `yarn verify`: сверить, как `auth-no-role-string-checks.test.mjs` попадает в шаг `script-tests` (`scripts/verify.mjs`, `scripts/verify.test.mjs`) — шаблон `scripts/*.test.mjs` подхватывает автоматически, если в `verify.mjs` стоит glob; иначе добавить.

---

### `e2e/tests/assets.spec.ts` (test, e2e)

**Analog:** `e2e/tests/authoring.spec.ts` (администратор в редакторе вопроса), `e2e/tests/session.spec.ts` (`403` и `@known-defect`), `e2e/fixtures/exam.ts` (сессии и контексты проектов).

**Шапка и помощники** (`authoring.spec.ts:1-30`):
```typescript
import { type BrowserContext, type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import { expect, newSessionContext, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

function testPageUrl(slug: string): string { return `/admin/tests/${TOPIC_SLUG}/${slug}` }

async function openNewQuestion(page: Page, slug: string): Promise<void> {
	await page.goto(`${testPageUrl(slug)}/questions/new`)
	await expect(page).toHaveURL(new RegExp(`${testPageUrl(slug)}/questions/drafts/[0-9a-f-]+$`))
	...
}
```
Правило данных: тест `authoring-<p>` принадлежит только своему проекту Playwright (`authoring.spec.ts:1-12`), чтобы порядок и второй проект не видели изменённых данных; для `assets` — собственный тест `assets-<p>`. Вход ограничен 5 раз в минуту: сессии берутся из `storageState` (`auth.setup.ts`, `newSessionContext`), не логиниться заново.

**Запрос API без UI** (студент 403 на `/api/users`): `e2e/tests/proxy-protection.spec.ts:1-40` использует `request` фикстуру (`test('...', async ({ request, baseURL }) => {...})`); для сессии студента `newSessionContext(...)` затем `context.request.get('/api/users')`.

**Локальный драйвер e2e** (`scripts/e2e.mjs:150-167`): `STORAGE_DRIVER: 'local'`, `STORAGE_LOCAL_DIR: storageDir` (каталог в `os.tmpdir()`), миграция → сид через `yarn workspace @bio-exam/server tsx src/scripts/e2e-seed.ts` → серверы. Сид должен писать промпты через модуль содержимого (D-26), иначе файлы окажутся не там, где читает сервер. Проекты: `chromium-desktop` и `chromium-mobile` (`e2e/playwright.config.ts:44-60`).

---

### Web: `lib/image-signed-url-cache.ts`, `MdxRenderer.tsx`, `image-component.tsx`, `TestRunner.tsx`, `MediaLibrary.tsx` (component/utility, request-response)

**Analog:** сами файлы; удаляются `SUPABASE_STORAGE_OBJECT_RE`, `getStoragePathFromSupabaseUrl`, `getStoragePathForImageSrc`, `isStoragePath` (`image-signed-url-cache.ts:17,23-46`), `normalizeImageSrc` (`MdxRenderer.tsx:39-43`), проверка `/storage/v1/` (`image-component.tsx:86`), `isStoragePath` в `TestRunner.tsx:93-110`, `:572-587`. Остаётся одна функция «src → URL через API» с кэшем, `data:` и `blob:` используются как есть.

**Удаление в медиатеке сейчас** (`MediaLibrary.tsx:110-131`):
```typescript
const handleDeleteClick = (asset: AssetFile) => {
	const used = checkUsageInEditor(asset.path)
	setIsUsedInDoc(used)
	setDeleteTarget(asset)
}
const handleDeleteConfirm = async () => {
	if (!deleteTarget) return
	try {
		const response = await fetch('/api/docs/assets', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: deleteTarget.path }),
		})
		if (!response.ok) throw new Error('Delete failed')
		...
		toast.success('Изображение удалено')
	} catch {
		toast.error('Не удалось удалить изображение')
	} finally { setDeleteTarget(null) }
}
```
D-16: при `409` прочитать `{ error }` из тела и показать этот текст в диалоге подтверждения (не закрывать диалог молча, не писать общий «Не удалось удалить»). Локальная проверка «используется в текущем документе» (`checkUsageInEditor`, `:89-106`) остаётся. D-14: скрытие загрузки, удаления и вкладки списка при `!can('tests', 'write')`; образец гейта прав на web — `lib/auth/*` и `components/providers/AuthProvider.tsx` (`can(domain, action)`), найти использование: `codegraph explore "can('tests'"`.

Web-тесты без DOM (CONTEXT, `Established Patterns`): чистые функции (разрешение `src`, разбор ответа 409) выносить в `lib/*.ts` и тестировать Vitest без DOM; сверить, что в `app/web` настроен Vitest (`app/web/package.json` скрипт `test`).

---

## Shared Patterns

### Права на маршрутах
**Source:** `app/server/src/middleware/auth/requirePerm.ts:23-33`, `services/access-policy/index.ts`
**Apply to:** `routes/docs/assets.ts` (`tests.write`), `routes/users/index.ts` (`users.read`; `/directory` только `sessionRequired()`), все новые обработчики
```typescript
router.get('/', sessionRequired(), requirePerm('users', 'read'), async (req, res, next) => { ... })
```
Решения о доступе по строкам ролей запрещены охранным тестом `scripts/auth-no-role-string-checks.test.mjs`; только `requirePerm`/`hasPermission`/`requestAccess`.

### Тесты маршрутов на `test_*`
**Source:** `test-support/auth-app.ts` (`startAuthApp`, `seedUser`, `login`, `call`), `test-support/test-database.ts` (`createScratchDatabase`, `migrateTestDatabase`, `requireTestDatabaseUrl`)
**Apply to:** все новые `*.test.ts` фазы. Запуск только через `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`; `DATABASE_URL` разработчика не использовать. `vi.resetModules()` внутри `startAuthApp` значит, что переменные окружения (`STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`) выставляются до него.

### `KNOWN_DEFECTS` + `test.fails`
**Source:** `routes/auth/auth-known-defects.test.ts:6-18`
**Apply to:** красные проверки плана 1 (D-23); чинящий план удаляет id.

### Тесты Vitest и язык
Vitest, `node:assert/strict`, названия по-русски, комментариев в коде нет (глобальное правило пользователя); `scripts/*.test.mjs` — `node:test`.

### Новые таблицы
**Source:** `db/schema.ts` `authSessions`: `.enableRLS()` и `denyDirectAccessPolicy()`; миграция через `drizzle-kit generate`, манифест sha256 и `scripts/check-migrations.mjs` в `yarn verify`. Применённые миграции не правятся.

### Env-контракт
**Source:** `scripts/check-env-contract.mjs`, `scripts/env-contract.config.json`, `app/server/.env.example`
**Apply to:** любой код, читающий новую переменную окружения. Фаза 7 новых ключей не вводит (D-01); если планировщик добавит `STORAGE_DRIVER=memory` как значение, комментарий в `.env.example:59-65` должен его описать (значение, не ключ).

### Документация и команды
README и комментарии env-примеров по-русски; команда `yarn ...` в доке обязана существовать (`scripts/check-docs-commands.mjs`), поэтому `assets:refs` и скрипт сверки добавляются в `app/server/package.json` до упоминания в README.

### Ошибки с HTTP-статусом
**Source:** `app/server/src/lib/errors.ts` (проверить форму перед использованием: `codegraph node app/server/src/lib/errors.ts`)
**Apply to:** типизированные ошибки порта (ключ → 400, конфликт, не настроено/недоступно → 5xx) и модуля содержимого.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Операция «копировать → переключить → удалить» (D-10) с компенсацией при сбое | service | file-I/O + CRUD | В репозитории нет двухфазного переноса объектов с откатом; единственный перенос `moveDirectory` (`storage.ts:690-733`) без отката. Опираться на D-09/D-10 и инъекцию сбоев in-memory адаптера |
| Адаптер `memory` с инъекцией сбоев (`failOn`) | service (test double) | file-I/O | Есть лишь одноразовая подделка `uploads.test.ts:18-30`, без состояния и сбоев |
| Серверное извлечение ссылок на картинки из Lexical JSON, markdown, JSX (`asset-refs.ts`) | utility | transform | Логика есть только на web (`TestRunner.tsx:93-110`, `MediaLibrary.tsx:89-106`); серверного парсера нет. Парсить как специфицировано D-17, перенеся список форм (`image` в Lexical JSON, `![](src)`, `<img src>`, устаревшие URL из D-06) |
| `SELECT … FOR UPDATE` + перенумерация порядка (D-11) | service | CRUD | В прямых аналогах не найдено; перед написанием выполнить `codegraph explore "forUpdate OR FOR UPDATE"` и прочитать `services/session/index.ts` (блокировка при ротации refresh) |
| Скрипт сверки хранилища (`storage-reconcile.ts`) | script | batch | Ближайший `backfill-question-search.ts` не сравнивает БД с листингом объектов; список объектов и сопоставление с указателями — новый код |

## Metadata

**Analog search scope:** `app/server/src/services/{storage,access-policy,session,search}`, `app/server/src/routes/{docs,users,auth,tests}`, `app/server/src/{db,scripts,test-support,lib}`, `app/server/drizzle`, `scripts/`, `e2e/`, `app/web/components/editor/plugins/images-plugin`, `packages/rbac`
**Files scanned:** ~45 (читались целиком или диапазонами; `routes/tests/index.ts` и `public.ts` большие, брались по D-08 и поимённому списку из `<code_context>`, диапазоны сверять после фаз 4-6)
**Pattern extraction date:** 2026-10-04
