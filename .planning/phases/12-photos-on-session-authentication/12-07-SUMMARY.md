---
phase: 12-photos-on-session-authentication
plan: 07
subsystem: api
tags: [answer-photos, express, drizzle, storage, multer, sharp]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-01 acceptImage; 12-03 answer_photos и контракт exam-core; 12-04 singleFileUpload; 12-05 пространство answers/; 12-06 адреса клиента answer-photos-api.ts"
provides:
  - "services/answer-photos: findPhotoTarget, uploadAnswerPhoto, listAnswerPhotos, deleteAnswerPhoto, removeUserAnswerPhotos; тексты ANSWER_PHOTO_NOT_FOUND, ANSWER_PHOTO_TARGET_MISSING, ANSWER_PHOTO_CONFLICT, FILE_MISSING"
  - "PUT и DELETE /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/photos/:photoId, GET …/photos"
  - "DELETE /api/users/:id удаляет файлы фото ученика до строки пользователя"
  - "Помощники тестов putAnswerPhoto и answerPhotoPath в test-support/attempt-world.ts"
affects: [12-08, 12-09, 12-10, 14, 16]

actuals:
  tokens: 9000
  tasks: 3
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Фото ответа: проверки → acceptImage вне транзакции → файлы с upsert → транзакция FOR UPDATE сессии (окно, повтор, лимит, INSERT); отказ в транзакции удаляет свои файлы"
    - "Удаление фото: транзакция FOR UPDATE сессии (окно, DELETE строки), после коммита — файлы"

key-files:
  created:
    - app/server/src/services/answer-photos/index.ts
    - app/server/src/routes/tests/session-photos.ts
    - app/server/src/routes/tests/session-photos.test.ts
  modified:
    - app/server/src/routes/index.ts
    - app/server/src/routes/users/index.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/test-support/attempt-world.ts
    - app/server/src/lib/db-errors.ts
    - app/server/route-inventory.txt
    - docs/adr/0004-storage-port-two-adapters.md

key-decisions:
  - "Допущение 3 реализовано: removeUserAnswerPhotos(userId) перед db.delete(users); ошибка хранилища прерывает удаление пользователя"
  - "Гонка двух разных сессий за один photoId (оба вставляют) — нарушение уникальности 23505 переводится в conflict (409), свои файлы удаляются"
  - "Ворота доступа answerPhotoTarget (checkAttemptAccess + findPhotoTarget) стоят до singleFileUpload: тело чужого запроса не читается"

requirements-completed: [PHOTO-02, PHOTO-03, PHOTO-06]

coverage:
  - id: D1
    description: "Фото ответа сохраняется WebP без EXIF в answers/{sessionId}/{questionId}/{photoId}, список его отдаёт"
    requirement: PHOTO-03
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/session-photos.test.ts#JPEG с Orientation 6 и GPS сохраняется вертикальным WebP без EXIF, список его отдаёт"
        status: pass
    human_judgment: false
  - id: D2
    description: "Повтор без дубля, шесть одновременных загрузок → пять фото, окно 422, чужие ответы 404, чужой photoId 409, отказы файла 413/415/400"
    requirement: PHOTO-06
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/session-photos.test.ts#PUT …/photos/:photoId: фото ответа"
        status: pass
    human_judgment: false
  - id: D3
    description: "Удаление фото при открытом окне, 422 после окна, 404 чужого; удаление ученика убирает файлы"
    requirement: PHOTO-02
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/session-photos.test.ts#DELETE …/photos/:photoId"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/tests/session-photos.test.ts#удаление ученика убирает его фото из хранилища и строки фото"
        status: pass
      - kind: other
        ref: "yarn verify"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 07: Маршруты фото ответа под сессией Summary

**Сервис `services/answer-photos` — единственный, кто строит ключи `answers/…`: идемпотентная загрузка по `photoId`, лимит 5 под `FOR UPDATE` сессии, окно фазы 11 до обработки и под блокировкой, удаление при открытом окне, файлы удаляются вместе с учеником; три маршрута под `/api/tests/public` совпадают с адресами клиента 12-06**

## Performance

- **Duration:** около 15 мин
- **Started:** 2026-10-16T11:37:00Z
- **Completed:** 2026-10-16T11:52:00Z
- **Tasks:** 3 из 3
- **Files modified:** 10 (3 новых, 7 изменённых)

## Исходы сервиса → HTTP

| Исход | Маршрут | HTTP |
| --- | --- | --- |
| нет доступа к тесту (`checkAttemptAccess`) | PUT, DELETE, GET | 404 `Test not found` / 403 `Тест не назначен` (как в `public.ts`) |
| `findPhotoTarget` ложно (чужая или несуществующая сессия, вопрос не этого теста или не open) | PUT, DELETE, GET | 404 «Ответ для фото не найден» |
| нет части `file` | PUT | 400 «Файл не передан» |
| файл больше 10 МБ / сломанная форма (`singleFileUpload`) | PUT | 413 «Файл больше 10 МБ» / 400 «Не удалось прочитать файл из запроса» |
| `ImageRejectedError` 400/413/415 | PUT | тот же статус и русский текст модуля приёма (через `next(e)`) |
| `ImageRejectedError` 503 | PUT | 503 `IMAGE_BUSY_MESSAGE`, `Retry-After: 5` |
| `created` | PUT | 201 `{ photo, count }` |
| `existing` | PUT | 200 `{ photo, count }` |
| `window` | PUT, DELETE | 422 `{ error: UPLOAD_WINDOW_CLOSED | UPLOAD_WINDOW_NONE, uploadClosesAt }` |
| `limit` | PUT | 409 `ANSWER_PHOTO_LIMIT_MESSAGE` |
| `conflict` | PUT | 409 «Это фото уже прикреплено к другому ответу» |
| `missing` | PUT / DELETE | 404 «Ответ для фото не найден» / 404 «Фото не найдено» |
| `deleted` | DELETE | 200 `{ count }` |
| список | GET | 200 `{ photos }` по `uploaded_at, id` |

## Accomplishments

- `services/answer-photos/index.ts` по `<interfaces>`. `uploadAnswerPhoto`: быстрый путь по строке `photoId` (та же сессия и вопрос → `existing` без sharp, иначе `conflict`) → предварительное окно `photoUploadWindow(db)` → `acceptImage(buffer, IMAGE_PROFILES.answerPhoto)` → запись `full.webp` и `thumb.webp` с `upsert: true` → транзакция: сессия `sessionFilter({ sessionId, owner })` `.for('update')` → `photoUploadWindow(tx)` → повторная проверка строки → `count` по (сессия, вопрос) → `INSERT` (`uploaded_at` ставит база). Отказ `window`/`limit`/`conflict`/`missing` в транзакции и любая ошибка удаляют свои файлы (`console.warn('[answer-photos] orphan objects', …)` при сбое). sharp внутри транзакции не вызывается.
- `deleteAnswerPhoto`: транзакция с `FOR UPDATE` сессии → окно → `DELETE … RETURNING` строки (фото, сессия, вопрос) → после коммита удаление двух ключей; `count` — оставшиеся фото ответа.
- `removeUserAnswerPhotos(userId)`: ключи всех фото сессий ученика одним `storage().remove`, ошибка пробрасывается; вызывается в `DELETE /api/users/:id` перед удалением строки (существующий комментарий не тронут).
- `routes/tests/session-photos.ts` монтируется в `routes/index.ts` как `router.use('/tests/public', sessionPhotosRouter)` сразу после `publicTestsRouter`; хранилище маршрут не импортирует.
- `services/attempt-sessions/index.ts`: реэкспорт `sessionFilter`. `lib/db-errors.ts`: `isUniqueViolation(err)` (SQLSTATE 23505, тем же разбором, что `isTransientDbError`).
- `test-support/attempt-world.ts`: `answerPhotoPath(target)` и `putAnswerPhoto(world, cookie, { testId, sessionId, questionId, photoId, bytes, type })` (multipart через `FormData`; `bytes: null` — форма без части `file`).
- ADR-0004, раздел «Кто читает пространство»: ключи `answers/…` строит только сервис фото; удаление пользователя удаляет файлы до строк; при удалении теста, вопроса или темы файлы `answers/` остаются до очистки сирот фазы 16 (R4).

## Разница снимка маршрутов

```
+PUT /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/photos/:photoId  validateUUID(id) > validateUUID(sessionId) > validateUUID(questionId) > validateUUID(photoId) > sessionRequired > answerPhotoTarget > singleFileUpload > <anonymous>
+DELETE /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/photos/:photoId  validateUUID(id) > validateUUID(sessionId) > validateUUID(questionId) > validateUUID(photoId) > sessionRequired > answerPhotoTarget > <anonymous>
+GET /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/photos  validateUUID(id) > validateUUID(sessionId) > validateUUID(questionId) > sessionRequired > answerPhotoTarget > <anonymous>
```

Пути совпадают с `photosPath` и `…/photos/:photoId` в `app/web/lib/tests/answer-photos-api.ts` (12-06); `api-routes-have-callers` зелёный.

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: одно фото от клиента до answers/ и строки** — не закоммичено
2. **Task 2: повтор, лимит, окно, чужие ответы, отказы файла** — не закоммичено
3. **Task 3: удаление, удаление пользователя, снимок** — не закоммичено

## Проверки

- `session-photos.test.ts`: 14 тестов, зелёные с первого прогона (tracer, повтор, 6 одновременных → 5, окно 422, три случая 404, конфликт `photoId`, четыре отказа файла, удаление при открытом окне, 422 после окна, 404 чужого, удаление ученика).
- Набор Task 3: `session-photos.test.ts`, `route-inventory.snapshot.test.ts`, `user-deletion-rule.test.ts` — 3 файла, 25 тестов.
- `node --test` `api-routes-have-callers`, `storage-no-private-access`, `tests-router-composition`, `teacher-zone-guards`: 28 из 28.
- Typecheck сервера чистый; lint — только прежнее предупреждение `keys.ts:17`; `yarn format:check` — OK.
- `yarn verify: OK` с первого прогона (server 2070, web 1690, exam-core 745, rbac 37). Серверных тестов до плана 2056 (после 12-05), после 2070 (+14).
- Критерии приёмки по `grep`: `IMAGE_PROFILES.answerPhoto` 1, `includeInactive: true` 1, `for('update')` 2, `photoUploadWindow` 2, `services/storage` в маршруте 0, `sessionPhotosRouter` в `routes/index.ts` 2, `Retry-After` 1, `removeUserAnswerPhotos` в `users/index.ts` 2, `photos/:photoId` в снимке 2; тексты лимита, окна, конфликта и «Файл больше 10 МБ» в тесте есть; пустой `mem.keys` после удаления ученика проверяется.

## CodeGraph

`codegraph impact sessionFilter` — 15 символов: `sessions.ts` (`sessionFilter:40`, `writeSessionDraft:151`, `openOrStartSession:104`); `commands.ts` (`saveSessionDraft:22`, `submitSession:46`, `startAttemptSession:11`); `submit.ts` (`precheckSubmit:80`, `submitAttempt:122`, `closeSessionAsExpired:114`); `deadline.ts` (`finalizeDraft:79`, `finalizeOnce:114`, `finalizeSessionByDeadline:185`). Сама функция не менялась, добавлен только реэкспорт.

`codegraph affected` по файлам плана (`services/answer-photos/index.ts`, `routes/tests/session-photos.ts`, `routes/index.ts`, `routes/users/index.ts`, `services/attempt-sessions/index.ts`, `test-support/attempt-world.ts`, `lib/db-errors.ts`): 32 тестовых файла; все в серверном наборе `yarn verify`.

## TDD Gate Compliance

RED не получен: сервис и маршруты Task 1 написаны сразу по полному порядку RESEARCH § Pattern 4, и тесты `<behavior>` Task 2 прошли с первого прогона; правок по их итогам не понадобилось.

## Files Created/Modified

- `app/server/src/services/answer-photos/index.ts` — сервис фото (новый).
- `app/server/src/routes/tests/session-photos.ts` — три маршрута (новый).
- `app/server/src/routes/tests/session-photos.test.ts` — интеграционные тесты (новый).
- `app/server/src/routes/index.ts` — монтирование.
- `app/server/src/routes/users/index.ts` — `removeUserAnswerPhotos` до удаления пользователя.
- `app/server/src/services/attempt-sessions/index.ts` — реэкспорт `sessionFilter`.
- `app/server/src/test-support/attempt-world.ts` — `putAnswerPhoto`, `answerPhotoPath`.
- `app/server/src/lib/db-errors.ts` — `isUniqueViolation`.
- `app/server/route-inventory.txt` — три маршрута.
- `docs/adr/0004-storage-port-two-adapters.md` — две фразы в разделе «Кто читает пространство».

## Deviations from Plan

**1. [Rule 2 - Correctness] Гонка двух сессий за один photoId**
- **Issue:** две разные сессии с одним `photoId` одновременно проходят повторную проверку (каждая блокирует свою сессию) и обе делают `INSERT`; второй получает 23505 — без обработки это 500.
- **Fix:** `isUniqueViolation` в `lib/db-errors.ts` (файл вне списка плана), в сервисе 23505 → `conflict` (409), свои файлы удаляются.
- **Verification:** typecheck; отдельным тестом гонка не закреплена (детерминированно воспроизвести сложно).

**2. Помощник `answerPhotoPath`** в `attempt-world.ts` рядом с `putAnswerPhoto` (путь списка и удаления для тестов 12-07 и 12-08).

**3. Тексты сервиса в тесте** заданы литералами: сервис импортирует базу, а `startAuthApp` должен подняться раньше; константы exam-core и `ANSWER_PHOTO_TYPE_MESSAGE` импортируются из модулей без базы.

## Issues Encountered

Нет.

## Не проверено

- Ветка 503 `IMAGE_BUSY_MESSAGE` с `Retry-After: 5` тестом не закреплена: переполнить очередь ограничителя процесса из HTTP-теста без хрупкой синхронизации нельзя (ограничитель закреплён юнитом в 12-01).
- Гонка двух сессий за один `photoId` (23505 → 409) не воспроизведена тестом.
- Окно `UPLOAD_WINDOW_NONE` (сессия закрыта без сдачи) на этом маршруте не проверялось отдельно: его даёт та же `uploadWindowRefusal`, закреплённая тестами фазы 11.

## Next Phase Readiness

- 12-08: файлы лежат по `answers/{sessionId}/{questionId}/{photoId}/{full,thumb}.webp`, `contentType: image/webp`; строку фото и сессию для проверки доступа даёт `answer_photos` + `test_sessions`; загрузка в тестах — `putAnswerPhoto(world, cookie, …)`.
- 12-09: ответы маршрутов совпадают со схемами `AnswerPhotoUploadResponseSchema`, `AnswerPhotoListResponseSchema`, `AnswerPhotoDeleteResponseSchema`.

## Предлагаемое сообщение коммита

`feat: Фото ответа под сессией ученика: PUT, DELETE и список через services/answer-photos, повтор по photoId без дубля, лимит 5 под блокировкой сессии, окно фазы 11, файлы фото удаляются вместе с учеником`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/server/src/services/answer-photos/index.ts
- FOUND: app/server/src/routes/tests/session-photos.ts
- FOUND: app/server/src/routes/tests/session-photos.test.ts
- Коммиты: не закоммичено (по правилу)
