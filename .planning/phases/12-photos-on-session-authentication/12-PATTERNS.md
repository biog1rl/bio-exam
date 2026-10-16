# Phase 12: Photos on session authentication - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 29 (новых и изменяемых)
**Analogs found:** 27 / 29 (без аналога: спайк замера, клиентское уменьшение canvas)

Все аналоги проверены `git ls-files`: это отслеживаемые файлы репозитория, зеркал `.gsd/capabilities` среди них нет. Пути от корня репозитория; `S=app/server/src`, `W=app/web`.

## File Classification

| Новый/изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|---|---|---|---|---|
| `S/services/assets/image-intake.ts` (новый) | service | transform | `S/services/assets/images.ts` `uploadImage` + `inline-images.ts` `storeImage` | role-match |
| `S/services/assets/{images,avatars,inline-images}.ts` (правка) | service | transform | они сами | exact |
| `S/middleware/upload.ts` (новый) `singleFileUpload` | middleware | request-response | multer-блок в `S/routes/docs/assets.ts:15-32` + `S/app.ts:100-145` | role-match |
| `S/routes/docs/assets.ts`, `S/routes/users/avatar.ts` (правка) | route | request-response | они сами | exact |
| `S/routes/tests/admin/assets.ts` (удалить) + `S/routes/tests/index.ts`, три охранных теста, `S/routes/uploads.test.ts`, `S/route-inventory.txt`, SKILL | route/test | request-response | список правок из RESEARCH § Runtime State Inventory | exact |
| `S/services/storage/keys.ts`, `S/services/storage/index.ts` (правка), `docs/adr/0004-...md` | service/config | transform | они сами | exact |
| `packages/exam-core/src/answer-photos.ts` (новый) + строка в `index.ts` | model (контракт) | request-response | `packages/exam-core/src/upload-window.ts` | exact |
| `S/db/schema.ts` `answerPhotos` + `S/../drizzle/0031_*.sql` + журнал + манифест | model/migration | CRUD | `questionAssetRefs` (`schema.ts:443-460`) + `0030_attempt_upload_window.sql` | role-match |
| `S/services/answer-photos/index.ts` (новый) | service | CRUD + file-I/O | `S/services/attempt-sessions/submit.ts:125-160` + `S/services/assets/avatars.ts:134-170` | role-match |
| `S/services/access-policy/{scope-rules,scope,zone-loader,index}.ts` (правка) `canReadAnswerPhoto` | service (шов доступа) | request-response | `canReviewAttempt` + `topicOfAttempt` | exact |
| PUT/DELETE/GET-список фото под сессией (`S/routes/tests/public.ts` или новый `S/routes/tests/session-photos.ts`) | route | request-response | PATCH `/tests/:id/sessions/:sessionId/answers` в `S/routes/tests/public.ts:423-445` | exact |
| `S/routes/answer-photos.ts` (новый) раздача + `S/routes/index.ts` | route | streaming/file-I/O | `GET /proxy` в `S/routes/docs/assets.ts:72-83` | role-match |
| тесты сервера: `image-intake.test.ts`, `answer-photos/*.test.ts`, маршруты фото | test | CRUD | `S/services/attempt-sessions/upload-window.test.ts`, `S/routes/uploads.test.ts` | exact |
| спайк замера памяти (план 1, D-15) | script | batch | нет | no analog |
| `W/lib/tests/answer-photos-api.ts` (новый) | service (клиент API) | request-response | `W/lib/tests/api.ts` | exact |
| `W/lib/tests/answer-photo-queue.ts` (новый, чистая фабрика) | utility | event-driven | `W/lib/drafts/save-queue.ts` | role-match |
| `W/lib/tests/answer-photo-resize.ts` (canvas) | utility | transform | нет | no analog |
| `W/components/tests/answer-photos/PhotoBlock.tsx` + хук | component | event-driven | `W/components/tests/attempt-result/UploadWindowLine.tsx` + `W/components/tests/QuestionInput.tsx` | partial |
| `W/components/tests/attempt-lifecycle/lifecycle.ts` (`sessionId` в снимке), `TestRunner.tsx` | component/store | event-driven | `lifecycle.ts:1005-1025` | exact |
| `e2e/tests/answer-photos.spec.ts` | test | request-response | `e2e/tests/assets.spec.ts`, `e2e/tests/attempt-review-pending.spec.ts` | role-match |

## Pattern Assignments

### `S/services/assets/image-intake.ts` (service, transform)

**Аналог:** `S/services/assets/images.ts:46-58` (сигнатура + sharp) и `S/services/assets/inline-images.ts:28-45`.

**Как сейчас** (копировать только каркас «сигнатура, затем sharp, затем webp»; `autoOrient`, лимит пикселей, метаданные и семафор в аналогах отсутствуют, их берёт RESEARCH § Code Examples):
```typescript
const detected = await fileTypeFromBuffer(buffer)
if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) throw new ApiError(400, IMAGE_TYPE_ERROR)
const processed = await sharp(buffer)
	.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
	.webp({ quality: WEBP_QUALITY })
	.toBuffer()
```
**Импорты** (`images.ts:1-5`): `file-type`, `sharp`, `ApiError` из `../../lib/errors.js` (расширение `.js` в импортах обязательно).
**Ошибки:** модуль бросает `ImageRejectedError extends ApiError` (400/413/415, русский текст); `ApiError` с `statusCode` и `isOperational` — `S/lib/errors.ts:6-18`. Тексты прежних профилей закреплены тестами (`IMAGE_TYPE_ERROR` в `images.ts:15`, `AVATAR_TYPE_ERROR` в `avatars.ts:13`): у профиля поле `typeMessage`, иначе переписать эти строки в `uploads.test.ts:138-139` и `avatar.characterization.test.ts:148-152`.
**Профили:** `mediaLibrary`/`inlineImage` 1920 q85 (`images.ts:24-27`, `inline-images.ts:16-19`, GIF и `animated: detected.mime === 'image/gif'` остаются только у inline); `answerPhoto` 2560 q82 + миниатюра 400 q75, ~50 МП, семафор с пределом очереди (503 только для этого профиля); без `withMetadata/keepExif`.
**Тесты:** ADR-0003 — сначала характеризация. Юнит-тестов на `services/assets/*` нет, поведение закреплено HTTP-тестами (`uploads.test.ts`, `docs/assets*.test.ts`, `users/avatar.characterization.test.ts`); в плане сначала юнит на `acceptImage`, потом перевод вызывающих. Фикстура с поворотом и GPS — RESEARCH § «Фикстура для тестов поворота и GPS».

### `S/services/assets/{images,avatars,inline-images}.ts` (service, transform; правка)

**Аналог:** они сами; единый список констант-дублей: `MEDIA_PREFIX/MAX_DIMENSION/WEBP_QUALITY` (`images.ts:25-27`, `inline-images.ts:17-19`), `AVATAR_TYPES` (`avatars.ts:19-24`).
**Аватар:** сейчас пишет исходный буфер как есть (`avatars.ts:155` `storage().write(key, buffer, { contentType: detected.mime, upsert: false })`) и откатывает через `removeQuietly(written)` (`avatars.ts:134-141,160-170`). Это образец «записать, при сбое убрать»; профиль аватара по Open Question 2 (GIF остаётся, `autoOrient`, без метаданных) утвердить с пользователем.
**Реэкспорт:** `S/services/assets/index.ts:1-20` — добавить `acceptImage` туда.

### `S/middleware/upload.ts` (middleware, request-response)

**Аналог:** multer-конфиг `S/routes/docs/assets.ts:15-32` (три копии: тот же блок в `routes/users/avatar.ts:8-23`, `routes/tests/admin/assets.ts:15-28`).
```typescript
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => { ... cb(new Error(IMAGE_TYPE_ERROR)) },   // голый Error -> 500
})
```
**Что делать:** `singleFileUpload({ field, maxBytes })` вызывает `upload.single(field)(req, res, cb)` и из `cb(error)` отдаёт `next(ApiError)`. `fileFilter` по `file.mimetype` убрать (D-14). Коды `MulterError` -> 413 (`LIMIT_FILE_SIZE`) / 400 (остальное, включая «Unexpected end of form» от busboy и «Request aborted»).
**Обработчик ошибок:** `S/app.ts:100-145` уже отдаёт `ApiError` по `statusCode`, остальное 500 (ветка `typeof status === 'number'` для чужих ошибок). Менять `app.ts` не обязательно: достаточно, чтобы обёртка передавала `ApiError`.
**Применение:** в `routes/docs/assets.ts:60` (`upload.single('file')`) и `routes/users/avatar.ts:58` (`upload.single('avatar') as any`) заменить на обёртку; `replyError` в `docs/assets.ts:34-38` и `sendError` в `avatar.ts:52-59` уже превращают `isApiError` + `statusCode < 500` в JSON `{ error }` — тот же формат.
**Тесты:** `S/routes/uploads.test.ts:163,170,298,396,411` закрепляют 500; переписать на 413/415/400 (D-02). Структура файла: `beforeAll` с `createScratchDatabase`, `vi.resetModules()`, `memoryStorage()`, помощник `postFile(path, field, file)` (`uploads.test.ts:1-80,150-175`); цикл `ROUTES` — расширить маршрутом фото.

### `S/routes/tests/admin/assets.ts` (удаление, D-04)

Мёртвый `POST /:id/assets` (65 строк). Правки одной задачей (точный список в RESEARCH § Runtime State Inventory):
- `S/routes/tests/index.ts:6,31` — убрать `import { assetsRouter }` и `router.use(assetsRouter)`.
- `scripts/tests-router-composition.test.mjs:80` — порог `exported.length >= 12` снизить до 11.
- `scripts/teacher-zone-guards.test.mjs:30,49` — `ASSET_ROUTES` и запись `[ASSET_ROUTES]: { router: 'router', mount: '/api/tests' }`.
- `scripts/storage-no-private-access.test.mjs:71` — убрать `['post', '/:id/assets']` из `SCOPED_ROUTES`.
- `S/routes/uploads.test.ts:141-147,184-216` — элемент `ROUTES` и `describe('POST /api/tests/:id/assets')`.
- `S/route-inventory.txt:91` — перегенерировать: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory`.
- `.agents/skills/bio-exam-api/SKILL.md:77` (список суброутеров) и строка про пространства (:86) — дописать `answers/`.

### `S/services/storage/keys.ts` + `S/services/storage/index.ts` (service, transform; правка, D-03)

**Аналог:** они сами.
```typescript
// keys.ts:3
export const STORAGE_NAMESPACES = ['images', 'topics', 'avatars'] as const
// keys.ts:79-82
if (segments[0] === 'images' || segments[0] === 'avatars') return true
return segments[0] === 'topics' && segments.length >= 5 && segments[3] === 'assets'
// index.ts:158-160
export function storageUrl(key: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(normalizeKey(key))}`
}
```
**Что делать:** добавить `'answers'`, таблицу `NAMESPACE_READERS ... satisfies Record<StorageNamespace, string>`; `isServableImageKey` выводить из неё; `storageUrl` для `answers` бросает ошибку программиста (не `ApiError`) — тест закрепляет. Новая запись ADR-0004 (раздел «Кто читает пространство»): `docs/adr/0004-storage-port-two-adapters.md` (заголовки «Решение», «Последствия», frontmatter `status/date`; проза русская).
**Не трогать/проверить:** `ownStorageKey`/`resolveImageLink` (`links.ts:97-102`) идут через `isServableImageKey`, утечки нет; `storedAvatarValue` требует префикс `avatars/${userId}/` (`links.ts:117-123`); `storage:reconcile` смотрит только `topics`.
**Охрана:** `scripts/storage-no-private-access.test.mjs` запрещает в `routes` литералы `topics/`/`avatars/` (правило с `QUOTE`, строки 32-36) и импорт `services/storage` в `routes/tests`; ключ `answers/...` строить только в `services/answer-photos`.

### `packages/exam-core/src/answer-photos.ts` (model, request-response)

**Аналог:** `packages/exam-core/src/upload-window.ts` (весь файл, 21 строка).
```typescript
import { z } from 'zod'
export const UPLOAD_WINDOW_ERROR_CODES = { closed: 'UPLOAD_WINDOW_CLOSED', none: 'UPLOAD_WINDOW_NONE' } as const
export const UPLOAD_WINDOW_REFUSAL_STATUS = 422
export const UploadWindowRefusalSchema = z.object({ error: z.enum([...]), uploadClosesAt: z.string().nullable() })
export type UploadWindowRefusal = z.infer<typeof UploadWindowRefusalSchema>
```
**Что делать:** константы (`ANSWER_PHOTO_MAX_COUNT = 5`, `ANSWER_PHOTO_MAX_BYTES`), схема строки фото и ответа PUT/списка, тексты двух кодов окна (Open Question 1: необязательное поле `message` в `UploadWindowRefusalSchema`). Экспорт добавить блоком в `packages/exam-core/src/index.ts` по образцу строк 150-157 (`export { ... } from './upload-window'` + `export type`). Импорты в пакете без `.js` (`'./upload-window'`). После правки пакета: `yarn workspace @bio-exam/exam-core build` перед отдельным прогоном тестов сервера. Приватные копии кодов вне пакета ловит `scripts/exam-core-no-private-copies.test.mjs`.

### `S/db/schema.ts` `answerPhotos` + миграция (model, CRUD)

**Аналог:** `questionAssetRefs` (`schema.ts:443-460`, составной PK, FK с именем, индекс, `denyDirectAccess`) и `testSessions` (`schema.ts:551-580`, FK `references(() => ..., { onDelete: 'cascade' })`, `check`).
```typescript
export const questionAssetRefs = pgTable('question_asset_refs', {...}, (t) => ({
	pk: primaryKey({ name: '..._pkey', columns: [...] }),
	questionIdFk: foreignKey({ name: '..._fkey', columns: [t.questionId], foreignColumns: [questions.id] }).onDelete('cascade'),
	assetKeyIdx: index('idx_...').on(t.assetKey),
	denyDirectAccess: denyDirectAccessPolicy(),
})).enableRLS()
```
**Что делать:** таблица `answer_photos`: `id uuid` = `photoId` клиента (PK без `defaultRandom`), `sessionId` -> `testSessions.id` cascade, `questionId` -> `questions.id` cascade, `attemptId` -> `testAttempts.id` `set null`, `uploadedAt timestamptz default now()`, `expiresAt`, индекс `(session_id, question_id)`; обязательно `denyDirectAccessPolicy()` + `.enableRLS()`. Таблицу объявить после `testSessions`.
**Миграция `0031_*.sql`:** первая строка `SET LOCAL lock_timeout = '5s';--> statement-breakpoint`, DDL в стиле drizzle (`0027_notification_journal.sql`: `CREATE TABLE ...;--> statement-breakpoint`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`, политика). Генерация: `yarn workspace @bio-exam/server drizzle:generate`; затем запись в `app/server/drizzle/meta/_journal.json` (последняя `idx: 30`, `0030_attempt_upload_window`) и `app/server/drizzle/migrations-manifest.json` (поля `idx, tag, file, sha256, when, breakpoints`). Применённые миграции не править. Навык `.agents/skills/bio-exam-data/SKILL.md` прочитать до правки; ADR-0007 — удаление пользователя и FK.

### `S/services/answer-photos/index.ts` (service, CRUD + file-I/O)

**Аналог 1 (транзакция, блокировка сессии):** `S/services/attempt-sessions/submit.ts:125-160`.
```typescript
return await db.transaction(async (tx) => {
	const [session] = await tx.select({ ... }).from(testSessions)
		.where(sessionFilter({ sessionId, owner })).for('update')
```
**Аналог 2 (окно):** `S/services/attempt-sessions/upload-window.ts:44-90` — `photoUploadWindow(executor, { sessionId })` принимает `db` или `tx`, время `clock_timestamp()`; `uploadWindowRefusal(state)` даёт `{ status: 422, body }`. Импортировать через `../attempt-sessions/index.js` (там уже экспортированы, строки 14-21).
**Аналог 3 (проверка «вопрос open»):** `S/services/attempt-sessions/draft-answers.ts:14-19`:
```typescript
const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
```
`includeInactive: true` обязательно: `open` засеян неактивным.
**Аналог 4 (запись и откат файлов):** `S/services/assets/avatars.ts:134-170` — `storage().write(key, buf, { contentType, upsert })`, массив `written`, `removeQuietly(keys)` с `console.warn('[assets] orphan objects', ...)`.
**Порядок шагов:** RESEARCH § Pattern 4 (быстрый путь идемпотентности, предварительное окно, `acceptImage` вне транзакции, запись с `upsert: true`, транзакция `FOR UPDATE` -> окно -> повторная проверка строки -> `count` -> `INSERT`, откат файлов только при отказе окна/лимита/чужого PK). Удаление: сначала проверка окна, строка (коммит), потом файлы (D-09).
**Импорты:** `import { db } from '../../db/index.js'`, `import { ... } from '../../db/schema.js'`, `ApiError` из `../../lib/errors.js`, `storage` из `../storage/index.js`; ключ `answers/{sessionId}/{questionId}/{photoId}/{full|thumb}.webp` строится здесь и нигде больше.
**Опора для тестов:** `S/test-support/attempt-world.ts:74-200` — `seedAttemptWorld`, `seedStudent`, `createAttemptTest`, `assignTest`, `insertOpenSession`, `insertOpenQuestion(ctx, testId, { order })`, `shiftStartedAt`, `submitAttempt`, `countRows`; `memoryStorage()` из `S/test-support/storage.ts` (`mem.keys(prefix)`, `mem.failOn({ op: 'write' })`).

### `S/services/access-policy/*` `canReadAnswerPhoto` (service, request-response)

**Аналог:** `canReviewAttempt` в `scope-rules.ts:128-129` и `topicOfAttempt` в `zone-loader.ts`.
```typescript
const canReviewAttempt = (req: Request, attemptId: string) =>
	zoned(req, 'tests.read', async (userId) => topicInZone(req, userId, await zones.topicOfAttempt(attemptId)))
```
**Что делать (все 4 точки, иначе сломается компиляция):**
1. `zone-loader.ts` — метод в интерфейс `ZoneLoader` (строки 17-26), реализация Drizzle (по образцу `topicOfAttempt`, 86-95: `isUuid` -> `select ... innerJoin ... limit(1)` -> `row ?? null`) и реализация `createInMemoryZoneLoader` (строки ~140-180, расширить `ZoneSnapshot` при необходимости).
2. `scope-rules.ts` — `canReadAnswerPhoto(req, photoId)`: владелец сессии -> да; иначе `session.attemptId !== null && canReviewAttempt(req, attemptId)` (D-17). Добавить в тип `AccessScope` и объект результата (строки ~140-176).
3. `scope.ts` — `export const canReadAnswerPhoto = scope.canReadAnswerPhoto` (по образцу строк 17-29).
4. `index.ts` — добавить в блок `export { canAssign, ..., canReviewAttempt, ... } from './scope.js'` (строки 50-72).
**Тесты:** `scope.test.ts`, `zone-store.test.ts` (in-memory loader); матрица зон `routes/tests/teacher-zone-tests.matrix.test.ts`; охранный `scripts/teacher-zone-guards.test.mjs` — новый маршрут объекта зоны вносится в его инвентарь (ASVS: отказ и «нет файла» дают один ответ 404).

### Маршруты фото под сессией: PUT/DELETE/GET-список (route, request-response)

**Аналог:** PATCH `answers` в `S/routes/tests/public.ts:423-445` (путь от `/tests/:id/sessions/:sessionId/...`).
```typescript
router.patch(
	'/tests/:id/sessions/:sessionId/answers',
	validateUUID('id'), validateUUID('sessionId'), sessionRequired(),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			...
			const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
			if (!access.ok) return denyAttemptAccess(res, access.status)
			...
		} catch (e) { next(e) }
	}
)
```
**Что делать:** `PUT /tests/:id/sessions/:sessionId/questions/:questionId/photos/:photoId` (+ `validateUUID('questionId')`, `validateUUID('photoId')`, `singleFileUpload`), `DELETE` на тот же путь, `GET .../photos` для списка. Импорты — как в `public.ts:1-35` (`checkAttemptAccess` и `photoUploadWindow` из `../../services/attempt-sessions/index.js`, `canReadTest` из `access-policy`). Отказ окна: `res.status(refusal.status).json(refusal.body)` (`uploadWindowRefusal`). Ошибки в `next(e)`.
**Ограничения:** `routes/tests/index.ts` только собирает суброутеры (`scripts/tests-router-composition.test.mjs`), но `public.ts` монтируется отдельно (`routes/index.ts:22`) и под это правило не попадает; файлы в `routes/tests/**` не импортируют `services/storage` — только `services/answer-photos`. Если `public.ts` (472 строки) распухает — новый файл `routes/tests/session-photos.ts` и монтирование в `routes/index.ts` рядом с `publicTestsRouter`, а не в `tests/index.ts`.
**Охранный `api-routes-have-callers`:** все статические сегменты пути (`tests`, `public`, `sessions`, `questions`, `photos`) должны встретиться в одном файле клиента `app/web` (`scripts/api-routes-have-callers.test.mjs:57-72`).
**Снимок:** перегенерировать `S/route-inventory.txt`.

### `S/routes/answer-photos.ts` (route, file-I/O) и `S/routes/index.ts`

**Аналог:** `GET /proxy` в `S/routes/docs/assets.ts:72-83`.
```typescript
router.get('/proxy', sessionRequired(), async (req, res) => {
	try {
		const { data, contentType } = await readServableImage(req.query.path)
		res.setHeader('Content-Type', contentType)
		res.setHeader('Content-Length', String(data.length))
		res.setHeader('Cache-Control', 'private, max-age=3600')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		return res.send(data)
	} catch (error) { return replyError(res, error, 'Error proxying asset', '...') }
})
```
**Отличия (D-16):** `Cache-Control: private, no-store`, `Content-Type: image/webp` фиксированно, `Cross-Origin-Resource-Policy: same-origin` (helmet глобально ставит `cross-origin`, `app.ts:39`), `Content-Disposition: inline`; ключ берётся из строки БД через сервис, не из параметров; `validateUUID('photoId')`; `variant ∈ {thumb, full}`; доступ — `canReadAnswerPhoto`, отказ и отсутствие дают один и тот же `404 { error: 'Фото не найдено' }`. Монтирование: `routes/index.ts:20-30` — добавить `router.use('/answer-photos', answerPhotosRouter)` (импорт в алфавитном блоке строк 7-17).
**Не использовать:** `readServableImage`/`isServableImageKey` для `answers/` (анти-паттерн A3).

### `W/lib/tests/answer-photos-api.ts` (клиент API)

**Аналог:** `W/lib/tests/api.ts:1-40,150-185`.
```typescript
import { request, RequestError, requestJson, type RequestOptions } from '@/lib/http/request'
const segment = encodeURIComponent
const outcome = await request(`/api/tests/public/tests/${segment(testId)}/sessions/${segment(sessionId)}/answers`, { method: 'PATCH', json: body, ... })
```
`request` принимает `body?: FormData` и `method` (`W/lib/http/request.ts:19-29`); не писать свой `fetch` (охрана `web-requests-guards.test.mjs`). Отказ окна показывает `failureMessage(failure)` из `W/lib/http/errors.ts:21-37` — берёт только кириллический `error`, поэтому серверные 4xx русские (Pitfall 2). Схемы ответа — из `@bio-exam/exam-core`. Все статические сегменты путей (включая `answer-photos`) держать в этом одном файле (Pitfall 9).

### `W/lib/tests/answer-photo-queue.ts` (чистая фабрика, event-driven)

**Аналог:** `W/lib/drafts/save-queue.ts` (внедряемые часы, повторы с нарастающей паузой, без React).
```typescript
export type SaveQueueClock = { now: () => number; setTimer: (cb: () => void, ms: number) => unknown; clearTimer: (handle: unknown) => void }
export const SAVE_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 5000, 10000, 30000]
export function createSaveQueue<V>(options: SaveQueueOptions<V>): SaveQueue<V> { ... clock?.setTimer ?? ((cb, ms) => setTimeout(cb, ms)) ... }
```
**Что взять:** форму `clock` и исход `SaveOutcome` (`ok | retry | stop | reject`) как образец «5xx/сеть/429/503 повторять, 4xx не повторять»; но очередь фото другая: ключ — `photoId`, 3 автоповтора (паузы 1/3/9 с, D-20), затем статус `failed` + «Повторить», по одному. Состояния: `preparing -> uploading -> done | failed | refused`.
**Тесты:** `W/lib/drafts/save-queue.test.ts:1-45` — `vi.useFakeTimers`, `deferred()`, `setup(steps)` с `send = vi.fn(...)`. Скопировать структуру. По `test-hygiene`: юниты только на логику с вариантами (повторы, 4xx, лимит 5, удаление во время загрузки), без хрупких охранников.

### `W/components/tests/answer-photos/PhotoBlock.tsx` (+ тонкий хук) (component, event-driven)

**Аналог:** `W/components/tests/attempt-result/UploadWindowLine.tsx` (показ окна + таймер) и `W/components/tests/QuestionInput.tsx` (`open` сейчас возвращает `null`, строки 33-135; UI-примитивы `../ui/*`, `cn` из `@/lib/utils/cn`).
**Правила:** `<img>` вместо `next/image` (Pattern 6); UI-примитивы — из `W/components/ui` (сначала готовое); `accept="image/*"`, не `image/heic` (D-18); кнопка удаления только у `done`/`failed` (Pitfall 6); счётчик «N из 5» по ответу сервера. Проверка контраста (≥4,5:1) и проверка в браузере до «готово» — по правилам проекта; навык `.agents/skills/bio-exam-web/SKILL.md` прочитать до правки. Образец компактной вёрстки — навык web (раздел про шапку/таблицы).

### `W/components/tests/attempt-lifecycle/lifecycle.ts` + `TestRunner.tsx` (правка)

**Аналог:** снимок собирается в `lifecycle.ts:1005-1025`; `session` хранит `{ sessionId, startedAt }` (`lifecycle.ts:460`).
```typescript
startedAt: session?.startedAt ?? null,
...
uploadClosesAt,
serverOffsetMs: serverClock.offsetMs(),
```
Добавить `sessionId: session?.sessionId ?? null` в тип `AttemptSnapshot` (`lifecycle.ts:77-97`) и в сборку снимка; существующие тесты `lifecycle*.test.ts` и `testing.ts` обновить на новое поле. В `TestRunner.tsx` блок рисуется рядом с `QuestionInput` (`TestRunner.tsx:389-399`, внутри `!questionResult`) при `question.questionUiTemplate === 'open'`; окно уже показывает `UploadWindowLine` (`TestRunner.tsx:298`).

### `e2e/tests/answer-photos.spec.ts` (test)

**Аналог:** `e2e/tests/attempt-review-pending.spec.ts:62-80` (студент проходит тест с `open`; фикстуры `accounts.ts:24` уже знают шаблон `'open'`) и `e2e/tests/assets.spec.ts:1-60` (PNG из base64, `page.request`, `expect(...).toBeVisible()`). `setInputFiles` в репозитории пока не используется — первый случай. Новая функция e2e должна жить на `yarn e2e`, не в `yarn verify`.

## Shared Patterns

### Единые отказы в виде `ApiError` + `{ error }`
**Источник:** `S/lib/errors.ts:6-18`, обработчик `S/app.ts:100-145`, `replyError` в `S/routes/docs/assets.ts:34-38`.
**Применять к:** `image-intake`, `middleware/upload`, `answer-photos`, все новые маршруты. Тексты русские и читаемые (клиент показывает только кириллический `error`).

### Аутентификация и проверка параметров маршрута
**Источник:** `S/routes/tests/public.ts` (`validateUUID('id')`, `sessionRequired()`, `checkAttemptAccess`, `denyAttemptAccess`, `next(e)`), `S/middleware/validateParams.ts`.
**Применять к:** PUT/DELETE/GET-список/раздача фото.

### Окно загрузки (одна функция)
**Источник:** `S/services/attempt-sessions/upload-window.ts:44-90`, коды `packages/exam-core/src/upload-window.ts`.
**Применять к:** загрузка и удаление фото; отказ `422` с `UPLOAD_WINDOW_CLOSED/NONE`; свою арифметику времени не писать.

### Работа с хранилищем только через `storage()`
**Источник:** `S/services/storage/index.ts` (`storage()`, порт `S/services/storage/port.ts`), `S/services/assets/avatars.ts:134-170`.
**Применять к:** `services/answer-photos`. Маршруты не импортируют хранилище и не собирают литералы ключей.

### Тесты сервера с базой
**Источник:** `S/services/attempt-sessions/upload-window.test.ts:1-45` (`startAuthApp('test_...')`, `seedAttemptWorld`, `afterAll(ctx.stop)`), `S/routes/uploads.test.ts:1-80`.
**Применять к:** все серверные тесты фазы. Только база `test_*` через `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`; `yarn verify` зелёный до закрытия.

### Охранные тесты репозитория, которые затрагивает фаза
`scripts/tests-router-composition.test.mjs`, `scripts/teacher-zone-guards.test.mjs`, `scripts/storage-no-private-access.test.mjs`, `scripts/api-routes-have-callers.test.mjs`, `scripts/exam-core-no-private-copies.test.mjs`, `S/routes/route-inventory.snapshot.test.ts` (+ `S/route-inventory.txt`), `scripts/check-env-contract.mjs` (новые ключи окружения только вместе с `.env.example`; по умолчанию новых ключей нет).

## No Analog Found

| Файл | Роль | Поток | Причина |
|---|---|---|---|
| спайк замера памяти sharp (план 1, D-15) | script | batch | замеров RSS в репозитории нет; рамка — RESEARCH § «Память», каталог скриптов `S/scripts/` (например, `routes-inventory.ts`, `e2e-seed.ts`) задаёт только форму запуска `tsx` |
| `W/lib/tests/answer-photo-resize.ts` | utility | transform | `createImageBitmap` + canvas в проекте не используются; брать RESEARCH § Pattern 6 и PITFALLS M7 (`bitmap.close()`, `toBlob` может вернуть `null`) |
| семафор с пределом очереди (внутри `image-intake`) | utility | event-driven | в серверном коде нет ограничителя параллельности; писать ~20 строк самим (RESEARCH § Supporting) |

## Metadata

**Область поиска аналогов:** `app/server/src/{services,routes,middleware,db,test-support,scripts}`, `app/server/drizzle`, `packages/exam-core/src`, `app/web/{lib,components/tests}`, `e2e`, `scripts`, `docs/adr`.
**Файлов просмотрено:** около 45.
**Дата извлечения:** 2026-10-16.
