---
phase: 12-photos-on-session-authentication
reviewed: 2026-10-16T12:42:15Z
depth: deep
files_reviewed: 62
files_reviewed_list:
  - app/server/drizzle/0031_answer_photos.sql
  - app/server/drizzle/meta/0031_snapshot.json
  - app/server/drizzle/meta/_journal.json
  - app/server/drizzle/migrations-manifest.json
  - app/server/route-inventory.txt
  - app/server/src/db/schema.ts
  - app/server/src/lib/db-errors.ts
  - app/server/src/middleware/upload.ts
  - app/server/src/routes/answer-photos.test.ts
  - app/server/src/routes/answer-photos.ts
  - app/server/src/routes/docs/assets.test.ts
  - app/server/src/routes/docs/assets.ts
  - app/server/src/routes/index.ts
  - app/server/src/routes/tests/admin/assets.ts
  - app/server/src/routes/tests/index.ts
  - app/server/src/routes/tests/registration.characterization.test.ts
  - app/server/src/routes/tests/session-photos.test.ts
  - app/server/src/routes/tests/session-photos.ts
  - app/server/src/routes/tests/teacher-zone-tests.matrix.test.ts
  - app/server/src/routes/uploads.test.ts
  - app/server/src/routes/users/avatar.characterization.test.ts
  - app/server/src/routes/users/avatar.ts
  - app/server/src/routes/users/index.ts
  - app/server/src/scripts/photo-memory-bench.ts
  - app/server/src/services/access-policy/index.ts
  - app/server/src/services/access-policy/scope-rules.ts
  - app/server/src/services/access-policy/scope.test.ts
  - app/server/src/services/access-policy/scope.ts
  - app/server/src/services/access-policy/zone-loader.ts
  - app/server/src/services/answer-photos/index.ts
  - app/server/src/services/assets/avatars.ts
  - app/server/src/services/assets/image-intake.test.ts
  - app/server/src/services/assets/image-intake.ts
  - app/server/src/services/assets/images.ts
  - app/server/src/services/assets/index.ts
  - app/server/src/services/assets/inline-images.ts
  - app/server/src/services/attempt-sessions/index.ts
  - app/server/src/services/storage/index.ts
  - app/server/src/services/storage/keys.ts
  - app/server/src/services/storage/links.test.ts
  - app/server/src/test-support/attempt-world.ts
  - app/web/components/tests/TestRunner.tsx
  - app/web/components/tests/answer-photos/PhotoBlock.tsx
  - app/web/components/tests/answer-photos/resize.ts
  - app/web/components/tests/answer-photos/upload-queue.test.ts
  - app/web/components/tests/answer-photos/upload-queue.ts
  - app/web/components/tests/answer-photos/use-answer-photos.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle.ts
  - app/web/lib/tests/answer-photos-api.ts
  - app/web/lib/tests/upload-window.test.ts
  - app/web/lib/tests/upload-window.ts
  - app/web/next.config.ts
  - docs/adr/0004-storage-port-two-adapters.md
  - e2e/fixtures/seed.json
  - e2e/tests/answer-photos.spec.ts
  - packages/exam-core/src/answer-photos.ts
  - packages/exam-core/src/index.ts
  - scripts/check-exam-core-dist.mjs
  - scripts/check-migrations.mjs
  - scripts/storage-no-private-access.test.mjs
  - scripts/teacher-zone-guards.test.mjs
  - scripts/tests-router-composition.test.mjs
findings:
  critical: 0
  warning: 5
  info: 8
  total: 13
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-10-16T12:42:15Z
**Depth:** deep
**Files Reviewed:** 62
**Status:** issues_found

## Summary

Проверены серверная цепочка фото ответа (multer-обёртка `singleFileUpload` → `answerPhotoTarget` → `uploadAnswerPhoto` → `acceptImage` → хранилище → транзакция с блокировкой сессии), раздача `GET /api/answer-photos/:photoId/:variant` через `canReadAnswerPhoto`, правило `NAMESPACE_READERS`, миграция 0031 со снимком, журналом и манифестом, удаление ученика, а также клиентская очередь, реестр очередей в `TestRunner`, `PhotoBlock` и уменьшение в браузере. Тестовые файлы просмотрены только на надёжность.

Подтверждено и замечаний не даёт:
- Миграция 0031 совпадает со `schema.ts` и снимком: колонки, три FK с теми же `onDelete`, индекс, RLS и политика `deny_direct_access`. sha256 в манифесте совпадает с файлом.
- Лимит 5 при параллельных загрузках держится: счёт и вставка идут под `SELECT … FOR UPDATE` строки сессии, и `submitSession` (`submit.ts:149`) берёт ту же блокировку.
- Ключи `answers/` строятся только из строки БД и UUID, прошедших `validateUUID`. Общий прокси и `signed` отвечают 400. `storageUrl` бросает ошибку. `publicUrl` нигде на сервере не вызывается.
- `canReadAnswerPhoto` отдаёт фото владельцу всегда, проверяющему только при `test_sessions.attempt_id`. На чужое фото, неизвестный вариант и отсутствующее фото маршрут отвечает одним и тем же 404.
- Удалённый маршрут `POST /api/tests/:id/assets` клиент не вызывает.
- `MediaLibrary.tsx` берёт текст отказа через `failureMessage`, поэтому смена 400→415 его не ломает.
- Объектов `createObjectURL` в коде фазы нет, освобождать нечего.

Блокирующих дефектов не найдено. Главные риски такие:
- Память API не ограничена до входа в ограничитель: буферы multer по 10 МБ не считаются.
- Клиентская гонка «удалил, а фото всё равно сохранилось».
- Тихая потеря фото из очереди при сдаче или уходе со страницы.
- Чёрный фон у PNG с прозрачностью после уменьшения в браузере.
- Любая внутренняя ошибка sharp превращается в 400 «файл повреждён».

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Память API не ограничена до ограничителя: буферы multer по 10 МБ не считаются, 503 приходит только после полной загрузки тела

**File:** `app/server/src/routes/tests/session-photos.ts:87-109`, `app/server/src/middleware/upload.ts:21-31`, `app/server/src/services/assets/image-intake.ts:135-143`, `app/server/src/services/assets/image-intake.ts:215-224`, `docs/adr/0004-storage-port-two-adapters.md` (раздел «Обработка фото и память»)
**Issue:** Очередь `IMAGE_INTAKE_QUEUE_LIMIT = 8` проверяется внутри `limiter.run`. Перед этим multer `memoryStorage` уже целиком прочитал тело (до 10 МБ), а `detectImageType` и `readPixels` уже отработали. Число одновременных PUT ничем не ограничено: на маршруте нет `rateLimiter`, а на `/api` нет общего лимита. N параллельных запросов держат N×10 МБ, пока каждый не получит 503, и после отказа клиент повторяет запрос (`isRetryable` для 5xx). Один вошедший ученик или несколько вкладок могут поднять RSS API выше лимита контейнера. Строка ADR «ждущие задачи держат только буферы запросов, до 80 МБ» описывает только очередь sharp, а запросы, которые ещё читают тело, в неё не попадают. Критерий фазы «память API ограничена» в коде не обеспечен.
**Fix:** До `singleFileUpload` поставить счётчик принимаемых фото на процесс и отказывать сразу, не читая тело. Дополнительно повесить `rateLimiter` на ученика:
```ts
let receiving = 0
const RECEIVE_LIMIT = IMAGE_INTAKE_CONCURRENCY + IMAGE_INTAKE_QUEUE_LIMIT
function photoIntakeGate(req: Request, res: Response, next: NextFunction) {
	if (receiving >= RECEIVE_LIMIT) {
		res.setHeader('Retry-After', BUSY_RETRY_AFTER_SECONDS)
		return res.status(503).json({ error: IMAGE_BUSY_MESSAGE })
	}
	receiving += 1
	res.once('close', () => { receiving -= 1 })
	next()
}
router.put(PHOTO_PATH, ..., sessionRequired(), rateLimiter(...), answerPhotoTarget, photoIntakeGate, singleFileUpload(...), handler)
```
Строку ADR поправить: в ней должны учитываться и буферы запросов, которые ещё читаются.

### WR-02: Удаление фото на клиенте считает 404 успехом, хотя исходная загрузка может ещё идти на сервере, и «удалённое» фото потом сохраняется

**File:** `app/web/components/tests/answer-photos/upload-queue.ts:238-240`, `app/web/components/tests/answer-photos/upload-queue.ts:282-298`, `app/server/src/services/answer-photos/index.ts:123-168`
**Issue:** Запрос может получить `network` (обрыв мобильной сети, таймаут прокси), пока сервер ещё обрабатывает фото: ждёт в очереди sharp (до 9 задач × ~0,6 с) или пишет в хранилище. Запись тогда переходит в `retrying`, и `REMOVABLE` разрешает её удалить. DELETE доходит до сервера раньше вставки строки и получает 404, `settleRemove` выбрасывает запись и пересчитывает `count`. После этого исходный PUT коммитит строку. Фото, которое ученик удалил, остаётся на сервере: оно занимает место в лимите 5, а после сдачи его видит проверяющий. Ученик узнает о нём только после перезагрузки. Сервер не защищён: DELETE неизвестного `photoId` ничего не запоминает, и поздний PUT того же `photoId` создаёт строку заново. Обработчик PUT (`session-photos.ts:96-108`) и `uploadAnswerPhoto` не проверяют обрыв соединения (`req.aborted`, `res.closed`), поэтому оборванный запрос доходит до коммита.
**Fix:** Любой из двух вариантов.
1. На сервере DELETE неизвестного `photoId` в своей сессии записывает надгробие (строка с `deleted_at` или отдельная таблица), и PUT с этим `photoId` отвечает 409 или 410.
2. На клиенте запись, у которой хотя бы одна попытка кончилась `network`, после 404 на DELETE не выбрасывается сразу: через интервал перечитывается список (`listAnswerPhotos`) и DELETE повторяется, если фото появилось.

### WR-03: Сдача или уход со страницы тихо выбрасывают фото, которые стоят в очереди или ещё отправляются

**File:** `app/web/components/tests/answer-photos/use-answer-photos.ts:47-85`, `app/web/components/tests/TestRunner.tsx:154`, `app/web/components/tests/TestRunner.tsx:403-408`, `app/web/components/tests/attempt-lifecycle/lifecycle.ts:730`
**Issue:** После `sendSubmit` делается `session = null`, и `snapshot.sessionId` становится `null`. Из-за этого `useMemo` создаёт новый реестр, а `release()` старого через `setTimeout(0)` вызывает `queue.dispose()` у всех очередей. Фото, которые ещё стоят `queued` (очередь отправляет по одному), не уходят вовсе, а результат текущего запроса отбрасывается проверкой `isCurrent`. То же происходит при размонтировании `AttemptRunner`, то есть при уходе со страницы. Ученик выбрал 3 фото, нажал «Завершить», и 2 из них молча не прикрепились. Сдача не ждёт очередь и не предупреждает, хотя после сдачи окно фото на сервере ещё открыто (`uploadClosesAt`). Сейчас это ограничено решением D-19 (тип `open` есть только в сиде), но фаза 14 включит сдачу открытого вопроса.
**Fix:** Дать реестру `pending(): number` (сумма `preparing|uploading|retrying` по очередям). В `TestRunner` перед сдачей ждать опустошения очередей или показывать подтверждение «N фото ещё загружаются». Освобождение реестра не должно выбрасывать записи `queued`: dispose только после того, как все очереди пусты. Повесить `beforeunload`, пока `pending() > 0`.

### WR-04: Уменьшение в браузере кладёт PNG/WebP с прозрачностью на чёрный фон

**File:** `app/web/components/tests/answer-photos/resize.ts:27-34`
**Issue:** Canvas создаётся прозрачным, `drawImage` переносит альфу, а `toBlob('image/jpeg')` заменяет прозрачные пиксели чёрными. PNG рисунка или схемы с прозрачным фоном и тёмными линиями (экспорт из планшетного редактора или скриншот-аннотация) превращается в почти сплошной чёрный кадр. Ученик видит миниатюру уже после загрузки, а проверяющий получает нечитаемый ответ. Сервер принимает PNG и сам свёл бы альфу корректно, но клиент отправляет уже испорченный JPEG.
**Fix:**
```ts
const context = canvas.getContext('2d')
if (!context) return original
context.fillStyle = '#fff'
context.fillRect(0, 0, canvas.width, canvas.height)
context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
```

### WR-05: Любая ошибка sharp, включая внутренние и ресурсные, превращается в 400 «Файл повреждён», и клиент не повторяет запрос

**File:** `app/server/src/services/assets/image-intake.ts:153-158`, `app/server/src/services/assets/image-intake.ts:160-169`, `app/server/src/services/assets/image-intake.ts:207-209`, `app/server/src/services/assets/inline-images.ts:31-36`
**Issue:** `decodeFailure` отображает в `ImageRejectedError(400, IMAGE_CORRUPT_MESSAGE)` всё, кроме «exceeds pixel limit»: и битый файл, и `vips_malloc: out of memory`, и ошибки потоков libvips, и сбои после декодирования (кодирование WebP, миниатюра). Клиент считает 400 отказом (`isRefusal`) и ставит `refused` без кнопки «Повторить». Временный сбой сервера под нагрузкой, против которого и нужны 503 с повтором, выглядит для ученика как «ваш файл повреждён». Ошибка не попадает в журнал как 5xx. В `inline-images` такой сбой молча оставляет base64 в тексте вопроса.
**Fix:** Сводить к 400 только ошибки декодирования входа, а остальное пробрасывать как есть (500) или как 503:
```ts
const DECODE_ERRORS = /unsupported image format|corrupt|premature end|bad (huffman|seek)|not a known file format|Input buffer/i
function decodeFailure(error: unknown): Error {
	if (error instanceof ImageRejectedError) return error
	const message = error instanceof Error ? error.message : ''
	if (message.includes('exceeds pixel limit')) return new ImageRejectedError(413, IMAGE_TOO_LARGE_MESSAGE)
	if (DECODE_ERRORS.test(message)) return new ImageRejectedError(400, IMAGE_CORRUPT_MESSAGE)
	return error instanceof Error ? error : new Error(String(error))
}
```
Набор сообщений закрепить тестом на битых JPEG, PNG и WebP.

## Info

### IN-01: Детерминированные ключи и запись с `upsert: true` до блокировки: откат одного запроса может удалить файлы параллельного запроса с тем же `photoId`

**File:** `app/server/src/services/answer-photos/index.ts:137-175`
**Issue:** Пусть два PUT с одним `photoId` в одной сессии идут одновременно: это повтор клиента после `network`, пока первый ещё работает. Оба пишут в одни и те же ключи до транзакции. Если первый потом падает (временная ошибка БД в транзакции) или получает `limit`, после чего DELETE освобождает место, его `removeQuietly(written)` удаляет общие файлы. Второй запрос после этого вставляет строку, и у неё нет файлов: раздача отвечает 404. Вероятность низкая.
**Fix:** Перед `removeQuietly(written)` перечитать строку по `photoId` и не удалять файлы, если она существует с тем же местом. Другой вариант: писать во временный ключ с суффиксом запроса и переносить его `copy` после вставки.

### IN-02: Удаление ученика сначала удаляет файлы, потом пользователя, без компенсации

**File:** `app/server/src/routes/users/index.ts:265-268`, `app/server/src/services/answer-photos/index.ts:223-232`
**Issue:** Если `db.delete(users)` упадёт (временная ошибка БД; все FK на `users` — `cascade` или `set null`), ученик останется со строками фото без файлов. Загрузка, начатая между `removeUserAnswerPhotos` и удалением, оставит файл-сироту. Порядок закреплён в ADR-0004, но обратный порядок безопаснее.
**Fix:** Собрать ключи, удалить пользователя (строки уйдут каскадом), затем `removeQuietly(keys)`. Сбой хранилища тогда оставляет сирот для фазы 16, а не строки без файлов.

### IN-03: Каскадное удаление теста, вопроса или темы оставляет приватные файлы `answers/` без ссылки

**File:** `app/server/src/services/question-content/remove.ts:164`, `app/server/src/services/question-content/remove.ts:207`, `app/server/src/services/question-content/remove.ts:234`, `app/server/drizzle/0031_answer_photos.sql:12-13`
**Issue:** Строки `answer_photos` уходят каскадом, файлы остаются. Найти их потом можно только листингом `answers/` и сверкой с `test_sessions`. Решение записано в ADR-0004 и отложено на фазу 16, а до неё фото учеников хранятся без срока и без владельца в БД.
**Fix:** В фазе 16 очистка сирот должна идти от листинга `answers/{sessionId}`, а не от строк. Как вариант: в `remove.ts` до `DELETE` собирать ключи фото и удалять их после коммита.

### IN-04: `answer_photos.attempt_id` не пишется, доступ берётся из `test_sessions.attempt_id`; у FK нет индексов

**File:** `app/server/src/db/schema.ts:581-610`, `app/server/src/services/access-policy/zone-loader.ts:139-148`
**Issue:** Колонка `attempt_id` остаётся `NULL` (это закреплено тестом `answer-photos.test.ts:148-154`), а `canReadAnswerPhoto` читает попытку из сессии. Если фаза 14 начнёт писать `answer_photos.attempt_id`, появятся два источника истины. У FK `attempt_id` и `question_id` нет своих индексов: составной индекс начинается с `session_id`, поэтому каскад от `test_attempts` и `questions` просматривает таблицу целиком.
**Fix:** Либо убрать колонку новой миграцией, либо в фазе 14 перевести `answerPhotoSubject` на неё и писать её при сдаче в той же транзакции.

### IN-05: 409 «уже прикреплено к другому ответу» подтверждает, что чужой `photoId` существует

**File:** `app/server/src/services/answer-photos/index.ts:123-126`
**Issue:** Поиск по `photoId` идёт без фильтра по владельцу, и на чужой id ответ отличается от ответа на свободный. UUID создаёт клиент, угадать его практически нельзя, поэтому риск мал. Но это расходится с принципом D-16: чужое неотличимо от отсутствующего.
**Fix:** Допустимо оставить. Строже: для чужой сессии отвечать так же, как при успешном создании нового id, или единым 409 без текста про «другой ответ».

### IN-06: Клиент не читает `Retry-After` в ответе 503

**File:** `app/web/components/tests/answer-photos/upload-queue.ts:42`, `app/web/components/tests/answer-photos/upload-queue.ts:179-186`, `app/server/src/routes/tests/session-photos.ts:102-104`
**Issue:** Сервер просит повторить через 5 с, а клиент повторяет через 1, 3 и 9 с, то есть первый повтор почти наверняка снова получит 503.
**Fix:** Для 503 брать задержку не меньше `Retry-After`, если заголовок есть. Для этого `RequestFailure` должен пронести заголовок.

### IN-07: Миниатюра после одной неудачной загрузки навсегда показывает значок «нет изображения»

**File:** `app/web/components/tests/answer-photos/PhotoBlock.tsx:47-58`
**Issue:** `onError` ставит `broken` без повтора. Временный 5xx или обрыв при загрузке `<img>` оставляет значок до перемонтирования блока.
**Fix:** Дать одну отложенную попытку с параметром кэша или кнопку «Обновить» на значке.

### IN-08: Дублирующая проверка цели в `listAnswerPhotos` и недостижимая ветка в маршруте

**File:** `app/server/src/services/answer-photos/index.ts:178-179`, `app/server/src/routes/tests/session-photos.ts:138-139`
**Issue:** `answerPhotoTarget` уже вызвал `findPhotoTarget`, а `listAnswerPhotos` повторяет три запроса. Ветка `photos === null` в маршруте практически недостижима.
**Fix:** Оставить проверку в одном месте: либо в middleware, либо в сервисе. Тогда ветка `null` уйдёт.

---

_Reviewed: 2026-10-16T12:42:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

## Решения по находкам (2026-10-16)

Находки прошли опровержение (devils-advocate) по коду.

| id | решение | основание |
|----|---------|-----------|
| WR-04 | исправлено | `resize.ts`: белая заливка холста перед `drawImage` |
| WR-05 | исправлено частично | миниатюра вынесена из перехвата ошибок декодирования в `makeThumb`: её сбой больше не выдаётся за «Файл повреждён» и попадает в журнал как 500; ошибки первого декодирования остаются 400 |
| UUID (флаг аудита) | исправлено | `validateUUID` приводит параметр к нижнему регистру; тест в `session-photos.test.ts` |
| WR-01 | исправлено | проверка верификатором: критерий 5 требует ограничения памяти до чтения тела; `inFlightGate` (`middleware/in-flight-gate.ts`) перед `singleFileUpload`, лимит 9 одновременных приёмов (обработка 1 плюс очередь 8), сверх этого 503 с `Retry-After`; строка ADR-0004 поправлена; тест `in-flight-gate.test.ts` |
| WR-02 | отложено | сценарий из ревью недостижим из интерфейса (у `retrying` нет «Удалить»), остаётся узкий путь через `failed`; запись в журнале окон |
| WR-03 | передано в фазу 14 | при сдаче теряется вся очередь, кроме идущего запроса; текст `12-UI-SPEC.md:303` и `12-09-SUMMARY.md:161` неточен |
| IN-01…IN-08 | без изменений | информационные, сопровождение |
