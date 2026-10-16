---
phase: 12-photos-on-session-authentication
plan: 04
subsystem: api
tags: [multer, uploads, errors, route-inventory]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-01: acceptImage и тексты профилей; 12-02: uploads.test.ts без мёртвого маршрута"
provides:
  - "middleware/upload.ts: singleFileUpload({ field, maxBytes }), uploadTooLargeMessage, UPLOAD_READ_ERROR"
  - "POST /api/docs/assets и POST /api/users/avatar на singleFileUpload без фильтра по Content-Type: 413/415/400 с русским текстом вместо 500"
affects: [12-07]

actuals:
  tokens: 3500
  tasks: 2
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Ошибки multer и busboy переводит одна обёртка singleFileUpload: LIMIT_FILE_SIZE → 413, остальное → 400"

key-files:
  created:
    - app/server/src/middleware/upload.ts
  modified:
    - app/server/src/routes/docs/assets.ts
    - app/server/src/routes/users/avatar.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/services/assets/images.ts
    - app/server/src/services/assets/index.ts
    - app/server/route-inventory.txt

key-decisions:
  - "Обработчик singleFileUpload — именованная функция, в снимке инвентаря видно singleFileUpload вместо multerMiddleware"
  - "isAllowedImageMime удалён: после снятия фильтра медиатеки вызывающих нет"
  - "Окно №3 WINDOWS.md не трогал: команду waive выполняет ведущая сессия (раздел ниже)"

requirements-completed: [DEBT-01, PHOTO-03]

coverage:
  - id: D1
    description: "Медиатека и аватар отвечают на размер, тип и сломанный multipart 413/415/400 с русским текстом, хранилище при отказе пусто"
    requirement: DEBT-01
    verification:
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/routes/docs src/routes/users src/routes/route-inventory.snapshot.test.ts"
        status: pass
      - kind: other
        ref: "yarn verify"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 04: Отказы загрузки 413/415/400 из одной обёртки multer Summary

**`singleFileUpload` переводит ошибки multer и busboy в `ApiError` (413 «Файл больше 5 МБ», 400 «Не удалось прочитать файл из запроса»); медиатека и аватар сняли фильтр по `Content-Type`, тип решает сигнатура (400/415); ни один тест больше не закрепляет 500**

## Performance

- **Duration:** около 6 мин
- **Started:** 2026-10-16T11:22:00Z
- **Completed:** 2026-10-16T11:28:00Z
- **Tasks:** 2 из 2
- **Files modified:** 7 (1 новый, 6 изменённых)

## Accomplishments

- `app/server/src/middleware/upload.ts`: `UPLOAD_READ_ERROR`, `uploadTooLargeMessage(maxBytes)` («Файл больше N МБ»), `singleFileUpload({ field, maxBytes })` с `limits: { fileSize, files: 1, fields: 10, parts: 12 }`; `MulterError` `LIMIT_FILE_SIZE` → 413, любая другая ошибка из колбэка multer (прочие коды, busboy «Unexpected end of form», «Request aborted») → 400. Ошибка уходит в `next(ApiError)`, общий обработчик `app.ts` отдаёт её статус и `{ error }`.
- `routes/docs/assets.ts` и `routes/users/avatar.ts`: модульный `multer` с `fileFilter` заменён на `singleFileUpload({ field, maxBytes: 5 МБ })`; приведение `as any` у аватара ушло.
- `isAllowedImageMime` удалён из `images.ts` и `services/assets/index.ts` (вызывающих нет: `grep -rn` по `app/server/src`; индекс CodeGraph ещё показывал прежний `upload` маршрута).

## Тесты загрузки: было → стало

| Тест (`uploads.test.ts`) | Было | Стало |
| --- | --- | --- |
| `users/avatar`: текст с MIME `text/plain` | 500, текст фильтра «Недопустимый тип файла. Разрешены только изображения…» | 400 `AVATAR_TYPE_ERROR` по сигнатуре, хранилище пусто |
| `docs/assets`: текст с MIME `text/plain` | 500, «Поддерживаются только JPEG, PNG и WebP» из фильтра | 400 `IMAGE_TYPE_ERROR` по сигнатуре, хранилище пусто |
| `users/avatar`: файл больше 5 МБ | 500 «File too large» | 413 «Файл больше 5 МБ», хранилище пусто |
| `docs/assets`: файл больше 5 МБ | 500 «File too large» | 413 «Файл больше 5 МБ», хранилище пусто |
| `docs/assets`: GIF | PNG-байты с заголовком `image/gif` → 500 фильтра | настоящие GIF-байты (sharp → gif) → 415 `IMAGE_TYPE_ERROR`, хранилище пусто |
| `docs/assets`: текст с `image/png` | 400 `DOCS_FILTER_ERROR` | 400 `IMAGE_TYPE_ERROR` (тот же текст, константа из модуля) |
| сломанный multipart: тело без закрывающей границы | 500 «Unexpected end of form» | 400 `UPLOAD_READ_ERROR`, хранилище пусто, `/healthz` 200 |
| сломанный multipart: часть с пустым `name` | 500 «Field name missing» | 400 `UPLOAD_READ_ERROR`, хранилище пусто, `/healthz` 200 |
| 401 без cookie, обрыв запроса посреди загрузки, успешные загрузки | — | без изменений |

Константы `IMAGE_FILTER_ERROR` и `DOCS_FILTER_ERROR` удалены; ожидаемые тексты берутся из `middleware/upload.ts` и `services/assets/image-intake.ts`. `grep -c "assert.equal(reply.status, 500)" app/server/src/routes/uploads.test.ts` = 0.

## Разница снимка инвентаря

```
-POST /api/users/avatar  sessionRequired > multerMiddleware > <anonymous>
+POST /api/users/avatar  sessionRequired > singleFileUpload > <anonymous>
-POST /api/docs/assets  sessionRequired > requirePerm(tests.write) > multerMiddleware > <anonymous>
+POST /api/docs/assets  sessionRequired > requirePerm(tests.write) > singleFileUpload > <anonymous>
```

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: обёртка multer на медиатеке, 413** — не закоммичено
2. **Task 2: аватар, отказы по типу и сломанный multipart, снимок** — не закоммичено

## Команды для ведущей сессии

Шаг 4 плана (окно №3, A4 `MediaLibrary.tsx`, D-05) не выполнен исполнителем: правила исполнителя запрещают запись через gsd-tools, запись в `.planning/WINDOWS.md` делает ведущая сессия. Сейчас запись id 3 — `open`. Команда дословно из плана:

```bash
node "$HOME/.claude/gsd-core/bin/gsd-tools.cjs" windows waive 3 "D-05: клиент MediaLibrary в фазе 12 не переделывается; после 12-04 сервер отвечает на размер и тип русскими 413/415/400, дубли лимита 5 МБ и списка типов на клиенте исход не меняют, решает сервер"
```

## Проверки

- Tracer и набор Task 1: `uploads.test.ts` — 15 тестов, зелёные (оба маршрута на 413 сразу, временное прежнее ожидание для аватара не понадобилось).
- Набор Task 2: `uploads.test.ts`, `src/routes/docs`, `src/routes/users`, `route-inventory.snapshot.test.ts` — 11 файлов, 281 тест, зелёные.
- Typecheck сервера чистый; lint — только прежнее предупреждение `services/storage/keys.ts:8`.
- `yarn verify: OK` с первого прогона (server 2048, web 1649, exam-core 745, rbac 37).
- Критерии приёмки: `LIMIT_FILE_SIZE` в `upload.ts` — 1; `singleFileUpload` в обоих маршрутах; `fileFilter` в обоих — 0; `isAllowedImageMime` в `index.ts` — 0; `status, 500` в `uploads.test.ts` — 0; запись окна №3 — команда передана ведущей сессии.
- `codegraph affected` по `middleware/upload.ts`, `routes/docs/assets.ts`, `routes/users/avatar.ts`, `services/assets/images.ts`, `services/assets/index.ts`: 96 тестовых файлов и модулей сервера (маршруты docs, users, tests, миграционные тесты, инвентарь); все в серверном наборе `yarn verify`.

## Files Created/Modified

- `app/server/src/middleware/upload.ts` — обёртка multer (новый).
- `app/server/src/routes/docs/assets.ts`, `app/server/src/routes/users/avatar.ts` — `singleFileUpload` вместо `multer` с фильтром.
- `app/server/src/services/assets/images.ts`, `app/server/src/services/assets/index.ts` — без `isAllowedImageMime`.
- `app/server/src/routes/uploads.test.ts` — отказы 413/415/400.
- `app/server/route-inventory.txt` — имя middleware загрузки.

## Deviations from Plan

- Шаг 4 (waive окна №3) передан ведущей сессии — по прямому указанию ведущей сессии и правилам исполнителя; `.planning/WINDOWS.md` не изменён.
- `uploadTooLargeMessage` округляет N до десятых (`5 * 1024 * 1024` → «5»), чтобы дробный лимит не печатал длинную дробь.

## Issues Encountered

Нет.

## Не проверено

- Клиент `MediaLibrary.tsx` с новыми 4xx в браузере не проверялся (D-05: клиент не переделывается).

## Next Phase Readiness

- 12-07: маршрут фото берёт `singleFileUpload({ field: …, maxBytes: ANSWER_PHOTO_MAX_BYTES })` — 413 будет «Файл больше 10 МБ».
- Общий `errorHandler` в `app.ts` не менялся: новый маршрут с голым `multer` без обёртки снова дал бы 500.

## Предлагаемое сообщение коммита

`fix: Отказы загрузки медиатеки и аватара из одной обёртки multer: 413 «Файл больше 5 МБ», 400 на сломанную форму, тип по сигнатуре 400/415 вместо фильтра по Content-Type и 500`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/server/src/middleware/upload.ts
- FOUND: singleFileUpload в route-inventory.txt
- Коммиты: не закоммичено (по правилу)
