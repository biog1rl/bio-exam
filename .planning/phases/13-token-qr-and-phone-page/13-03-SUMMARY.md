---
phase: 13-token-qr-and-phone-page
plan: 03
subsystem: api
status: complete
tags: [upload-links, token, rate-limit, logger, route-inventory, web-client]
requires:
  - "13-02: readPhotoSlot, placeOfSession, AnswerPhotoSource, схемы ссылки в exam-core, call с headers и form"
provides:
  - "services/upload-links: issueUploadLink, resolveUploadLink, uploadLinkSlot, readUploadContext, touchUploadLink, placeOfUploadScope"
  - "middleware uploadTokenRequired, req.uploadScope, sendInvalidUploadLink"
  - "маршруты POST …/questions/:questionId/upload-link и /api/upload/* (context, photos, PUT/DELETE photos/:photoId, photos/:photoId/thumb)"
  - "routes/answer-photo-intake.ts: photoBodyGate, sendUploadOutcome, sendDeleteOutcome, sendIntakeBusy, sendAnswerPhotoFile"
  - "app/web/lib/upload-link/api.ts"
affects: [13-05, 13-06, 13-07, 13-08]
tech-stack:
  added: []
  patterns:
    - "ссылка-способность: токен только заголовком X-Upload-Token, слот только из строки ссылки"
    - "лимиты порядком в uploadTokenRequired: IP-предохранитель до поиска токена, затем по IP для неизвестного токена или по linkId для найденного"
key-files:
  created:
    - app/server/src/services/upload-links/index.ts
    - app/server/src/middleware/uploadTokenRequired.ts
    - app/server/src/routes/upload/index.ts
    - app/server/src/routes/upload/upload.test.ts
    - app/server/src/routes/answer-photo-intake.ts
    - app/web/lib/upload-link/api.ts
  modified:
    - app/server/src/routes/index.ts
    - app/server/src/routes/tests/session-photos.ts
    - app/server/src/routes/answer-photos.ts
    - app/server/src/services/answer-photos/index.ts
    - app/server/src/lib/logger.ts
    - app/server/src/lib/logger.test.ts
    - app/server/route-inventory.txt
decisions:
  - "resolveUploadLink одним запросом с test_sessions читает владельца и признак «выдана до сдачи» (created_at < submitted_at в SQL), uploadLinkSlot затем вызывает readPhotoSlot(db)"
  - "ключ лимитера по ссылке — linkId из WeakMap запроса: req.uploadScope ставится только живой ссылке"
  - "DeleteOutcome: refused (слот не принимает) и absent с count (фото нет в слоте); cookie отображает оба в 404 ANSWER_PHOTO_NOT_FOUND, ссылка — в 404 недействительной ссылки и 200 { count }"
  - "заголовки раздачи фото — одна функция sendAnswerPhotoFile для /api/answer-photos и миниатюры по ссылке"
metrics:
  duration: "~35 мин"
  completed: 2026-10-17
estimate:
  tokens: 180000
  tasks: 3
actuals:
  tokens: 15000
  tasks: 3
  commits: 0
plan_head_before: 4f85a3ebccc6ce43f557da673fe4728279d84d59
plan_head_after: 4f85a3ebccc6ce43f557da673fe4728279d84d59
---

# Phase 13 Plan 03: ссылка по токену, маршруты /api/upload/* и лимиты Summary

Ученик под cookie получает ссылку (`POST …/upload-link` → 201 `{ token, uploadClosesAt, serverNow }`, в базе только sha256, не больше трёх активных на слот). Телефон с заголовком `X-Upload-Token` без входа читает контекст вопроса, список фото и миниатюры своего слота, загружает (`uploaded_via = 'link'`) и удаляет фото. Живость ссылки на каждом запросе считается по текущей базе через `readPhotoSlot`, отказы единые 404/422, лимиты считаются по ссылке, токен в журнале скрыт.

Коммиты: не закоммичено (коммитит ведущая сессия). `actuals.commits: 0` намеренно, по `13-EXEC-RULES.md`. `actuals.tokens` — chars/4 по диффу и новым файлам (~59 тыс. знаков).

## Задачи

| # | Задача | Итог |
|---|--------|------|
| 1 | Выдача → токен → `GET /api/upload/context` | `services/upload-links`, `uploadTokenRequired`, `routes/upload` (`/context`), монтирование `/upload` после `/answer-photos`, маршрут выдачи в `session-photos.ts` с лимитом 10/мин на `userId` и `Cache-Control: no-store` |
| 2 | Фото по ссылке, миниатюры, ротация, лимиты, единый отказ | `routes/answer-photo-intake.ts` (один `photoBodyGate` на оба роутера); `GET/PUT/DELETE /photos…`, `GET /photos/:photoId/thumb`; `readAnswerPhotoFile` с фильтром слота; `DeleteOutcome` с `refused`/`absent`; `touchUploadLink` после ответа ниже 400, не чаще раза в 30 с, ошибку глотает и пишет в `req.log.warn` |
| 3 | Журнал, инвентарь, охрана, web-клиент | `req.headers["x-upload-token"]` в `LOG_REDACT_PATHS` и тест; снимок инвентаря; охранные тесты по `inventoryText(app)`; `app/web/lib/upload-link/api.ts` |

## Правило живости ссылки (D-08, решение владельца 2026-10-16)

1. Токен 43 символа base64url, иначе отказ без запроса в базу.
2. Поиск по уникальному индексу `token_hash`, `revoked_at IS NULL`, `created_at > now() - interval '24 hours'`.
3. Ссылка, выданная до сдачи (`submitted_at IS NOT NULL AND created_at < submitted_at`), — недействительна.
4. `readPhotoSlot(db, place)`: любой `refused` (заблокирован, назначение снято, тест скрыт, вопрос не тот) — недействительна; окно `session_closed` — недействительна (404, не 422).
5. Окно закрыто или его нет — 422 тела `uploadWindowRefusal` (`UPLOAD_WINDOW_CLOSED` со временем или `UPLOAD_WINDOW_NONE`).
6. Иначе `req.uploadScope = { linkId, sessionId, questionId }`; маршруты берут место через `placeOfSession`.

Недействительная ссылка — 404 `{ error: 'Ссылка недействительна' }`, заголовки `X-RateLimit-*` сняты.

## Лимиты (D-12)

| Ключ | Число | Когда считается |
|------|-------|-----------------|
| `upload-ip` | 3000/мин на IP | каждый запрос `/api/upload/*` до поиска токена |
| `upload-unknown` | 600/мин на IP | токен не найден, отозван или старше 24 ч |
| `upload-link` | 120/мин на `linkId` | токен найден (в том числе если слот затем отказывает) |
| `upload-link-issue` | 10/мин на `userId` | выдача ссылки под cookie |

Отказ лимита — 429 общим `errorHandler` с `Retry-After`.

## Разница снимка инвентаря

```diff
 GET /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/photos  validateUUID(id) > validateUUID(sessionId) > validateUUID(questionId) > sessionRequired > answerPhotoTarget > <anonymous>
+POST /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/upload-link  validateUUID(id) > validateUUID(sessionId) > validateUUID(questionId) > sessionRequired > rateLimiter(upload-link-issue,10/60000ms) > <anonymous>
 GET /api/tests/public/attempts/:attemptId  validateUUID(attemptId) > sessionRequired > <anonymous>
 GET /api/answer-photos/:photoId/:variant  validateUUID(photoId) > sessionRequired > <anonymous>
+GET /api/upload/context  uploadTokenRequired > <anonymous>
+GET /api/upload/photos  uploadTokenRequired > <anonymous>
+PUT /api/upload/photos/:photoId  validateUUID(photoId) > uploadTokenRequired > photoBodyGate > singleFileUpload > <anonymous>
+DELETE /api/upload/photos/:photoId  validateUUID(photoId) > uploadTokenRequired > <anonymous>
+GET /api/upload/photos/:photoId/thumb  validateUUID(photoId) > uploadTokenRequired > <anonymous>
```

Прежние строки не изменились (133 → 139).

## Проверки

- Задача 1 и 2: `vitest run src/routes/upload src/routes/tests/session-photos.test.ts src/routes/answer-photos.test.ts src/routes/tests/open-answer-submit.test.ts src/lib/logger.test.ts` — 6 файлов, 89 тестов, все прошли.
- Задача 3: `vitest run src/lib/logger.test.ts src/routes/upload src/routes/route-inventory.snapshot.test.ts` — 4 файла, 46 тестов; `node --test scripts/*.test.mjs` — 193 из 193; `yarn workspace @bio-exam/web typecheck` — без ошибок; `yarn workspace @bio-exam/web lint` — код 0, только прежние предупреждения в чужих файлах, в `lib/upload-link` их нет.
- Дополнительно: весь набор сервера — 114 файлов, 2175 тестов, все прошли; `scripts/**/*.test.mjs` — 236 из 236; typecheck и lint сервера — без новых замечаний (прежнее предупреждение `storage/keys.ts:17`); `format:check` чисто.
- Критерии приёмки: в `uploadTokenRequired.ts` нет `authUser`, `requestAccess`, `req.params|body|query`; `router.use('/upload'` сразу после `/answer-photos`; `inFlightGate(` один раз — в `answer-photo-intake.ts`; в `routes/upload/index.ts` нет `canReadAnswerPhoto` и `/full`; 5 строк `/api/upload/` в инвентаре; в `api.ts` нет `fetch(`.

`upload.test.ts` (27 тестов):
- выдача и контекст: номер вопроса по `order`, `maxPhotos` вопроса, `uploadClosesAt` null у теста без таймера; токен без cookie и с cookie чужого пользователя — тот же слот; `allow_photos = false` до выдачи — 409; четвёртая выдача гасит старшую (строка остаётся с `revoked_at`); пять параллельных выдач — 201 у всех, активных ровно 3; 11-я выдача за минуту — 429;
- `test.each` пяти причин D-09 (неизвестный, отозван четвёртой выдачей, заблокирован, назначение снято, сессия закрыта без сдачи): 404, одно тело, одинаковые заголовки без `date` и `x-request-id`, без `X-RateLimit-*`;
- ссылка старше 24 часов — 404; ссылка до сдачи по дедлайну после сдачи — 404, новая выдача после сдачи — 201 с `uploadClosesAt`, PUT — 201, «Готово» (`uploads-done`) — 422 `UPLOAD_WINDOW_CLOSED`; окно истекло по времени — 422 `UPLOAD_WINDOW_CLOSED` со временем; живая ссылка у сданной сессии без окна — 422 `UPLOAD_WINDOW_NONE`;
- фото: `uploaded_via = 'link'`, повтор PUT — 200 без дубля; учитель без назначения; `allow_photos = false` после выдачи — PUT 409 `ANSWER_PHOTO_FORBIDDEN_MESSAGE`; телефон читает миниатюру и удаляет фото, загруженное с компьютера, повторное удаление — 200 `{ count: 0 }`; токен слота А не видит, не удаляет (фото Б остаётся), не читает миниатюру (404 `Фото не найдено`) и не перехватывает `photoId` (409); фото по ссылке снимает `OPEN_ANSWER_EMPTY` при сдаче без окна (до фото — 422);
- лимиты: 121-й запрос по ссылке — 429, другая ссылка с того же IP — 200; неизвестный токен 601-й раз с одного IP — 429;
- `last_used_at`: отказ 404 его не пишет, GET пишет, ссылок не создаёт и не гасит; сбой записи (подмена `db.update`) не меняет ответ 200 и не роняет процесс;
- охрана: строки `/api/upload/` — с `uploadTokenRequired` и без `sessionRequired`, вне них `uploadTokenRequired` нет; каждый маршрут инвентаря под `sessionRequired` (включая `GET /api/answer-photos/:photoId/full` и cookie-маршруты фото) на один заголовок токена живой ссылки отвечает 401.

## Deviations from Plan

### Auto-fixed Issues

Нет.

### Отклонения по исполнению

1. **Чтение владельца сессии.** План: `uploadLinkSlot` вызывает `placeOfSession` вместе с `submitted_at`. Сделано: `resolveUploadLink` одним запросом с `test_sessions` возвращает место и признак «выдана до сдачи», сравнение `created_at < submitted_at` в SQL (без потери микросекунд в JS). `placeOfSession` используют маршруты по `req.uploadScope`.
2. **Ключ лимитера по ссылке.** Вместо `clientKey: (req) => req.uploadScope?.linkId` — `WeakMap` запроса с `linkId`: лимит считается до проверки слота, а `req.uploadScope` ставится только живой ссылке.
3. **`routes/answer-photos.ts` изменён** (нет в списке плана): заголовки раздачи вынесены в `sendAnswerPhotoFile` и общие с миниатюрой по ссылке, чтобы не копировать шесть заголовков.
4. **Тест `UPLOAD_WINDOW_NONE`.** По правилу владельца ссылка, выданная до сдачи, после сдачи мертва, а выдать новую без окна нельзя, поэтому живой ссылки с `no_window` в жизни не бывает. Отображение проверено ссылкой, у которой `created_at` в базе сдвинут на момент после сдачи.
5. **Тест сдачи по дедлайну.** `shiftStartedAt` сдвигает начало сессии на 12 минут, а `created_at` ссылки остаётся «сейчас», то есть позже момента сдачи по таймеру. В тесте `created_at` ссылки сдвинут вместе с началом (на 11 минут назад), иначе ссылка «выдана после сдачи».
6. **`:variant` в охранном обходе** — `full` (план: `thumb`): так обход покрывает названный в плане случай `GET /api/answer-photos/:photoId/full`; 401 отдаётся до проверки варианта.
7. **`readUploadContext`** заново вызывает `placeOfSession` и `readPhotoSlot`: в `req.uploadScope` по плану только три идентификатора. Это лишние запросы на `GET /context`; на список и загрузку не влияет.

## Known Stubs

Нет. `app/web/lib/upload-link/api.ts` пока никто не импортирует: его подключают планы страницы телефона и диалога QR.

## Threat Flags

Нет новой поверхности сверх `<threat_model>` плана.

## Issues Encountered

Нет.

## User Setup Required

Нет. Caddy (`/photo-upload*`, `/api/upload/*`, фильтр `X-Upload-Token`) — шаг владельца плана 13-08.

## Next Phase Readiness

- Web: транспорт телефона — функции `app/web/lib/upload-link/api.ts`; 404 любой причины — «ссылка недействительна», 422 — «окно закрыто» (`uploadClosesAt`), 429 — отдельный текст по `Retry-After`.
- Повторное удаление и удаление уже удалённого с компьютера фото по ссылке отвечают 200 `{ count }`: команда `sync` очереди не должна считать это ошибкой.
- `x-upload-token` в `LOG_REDACT_PATHS` закрывает журнал API; маскировку в Caddy проверяет владелец.

## Self-Check: PASSED

- FOUND: app/server/src/services/upload-links/index.ts
- FOUND: app/server/src/middleware/uploadTokenRequired.ts
- FOUND: app/server/src/routes/upload/index.ts
- FOUND: app/server/src/routes/upload/upload.test.ts
- FOUND: app/server/src/routes/answer-photo-intake.ts
- FOUND: app/web/lib/upload-link/api.ts
- Коммитов нет намеренно (правила фазы).
