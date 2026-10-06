---
phase: 02-dependency-security
plan: 02
subsystem: testing
tags: [multer, sharp, uploads, characterization, vitest, dep-05]
status: complete
requires:
  - phase: 02-dependency-security
    provides: "02-01: характеризация MDX (отдельный файл app/web, здесь не используется напрямую)"
provides:
  - "app/server/src/test-support/http.ts: sessionCookieFor(user), startTestServer(app) для route-тестов"
  - "app/server/src/routes/uploads.test.ts: характеризация трёх multer-роутов на multer 2.0.2 и sharp 0.34.5 через настоящий app.ts"
  - "app/server/src/lib/sharp-runtime.test.ts: Sharp на Node 24 (rotate/resize/webp/png)"
  - "sha256 трёх файлов для сверки в 02-05 и 02-07"
affects: [02-05, 02-07]
tech-stack:
  added: []
  patterns:
    - "Route-тест через настоящий app.ts: временная база test_* (createScratchDatabase + migrateTestDatabase), TEST_DATABASE_URL переключается на неё, затем vi.resetModules() и динамический import('../app.js') и import('../db/index.js')"
    - "Подмена storageService частичным vi.mock: Object.create(actual.storageService) с isConfigured() -> true и uploadBuffer в массив; multer берёт memoryStorage, как в production"
    - "Тестовая сессия: JWT подписывается AUTH_CONFIG.jwtSecret, cookie AUTH_CONFIG.sessionCookieName; права requirePerm берутся из user_roles временной базы"
key-files:
  created:
    - app/server/src/test-support/http.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/lib/sharp-runtime.test.ts
  modified: []
key-decisions:
  - "На multer 2.0.2 все отказы multer (лимит, fileFilter, сломанный multipart) идут в errorHandler app.ts без .status: 500 и текст ошибки; ответ на 5 МБ + 1 байт приходит детерминированно (multer дочитывает тело), fetch не получает сброс сокета"
  - "Часть multipart с name=\"\" на multer 2.0.2 даёт MulterError MISSING_FIELD_NAME, 500 'Field name missing' (по чтению кода ожидалось 'Unexpected field'); закреплено по факту"
  - "Обрыв запроса на multer 2.0.2 не доходит до errorHandler (в логе нет 'Request error'), сервер жив; тест закрепляет только инварианты: /healthz 200, хранилище пусто, следующая загрузка успешна"
  - "Дополнительно к плану мокнут @supabase/supabase-js (шпион createClient) и последним тестом утверждается, что клиент Supabase не создавался"
requirements-completed: [DEP-05]
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 4100
  tasks: 3
  commits: 0
estimate_actuals_note: "actuals.tokens = chars/4 по трём созданным файлам (16381 байт); коммитов нет по правилу пользователя"
duration: 6min
completed: 2026-10-03
---

# Phase 2 Plan 02: характеризация загрузок multer и Sharp до апгрейда

**Route-тест `uploads.test.ts` поднимает настоящий `app.ts` на одноразовой базе `test_uploads_*` и ходит по HTTP в `POST /api/tests/:id/assets`, `POST /api/users/avatar`, `POST /api/docs/assets`. Закреплены лимит 5 МБ, MIME-фильтр, 401 без сессии, проверка сигнатуры, проход до Sharp (кроп аватара 256x256, WebP в docs), обрыв запроса и сломанный multipart на multer 2.0.2 и sharp 0.34.5. `sharp-runtime.test.ts` подтверждает Sharp на Node 24.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Файлы, готовые к коммиту

- `app/server/src/test-support/http.ts` (новый, untracked)
- `app/server/src/routes/uploads.test.ts` (новый, untracked)
- `app/server/src/lib/sharp-runtime.test.ts` (новый, untracked)

`git status --porcelain --untracked-files=all -- app/server` печатает ровно эти три строки `??`. Исходники роутов не менялись: `git status --porcelain app/server/src/routes/users app/server/src/routes/docs app/server/src/routes/tests` пусто. Файл 02-01 `app/web/lib/mdx/untrusted.test.ts` не тронут.

## Окружение прогона

- Node `v24.17.0`, multer `2.0.2`, sharp `0.34.5`.
- `sharp.versions`: `vips 8.17.3`, `webp 1.6.0`, `png 1.6.50`, `spng 0.7.4`, `mozjpeg 0826579`, `heif 1.20.2`, `cgif 0.5.0`.

## Закреплённые статусы и тексты (multer 2.0.2, sharp 0.34.5)

Ответы с ошибкой содержат ещё `requestId` (вне production); тесты утверждают только `body.error`.

| Роут (поле) | Случай | Статус | `body.error` / тело | Хранилище | Совпало с ожиданием по коду |
|---|---|---|---|---|---|
| tests/assets (`file`) | PNG 64x64 | 201 | `{ url }`, `url` = путь `topics/biology/cell/assets/<24 hex>.png` | 1 буфер, побайтно равен отправленному, `image/png` | да |
| tests/assets | `text/plain` | 500 | `Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP)` | 0 | да |
| tests/assets | 5 МБ + 1 байт | 500 | `File too large` (MulterError `LIMIT_FILE_SIZE`) | 0 | да |
| tests/assets | без cookie | 401 | `Unauthorized` | 0 | да |
| users/avatar (`avatar`) | PNG + кроп (0, 0, 32, 32, zoom 1, rotation 90) | 200 | `avatarUrl` = `https://storage.test/<путь оригинала>`, `avatarCroppedUrl` = `https://storage.test/<путь кропа>` | 2 буфера: оригинал `avatars/<userId>/<hex>.png` (`image/png`, равен отправленному) и кроп 256x256 (`image/png`); `users.avatar`, `users.avatar_cropped`, `avatar_crop_rotation = 90` записаны | да |
| users/avatar | `text/plain` | 500 | `Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP)` | 0 | да |
| users/avatar | 5 МБ + 1 байт | 500 | `File too large` | 0 | да |
| users/avatar | текст с типом `image/png` | 400 | `Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)` | 0 | да |
| users/avatar | без cookie | 401 | `Unauthorized` | 0 | да |
| docs/assets (`file`) | PNG 64x64 | 200 | `{ success: true, path: 'images/<32 hex>.webp', filename }` | 1 буфер WebP 64x64, `image/webp` | да |
| docs/assets | `text/plain` | 500 | `Поддерживаются только JPEG, PNG и WebP` | 0 | да |
| docs/assets | `image/gif` (байты PNG) | 500 | `Поддерживаются только JPEG, PNG и WebP` | 0 | да |
| docs/assets | 5 МБ + 1 байт | 500 | `File too large` | 0 | да |
| docs/assets | текст с типом `image/png` | 400 | `Поддерживаются только JPEG, PNG и WebP` | 0 | да |
| docs/assets | без cookie | 401 | `Unauthorized` | 0 | да |
| docs/assets | тело без закрывающей границы | 500 | `Unexpected end of form` (busboy) | 0 | да |
| docs/assets | часть с `name=""` | 500 | `Field name missing` (MulterError `MISSING_FIELD_NAME`) | 0 | нет: ожидалось `Unexpected field` |
| все три | обрыв: заголовки части + 64 КиБ из объявленных 3 000 000 байт, затем `req.destroy()` | — | клиент получает сброс сокета; в логе сервера нет `Request error` | 0 | инварианты: `/healthz` 200, следующая загрузка PNG даёт 201 / 200 / 200 |

Наблюдения:
- Oversize: multer 2.0.2 дочитывает тело и отвечает через errorHandler. Во всех прогонах (не меньше 10 на каждый роут, включая 6 повторов подряд и `yarn verify`) ответ всегда 500 `File too large`, сброса сокета (`fetch failed`) не было; тест утверждает ровно это.
- Обрыв: на 2.0.2 обрыв не вызывает `next(err)` в течение теста (в логе pino нет записи об ошибке ни на одном из трёх роутов). Тест этого не утверждает, только живость сервера и пустое хранилище.
- Ошибки multer и fileFilter не имеют `.status`, поэтому errorHandler `app.ts` отдаёт 500 с текстом ошибки (вне production).

## Выполнение

- Task 1 (tracer): `http.ts` и срез `tests/assets` (успех + лимит). Прогон: `Tests 3 passed (3)`. Гейт tracer: `<verify>` перезапущен 5 раз подряд, все зелёные; `yarn workspace @bio-exam/server typecheck` без ошибок. Без `TEST_DATABASE_URL` файл падает в `beforeAll` с `DB-backed test needs TEST_DATABASE_URL: run it through node scripts/with-test-db.mjs -- <command> or yarn verify` (тесты помечены skipped, файл failed), то есть не пропускается молча.
- Task 2: матрица MIME/лимит/401 по трём роутам, успешные avatar и docs через Sharp, проверка сигнатуры. Прогон: `Tests 16 passed (16)`. Проверка формы `upload matrix ok`.
- Task 3: `abortUpload` на `node:http` по трём роутам, сломанный multipart на docs/assets, `sharp-runtime.test.ts`. Итог: `Test Files 2 passed`, `Tests 25 passed (25)` (21 в `uploads.test.ts`, 4 в `sharp-runtime.test.ts`); 6 повторных прогонов зелёные, `Unhandled Error` нет.

## TDD Gate Compliance

Коммитов нет (правило пользователя); последовательность соблюдена по сути.

- RED: каждый случай Task 2 и Task 3 сначала написан с ожиданием по чтению кода и прогнан против multer 2.0.2 / sharp 0.34.5. Расхождение одно: `name=""` дал `Field name missing` вместо `Unexpected field` (тест упал с `+ 'Field name missing' - 'Unexpected field'`).
- GREEN: ожидание переведено на фактическое значение, исходники роутов не менялись.
- Проба на способность падать: во временной правке заменены `'File too large'` -> `'File too big'`, ширина кропа 256 -> 255, формат docs `webp` -> `png`; прогон дал `Tests 5 failed | 11 passed (16)` ровно на этих тестах. Файл восстановлен из резервной копии в scratchpad, sha256 копии и восстановленного файла совпали.
- REFACTOR: не требовался, кроме `yarn oxfmt` по новым файлам.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/lib/sharp-runtime.test.ts`: `Tests 25 passed (25)`.
- `yarn workspace @bio-exam/server typecheck`: код 0. `yarn workspace @bio-exam/server lint`: новых предупреждений в трёх файлах нет (остальные предупреждения в `app.ts`, `login.ts`, `public.ts`, `rbac.ts`, `storage.ts` существовали до плана).
- `yarn verify`: `yarn verify: OK`; в шаге `lint-typecheck-test` есть `src/routes/uploads.test.ts (21 tests)` и `src/lib/sharp-runtime.test.ts (4 tests)`.
- Хелпер только в тестах: `helper only in tests`.
- `app/web/public/uploads` до и после прогонов: каталога нет в обоих случаях, списки совпадают.
- Комментариев в новых файлах нет.

## Deviations from Plan

### Auto-fixed Issues

None.

Уточнения реализации, не меняющие поведение:
- Добавлен `vi.mock('@supabase/supabase-js')` со шпионом `createClient` и тест «клиент Supabase не создаётся» (подкрепляет прохибишен плана, по образцу `storage.local.test.ts`).
- `abortUpload` после записи 64 КиБ ждёт 100 мс перед `req.destroy()`, чтобы сервер успел пройти session/requirePerm и начать разбор multipart.
- Пользователь-админ вставляется с `isActive: true` (на поведение в dev-режиме сессии не влияет, ближе к живым данным).

## Known Stubs

Нет.

## Threat Flags

Нет. `sessionCookieFor` подписывает JWT дефолтным секретом только в тестах (T-2-05), импорт из production-кода проверен.

## sha256

```
c85d209681ef41c88f30182cc761facd595215f0fbe7ad4e7542cff741d044c1  app/server/src/routes/uploads.test.ts
9b753edb35292012890c354d9c995e8ce5af0cd995adfa105ff6e6790faed9fb  app/server/src/lib/sharp-runtime.test.ts
2992ec0b000e435ef21929f08dbe06f4fb9ab5f52ae2a7f96a772ac5dd2842b4  app/server/src/test-support/http.ts
```

## Self-Check: PASSED

- FOUND: `app/server/src/test-support/http.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/lib/sharp-runtime.test.ts`
- sha256 сверены проверкой Task 3 (`sha256 recorded`).
- Коммиты не проверялись: коммитов нет по правилу пользователя.
