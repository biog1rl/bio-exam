# Phase 13: Token, QR and phone page - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 25 (новых 12, правок 13)
**Analogs found:** 23 / 25 (без аналога: оболочка-пустышка страницы телефона, работа с `location.hash`/`sessionStorage`, `@lglab/react-qr-code`)

Код: ветка `dev`, рабочее дерево. В нём лежит НЕ закоммиченная работа W1 (0033, `questions.allow_photos/max_photos`): `services/answer-photos/index.ts`, `routes/tests/session-photos.ts`, `PhotoBlock.tsx`, `upload-queue.ts`, `use-answer-photos.ts`, `TestRunner.tsx`, `exam-core/answer-photos.ts`. Строки этих файлов считаны до W1 и сдвинутся на 10-25; опора на символ. После W1: `UploadOutcome` = `created|existing|window|limit{max}|forbidden|conflict|missing`; `readPhotoRule(executor, questionId)`; очередь принимает `maxCount`, `state.max`; `useAnswerPhotoSession({..., maxCountOf})`.
Не отслеживаются git, не цитировать как аналог: `0033_*.sql`, `meta/0033_snapshot.json`, `services/access-policy/review-recipients.ts`; `.planning/design/qr-dialog.md` (есть, читать как документ). Остальные пути проверены `git ls-files`.

## File Classification

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/drizzle/0034_answer_upload_links.sql` | migration | CRUD | `0031_answer_photos.sql`, `0030_attempt_upload_window.sql` | exact |
| `app/server/src/db/schema.ts` | model | CRUD | `invites`, `answerPhotos` | exact |
| `app/server/src/services/upload-links/index.ts` | service | CRUD | `routes/auth/invites.ts`, `attempt-sessions/upload-done.ts` | role-match |
| `app/server/src/services/answer-photos/index.ts` | service | CRUD, file-I/O | он же | exact |
| `app/server/src/services/access-policy/scope-rules.ts` | service | request-response | `canReadTest` там же | role-match |
| `app/server/src/middleware/uploadTokenRequired.ts` | middleware | request-response | `middleware/auth/session.ts` | exact |
| `app/server/src/routes/upload/index.ts` | route | request-response, file-I/O | `routes/tests/session-photos.ts` | exact |
| `app/server/src/routes/tests/session-photos.ts` | route | request-response | `answerPhotoTarget` там же | exact |
| `app/server/src/routes/index.ts` | route | - | свои `router.use` | exact |
| `app/server/src/lib/logger.ts` | config | - | `LOG_REDACT_PATHS` | exact |
| `app/server/src/test-support/auth-app.ts` | test | request-response | `putAnswerPhoto` (`attempt-world.ts`) | role-match |
| `app/server/src/routes/upload/upload.test.ts` | test | request-response | `routes/tests/session-photos.test.ts` | exact |
| `app/server/route-inventory.txt` | config | - | строки 113-117 | exact |
| `packages/exam-core/src/answer-photos.ts` | model | transform | `AnswerPhoto*Schema` | exact |
| `app/web/lib/navigation/public-paths.ts` (+ правки `proxy.ts`, `AppLayout.tsx`, `AuthGuard.tsx`, `lib/session/client.ts`, `sections.test.ts`) | utility | transform | `isAuthPage` в `client.ts` | role-match |
| `app/web/lib/upload-link/api.ts` | service (client) | request-response | `lib/tests/answer-photos-api.ts` | exact |
| `app/web/components/tests/answer-photos/{upload-queue,use-answer-photos,PhotoBlock}` | component/store | event-driven | они сами | exact |
| `app/web/app/(internal)/photo-upload/page.tsx` + клиент | component | request-response | `(internal)/invite/[token]` | role-match |
| `app/web/components/tests/answer-photos/QrUploadDialog.tsx` | component | polling | `ReinviteUserDialog.tsx`, `NotificationBell.tsx` | role-match |
| `app/web/components/tests/answer-photos/use-pointer-kind.ts` | hook | event-driven | `use-photo-sources.ts` | exact |
| `app/web/components/tests/TestRunner.tsx` | component | - | точка вставки | exact |
| `e2e/tests/photo-upload-link.spec.ts` | test | request-response | `e2e/tests/answer-photos.spec.ts` | exact |
| e2e DEBT-02 (404 + один тост) | test | - | `editor-validation.spec.ts`, `user-lookup.spec.ts` | role-match |

## Pattern Assignments

### `app/server/drizzle/0034_answer_upload_links.sql`

**Analog:** `0031_answer_photos.sql` (таблица), `0030_attempt_upload_window.sql` (ALTER с CHECK). Файл порождает `yarn workspace @bio-exam/server drizzle:generate` после правки `schema.ts`; запись в `migrations-manifest.json` совпадает с журналом и файлом.
```sql
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "answer_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "answer_photos" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
-- 0030: ALTER TABLE "tests" ADD COLUMN "photo_upload_window_minutes" integer DEFAULT 15 NOT NULL;
```
FK на `users` не заводить (ADR-0007, `user-deletion-rule.test.ts`).

### `app/server/src/db/schema.ts`

**Analog:** `invites` (135-152), `answerPhotos` (584-608), частичный индекс `testSessions` (574-578), CHECK `tests` (285-288).
```ts
tokenHash: text('token_hash').notNull(),
tokenUniq: uniqueIndex('invites_token_uniq').on(t.tokenHash),
denyDirectAccess: denyDirectAccessPolicy(),   // ... }).enableRLS()
openSessionUniq: uniqueIndex('test_sessions_open_uniq').on(t.testId, t.userId).where(sql`${t.submittedAt} IS NULL ...`)
photoUploadWindowCheck: check('tests_..._check', sql`${t.photoUploadWindowMinutes} BETWEEN 0 AND 120`)
```
FK - `foreignKey({ name, columns, foreignColumns }).onDelete('cascade')` как в `answerPhotos`. `uploadedVia: text(...).notNull().default('session')` + CHECK `IN ('session','link')`. Файл уже изменён W1.

### `app/server/src/services/upload-links/index.ts`

**Analog:** хеш и поиск - `routes/auth/invites.ts:21-23,206-217`; пара raw+hash - `services/session/tokens.ts:50-57`; гашение старшей ссылки под блокировкой - транзакция `closeUploadWindow` (`attempt-sessions/upload-done.ts`, `.for('update')` + `sessionFilter`).
```ts
function sha256Hex(s: string): string { return createHash('sha256').update(s).digest('hex') }
const inv = await db.query.invites.findFirst({ where: eq(invites.tokenHash, sha256Hex(token)) })
if (!inv || inv.consumedAt || inv.expiresAt < new Date()) return res.status(404).json({ error: 'Invalid token' })
```
`resolve(token) -> {linkId, sessionId, questionId} | null` по уникальному индексу, не `LIKE`. Живость различает `session_closed` ДО `uploadWindowRefusal` (в 404, не 422). Таблицу пишет только этот сервис. `last_used_at` - отдельным запросом после фиксации.

### `app/server/src/services/answer-photos/index.ts`

**Analog:** сам файл (раздел (а) ниже: что сделать общей функцией).
```ts
async function windowRefused(executor: UploadWindowExecutor, sessionId: string): Promise<WindowRefused | null> {
  const state = await photoUploadWindow(executor, { sessionId })
  if (state === null) return null
  const refusal = uploadWindowRefusal(state)
  return refusal ? { kind: 'window', ...refusal } : null
}
// uploadAnswerPhoto, транзакция: sessionFilter(...).for('update') -> windowRefused(tx) -> findPhotoRow -> readPhotoRule (W1) -> countPhotos -> insert
```
Добавить источник `'session'|'link'` во вход и в `.values({ ..., uploadedVia })`. Ключ файла `answerPhotoKey` и лимит `rule.maxPhotos` общие.

### `app/server/src/services/access-policy/scope-rules.ts`

**Analog:** `canReadTest` (120-121) и `isAssignedOrPrivileged` (`attempt-sessions/access.ts:64-72`), который уже берёт `canReadTest: () => Promise<boolean>`.
```ts
export type PermissionCheck = (req: Request, key: PermissionKey) => Promise<boolean>
const canReadTest = (req: Request, testId: string) =>
  zoned(req, 'tests.read', async (userId) => topicInZone(req, userId, await zones.topicOfTest(testId)))   // userId = req.authUser?.id
// index.ts:32-40 requestAccess(req) -> accessPolicy.accessFor(req.authUser.id); accessFor(userId) существует без Request
```
Вопрос D-23: весь `AccessScope` привязан к `Request` (`req.authUser`), а ссылка `req.authUser` игнорирует (D-07). Брать вариант от `userId` внутри `access-policy/` (`accessPolicy.accessFor(userId)` + `zones.topicOfTest`), не синтетический `Request`; `teacher-zone-guards` не пускает проверки зоны вне `access-policy/`.

### `app/server/src/middleware/uploadTokenRequired.ts`

**Analog:** `middleware/auth/session.ts` (`declare module`, `nameMiddleware`).
```ts
declare module 'express-serve-static-core' { interface Request { authUser?: SessionUser | null } }   // сюда же uploadScope?
return nameMiddleware(async (req, res, next) => { ...
  if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' })   // у ссылки вместо 401 - 404
  next() }, 'sessionRequired')
```
`sessionOptional()` висит на корне (`app.ts:86`): `req.authUser` заполнен cookie ученика, middleware его не читает. Лимитеры: до резолва ключ `sha256(заголовок)`, после - `linkId`; форма `rateLimiter({ maxAttempts: 5, windowMs: 60 * 1000, keyPrefix: 'invite-accept' })` (`invites.ts:236`), `clientKey` - `rateLimiter.ts:61-66`.

### `app/server/src/routes/upload/index.ts`

**Analog:** `routes/tests/session-photos.ts` (PUT 99-122, исходы 71-97).
```ts
router.put(PHOTO_PATH, validateUUID('photoId'), sessionRequired(), answerPhotoTarget, photoBodyGate,
  singleFileUpload({ field: 'file', maxBytes: ANSWER_PHOTO_MAX_BYTES }),
  async (req, res, next) => { try {
    if (!req.file) return res.status(400).json({ error: FILE_MISSING })
    return sendUploadOutcome(res, await uploadAnswerPhoto(placeOf(req), req.params.photoId as string, req.file.buffer))
  } catch (e) { if (e instanceof ImageRejectedError && e.statusCode === 503) { res.setHeader('Retry-After', String(BUSY_RETRY_AFTER_SECONDS)); return res.status(503).json({ error: e.message }) }
    return next(e) } })
```
Вместо `placeOf(req)` - `req.uploadScope`. `sendUploadOutcome` переиспользовать, не копировать. Ловушка: `photoBodyGate` создан в модуле `session-photos.ts` (счётчик на модуль), второй роутер получит свой; общий предел даёт только `IMAGE_INTAKE_*` в `services/assets` - вынести один экземпляр. Миниатюра - заголовки `routes/answer-photos.ts:28-34` (`image/webp`, `private, no-store`, `nosniff`, `inline`) + `readAnswerPhotoFile(photoId, 'thumb')` после проверки принадлежности слоту; `canReadAnswerPhoto` не вызывать.

### `app/server/src/routes/tests/session-photos.ts`

**Analog:** `answerPhotoTarget` (51-69) для нового `POST …/questions/:questionId/upload-link`.
```ts
const access = await checkAttemptAccess({ testId, userId: place.owner.userId, canReadTest: () => canReadTest(req, testId) })
if (!access.ok) { if (access.status === 404) return res.status(404).json({ error: 'Test not found' }); return res.status(403).json({ error: 'Тест не назначен' }) }
if (!(await findPhotoTarget(place))) return res.status(404).json({ error: ANSWER_PHOTO_TARGET_MISSING })
```
Добавить: окно открыто, `allow_photos`, лимитер по `userId` (`clientKey: (req) => req.authUser?.id`).

### `app/server/src/routes/index.ts`

**Analog:** `router.use('/answer-photos', answerPhotosRouter)`. Добавить `router.use('/upload', uploadRouter)` после него; порядок значим для снимка инвентаря.

### `app/server/src/lib/logger.ts`

**Analog:** строка 7; тест - `lib/logger.test.ts:31-60` (`createHttpLogger(createLogger(stream))`, заголовки в запросе, `[redacted]` и отсутствие значения в `raw`).
```ts
export const LOG_REDACT_PATHS = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]']
// + 'req.headers["x-upload-token"]'   (скобки из-за дефиса)
```

### `app/server/src/test-support/auth-app.ts`

**Analog:** `putAnswerPhoto` (`test-support/attempt-world.ts:208-228`).
```ts
const form = new FormData(); form.append('file', new Blob([new Uint8Array(upload.bytes)], { type: 'image/jpeg' }), 'photo.jpg')
await fetch(`${world.ctx.baseUrl}${answerPhotoPath(upload)}/${upload.photoId}`, { method: 'PUT', body: form, headers: { cookie, 'x-forwarded-for': nextIp() } })
```
`call()` см. (г).

### `app/server/src/routes/upload/upload.test.ts`

**Analog:** `routes/tests/session-photos.test.ts:1-80` (`startAuthApp`, `seedAttemptWorld`, `seedStudent`, `createAttemptTest`, `insertOpenQuestion`, `assignTest`, `memoryStorage()`); лимитер - `routes/search-limits.test.ts:53-62` (N раз 200, N+1 даёт 429 с `retry-after`, другой ключ не задет); окно по времени - `shiftStartedAt`. Кейсы: 404 одним телом (неизвестен, отозван, заблокирован, назначение снято, сессия закрыта); 422 только при живой ссылке; «Готово» гасит ссылку; учитель или админ без назначения проходит; `uploaded_via='link'`; `OPEN_ANSWER_EMPTY` считает фото по ссылке; токен и cookie одновременно; токен не читает чужой слот.

### `app/server/route-inventory.txt`

**Analog:** строки 113-117 (`PUT …/photos/:photoId  validateUUID(id) > ... > sessionRequired > answerPhotoTarget > photoBodyGate > singleFileUpload > <anonymous>`). Снимок генерирует `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory`; имена middleware берутся из `nameMiddleware` - дать `uploadTokenRequired` и лимитерам стабильные имена.

### `packages/exam-core/src/answer-photos.ts`

**Analog:** `AnswerPhotoSchema`, `AnswerPhotoListResponseSchema` (zod + `z.infer`). Схема ответа `GET /api/upload/context` (вопрос, номер, название теста, `allowPhotos`, `maxPhotos`, `uploadClosesAt`, серверное время) - туда же; новые экспорты внести в `index.ts` и список `scripts/check-exam-core-dist.mjs:11-17,81`.

### `app/web/lib/navigation/public-paths.ts`

**Analog:** `lib/session/client.ts:40-45` (единственное точное сравнение).
```ts
const AUTH_PAGE_PREFIXES = ['/login', '/invite']
function isAuthPage(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? ''
  return AUTH_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
```
Потребители - раздел (б). `AppLayout.tsx` серверный: путь ему неоткуда взять, кроме заголовка запроса (`(await headers()).get(SESSION_REFRESH_HEADER)`, `proxy.ts` прокидывает через `passThrough`/`forwardedHeaders`) либо клиентской обёртки с `usePathname`. Ограничение: `<AuthProvider` один раз и только в `AppLayout.tsx`, `<AppLayout` один раз в `app/layout.tsx`.

### `app/web/lib/upload-link/api.ts`

**Analog:** `lib/tests/answer-photos-api.ts` целиком.
```ts
export function uploadAnswerPhoto(target, photoId, blob, fileName): Promise<RequestOutcome<AnswerPhotoUploadResponse>> {
  const form = new FormData(); form.append('file', blob, fileName)
  return request(`${photosPath(target)}/${segment(photoId)}`, { method: 'PUT', body: form, parse: (b) => AnswerPhotoUploadResponseSchema.parse(b) })
}
```
Токен: `request(url, { headers: { 'X-Upload-Token': token } })` (`RequestOptions.headers`, `request.ts:25`), `Content-Type` для `FormData` не ставить. Миниатюра - `requestBlob(url, { headers, filename })` + `URL.createObjectURL`, не голый `fetch(` (`web-requests-guards`). Все статические сегменты `/api/upload/context|photos|thumb` держать в этом одном файле (`api-routes-have-callers`); сегмент `upload-link` - в `answer-photos-api.ts`.

### `app/web/components/tests/answer-photos/{upload-queue.ts, use-answer-photos.ts, PhotoBlock.tsx}`

**Analog:** сами файлы; транспорт в очереди уже параметр.
```ts
export type PhotoUploadQueueOptions = { upload: (photoId, blob, fileName) => Promise<RequestOutcome<AnswerPhotoUploadResponse>>
  remove: (photoId) => Promise<RequestOutcome<AnswerPhotoDeleteResponse>>; prepare; randomId; maxCount?: number; ... }
// use-answer-photos.ts createQueueHandle: жёстко uploadAnswerPhoto/deleteAnswerPhoto(target, ...) и listAnswerPhotos(target)
// seed(photos): entries.unshift(...новые done); count = photos.length   <- единственная сверка
// PhotoBlock Thumbnail: <img src={answerPhotoUrl(photoId, 'thumb')} onError=...>
```
Нужно: `sync(serverPhotos)` рядом с `seed` (добавляет новые `done`, убирает исчезнувшие, не трогает `preparing/uploading/retrying`, пересчитывает `count`); транспорт-объект `{ list, upload, remove, thumbSrc }` вместо `AnswerPhotoTarget`; источник миниатюры - проп (для токена object URL). Тесты - `upload-queue.test.ts` (фабрика со швами `clock/now/randomId`, vitest в `node`, без DOM).

### `app/web/app/(internal)/photo-upload/page.tsx` (+ клиент)

**Analog:** `app/(internal)/invite/[token]/page.tsx` + `InviteClient.tsx`.
```tsx
export const metadata = { title: 'Приглашение' }
export default async function InvitePage({ params }) { const { token } = await params; return <InviteClient token={token} /> }
```
Токен не из `params`, а из `location.hash` в клиенте; `metadata: { title: 'Фото к ответу', referrer: 'no-referrer', robots: ... }` (корень: `robots: 'noindex, nofollow'`, `app/layout.tsx:15-22`). Окно - `useUploadWindowView` из `components/tests/attempt-result/UploadWindowLine.tsx`, тексты отказа - `uploadWindowRefusalText` (`lib/tests/upload-window.ts`), ошибка первого запроса - `LoadErrorAlert`. Тексты и экраны - `13-UI-CONTRACT.md`.

### `app/web/components/tests/answer-photos/QrUploadDialog.tsx`

**Analog:** копирование - `components/users/dialogs/ReinviteUserDialog.tsx:68-86`; опрос и ленивая загрузка - `components/notifications/NotificationBell.tsx:25-37`. Вид и размеры - `.planning/design/qr-dialog.md`.
```tsx
try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteLink); else document.execCommand('copy'); setCopied(true) }
catch { toast.error('Не удалось скопировать ссылку.') }
useSWR(key, fetcher, { refreshInterval: 60_000, refreshWhenHidden: false, revalidateOnFocus: true })
```
Для QR: `ReactQRCode` из `@lglab/react-qr-code` в клиентской обёртке `QrCode.tsx`, подключается через `next/dynamic` (`ssr: false`). Опрос списка: `refreshInterval: 2500`, `shouldRetryOnError: false`, ключ строкой (массив запрещён `web-requests-guards`), `null` при закрытом диалоге. Адрес в `sessionStorage` по `<sessionId>:<questionId>`. Расхождения текстов: верен `qr-dialog.md` и W3 («M из M»).

### `app/web/components/tests/answer-photos/use-pointer-kind.ts`

**Analog:** `use-photo-sources.ts`. Файла `use-pointer-kind.ts` в коде нет, UI-CONTRACT ссылается на него как на существующий.
```ts
const COARSE_QUERY = '(pointer: coarse)'
function subscribe(listener) { const media = window.matchMedia(COARSE_QUERY); media.addEventListener('change', listener); return () => media.removeEventListener('change', listener) }
const coarse = useSyncExternalStore(subscribe, isCoarse, () => false)
```
Значение `'fine'|'coarse'|'unknown'`; `usePhotoSources` строится поверх.

### `app/web/components/tests/TestRunner.tsx`

**Analog:** точка вставки (~416-420).
```tsx
{!questionResult && question.questionUiTemplate === 'open' && snapshot.sessionId ? (
  <PhotoBlock photos={photoSession.photosFor(question.id)} disabled={interactionDisabled && !deadlinePassed} sources={photoSources} />) : null}
```
Кнопка «С телефона» - внутри `PhotoBlock` (qr-dialog.md); скрыта при `allow_photos = false`, не-`fine` указателе, после сдачи (`SubmittedPhotos` тоже монтирует `PhotoBlock`).

### `e2e/tests/photo-upload-link.spec.ts`

**Analog:** `e2e/tests/answer-photos.spec.ts` (serial, `newAccountContext`, `sessionAccountByPrefix(projectKey(testInfo), 'photo-student')`, `JPEG` base64, `getByRole('group', { name: 'Фото к ответу' })`, `setInputFiles`). Телефон - `browser.newContext()` без `storageState` (`newAccountContext`, `e2e/fixtures/exam.ts:67-78`, передаёт его всегда: нужен вариант без). Ссылка из DOM (`data-testid="upload-link"`), ожидания `expect.poll`/`toBeVisible`; десктопный сценарий `test.skip(projectKey(testInfo) !== 'desktop')`. Сид: `photoUploadWindowMinutes` 0 и 120 (`fixtures/seed.json:406,581`).

### e2e DEBT-02 (404 и один тост)

**Analog:** `e2e/tests/editor-validation.spec.ts:46-48` (`[data-sonner-toast][data-type="error"]` -> `toHaveCount(1)`), 404 - `e2e/tests/user-lookup.spec.ts:56`. Картинка: `img[src$="/img/not-found.svg"]`, `complete`, `naturalWidth > 0`; `[data-sonner-toaster]` ровно один.

## Особо (по просьбе запуска)

### (а) Cookie-путь фото и общая функция «слот принимает фото» (D-23)

Цепочка `routes/tests/session-photos.ts`: `sessionRequired()` (`users.is_active` проверяет только `loadSessionUser`, `services/session`) -> `answerPhotoTarget` (`checkAttemptAccess` = тест опубликован, тема активна, `isAssignedOrPrivileged(canReadTest(req))`; затем `findPhotoTarget`: сессия владельца, вопрос теста, шаблон `open` через `getQuestionTypeMapForTest`) -> `photoBodyGate` -> `singleFileUpload` -> `uploadAnswerPhoto` (в транзакции повтор: `sessionFilter` `FOR UPDATE`, `windowRefused`, W1 `readPhotoRule`, лимит, вставка), `deleteAnswerPhoto` (`FOR UPDATE`, окно), `listAnswerPhotos` (`findPhotoTarget`). В одну функцию от `{userId, testId, sessionId, questionId, via}`: активность пользователя + `checkAttemptAccess` с привилегией по `userId` (см. `scope-rules.ts`) + `findPhotoTarget` + окно + правило W1. Возвращать сырое `UploadWindowState`, чтобы ссылка отдала 404 на `session_closed`. Вызывающие: `answerPhotoTarget` и сервис ссылок; для ссылки `testId/userId` читаются из строки `test_sessions` по `session_id`.

### (б) Места публичных путей (D-25)

`app/web/proxy.ts:8-14` (`PUBLIC_PATHS`, `PUBLIC_PREFIXES`, `isPublicPath` с `startsWith` без слэша); `components/AppLayout/AppLayout.tsx:70` (`skipPaths`, `skipPathPrefixes`); `components/auth/AuthGuard.tsx:33-38` (`startsWith(prefix)`); `lib/session/client.ts:40-45`; `lib/navigation/sections.test.ts:22` (`NOT_LISTED`); побочно `lib/navigation/paths.ts` `NON_PAGE_PATHS` (`/invite`). Тесты: `proxy.test.ts:170,277` (`test.each(['/login','/invite/abc'])`), `lib/session/client.test.ts:181`, e2e `proxy-protection.spec.ts`. На публичном пути proxy всё равно делает refresh (`needsRefresh`): при отказе cookie очищаются, страницу телефона это не ломает.

### (в) Охранные тесты и снимки при новых `/api/upload/*`

- `app/server/route-inventory.txt` + `routes/route-inventory.snapshot.test.ts`: пересоздать снимок.
- `scripts/api-routes-have-callers.test.mjs`: все статические сегменты маршрута в одном файле `app/web` (не тест) или e2e; `KNOWN_UNCALLED` не расширять.
- `scripts/web-requests-guards.test.mjs`: голый `fetch(` только в двух исключениях (`LoginPageClient`, `InviteClient`); ключ SWR не массивом.
- `scripts/teacher-zone-guards.test.mjs`: `INVENTORY.length === 47` (538) и `ROUTE_FILES` - новые файлы туда не входят, число менять, только если добавлен маршрут в инвентарь; `TABLE_CHECKS`/`ZONE_ALL_CHECKS` сканируют весь `app/server/src` вне `access-policy/`.
- `scripts/attempt-integrity-guards.test.mjs:105-108,339-346`: `.from(testAssignments)` запрещён в `routes/**`.
- `scripts/auth-single-session-helpers.test.mjs:129-136`: `AuthProvider` и `AppLayout` по одному разу.
- `app/server/src/db/user-deletion-rule.test.ts`: у таблицы ссылок нет FK на `users`.
- `scripts/check-exam-core-dist.mjs`, `scripts/check-migrations.mjs` (шаг `yarn verify`), `lib/navigation/sections.test.ts` (`/photo-upload` в `NOT_LISTED`).
- Сборка web и `yarn editor:budget`: динамический импорт QR не должен попасть в первую загрузку раннера.

### (г) Тестовая инфраструктура

`call()` (`test-support/auth-app.ts:160-186`): опции `{ cookies?, ip?, body? }`, `body` всегда JSON, заголовки собираются внутри.
```ts
options: { cookies?: CookieJar | string; ip?: string; body?: unknown } = {}
const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? nextIp() }
if (cookie) headers.cookie = cookie
```
Первый серверный план: `headers?: Record<string,string>` (слияние после `cookie`), multipart-вызов с токеном по образцу `putAnswerPhoto`, помощник «выдать ссылку -> токен». `startAuthApp` поднимает полный `app.js` (с `sessionOptional`, CORS); для лимитера нужен уникальный `ip` (`nextIp()`) и ключ на кейс, счётчик в памяти общий на файл тестов.

## Shared Patterns

### Один отказ - одно тело
**Source:** `routes/auth/invites.ts:206-217`. **Apply to:** `uploadTokenRequired`, все `/api/upload/*`: 404 без различающих заголовков, не 401/403.

### Окно загрузки
**Source:** `services/attempt-sessions/upload-window.ts:29-31,43-90`. **Apply to:** функция «слот принимает фото», `context`, список.
```ts
if (input.closedAt && !input.submittedAt) return { open: false, reason: 'session_closed', closesAt: null }   // ссылке 404, не 422
```

### Ошибки загрузки
**Source:** `middleware/upload.ts:14-31` (400/413), `routes/tests/session-photos.ts:115-118` (503 + `Retry-After`). **Apply to:** PUT по ссылке.

### Клиентские запросы
**Source:** `app/web/lib/http/request.ts:19-28,197`. **Apply to:** `lib/upload-link/api.ts`, диалог QR, страница телефона.

## No Analog Found

| Файл | Причина |
|---|---|
| оболочка-пустышка страницы телефона (`<main className="h-dvh overflow-y-auto">`) | `invite` лежит внутри `AppLayout`; решение D-25 |
| чтение `location.hash`, `sessionStorage`, `history.replaceState`, object URL миниатюр | в `app/web` этого нет; RESEARCH §1, §5 |
| `ReactQRCode` в диалоге | `dynamic()` для React-компонента (форма как у `NotificationBell`) |

## Metadata

**Analog search scope:** `app/server/src` (routes, services, middleware, lib, test-support, db), `app/server/drizzle`, `app/web` (proxy, components, lib, app), `e2e`, `scripts`, `packages/exam-core/src`.
**Files scanned:** около 75.
**Pattern extraction date:** 2026-10-16
