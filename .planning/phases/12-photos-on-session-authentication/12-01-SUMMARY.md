---
phase: 12-photos-on-session-authentication
plan: 01
subsystem: api
tags: [sharp, file-type, image-intake, exif, webp, memory, adr-0004, next-rewrites]

requires:
  - phase: 11-deadline-finalisation-upload-window-and-background-jobs
    provides: окно загрузки фото (photoUploadWindow) — в этом плане не используется, нужно маршрутам 12-07
provides:
  - "Модуль приёма изображения image-intake.ts: acceptImage, createImageIntake, createSlotLimiter, detectImageType, IMAGE_PROFILES (answerPhoto, mediaLibrary, inlineImage, avatar), ImageRejectedError (400/413/415/503), константы и русские тексты отказов"
  - "Медиатека, встроенные картинки и аватар принимают изображения через acceptImage: поворот по EXIF, без метаданных, лимит 50 МП"
  - "Скрипт замера photo-memory-bench.ts (каждый случай в отдельном процессе, --series, --dir, --out)"
  - "Раздел ADR-0004 «Обработка фото и память» с настройками и замером macOS"
  - "experimental.proxyClientMaxBodySize '12mb' в app/web/next.config.ts: тело 10,5 МБ проходит rewrites next dev"
affects: [12-04, 12-07, 12-10, ADR-0004]

actuals:
  tokens: 10600
  tasks: 3
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Приём изображения — один модуль с профилями; вызывающий передаёт профиль и пишет accepted.full"
    - "Ограничитель обработки один на процесс; 503 при полной очереди только у профиля с rejectWhenBusy"
    - "Замер памяти — каждый случай в свежем дочернем процессе, пик RSS над базой процесса"

key-files:
  created:
    - app/server/src/services/assets/image-intake.ts
    - app/server/src/services/assets/image-intake.test.ts
    - app/server/src/scripts/photo-memory-bench.ts
  modified:
    - app/server/src/services/assets/images.ts
    - app/server/src/services/assets/inline-images.ts
    - app/server/src/services/assets/avatars.ts
    - app/server/src/services/assets/index.ts
    - app/server/src/routes/users/avatar.characterization.test.ts
    - app/server/src/routes/uploads.test.ts
    - docs/adr/0004-storage-port-two-adapters.md
    - app/web/next.config.ts

key-decisions:
  - "IMAGE_INTAKE_CONCURRENCY = 1: пара при concurrency 2 быстрее на 49% (JPEG 12 МП 625 мс против 1223 мс), но пик пары на WebP 48 МП 597–614 МБ и на WebP q80 48 МП 602 МБ — выше предела 200 МБ"
  - "IMAGE_INTAKE_QUEUE_LIMIT = 8: при concurrency 1 ждущие задачи держат только буферы запросов (до 80 МБ при 10 МБ), замер причин менять не дал"
  - "Допущение 2 реализовано: исходник аватара перекодируется в формате сигнатуры с поворотом и без EXIF/GPS, кроп от выпрямленного исходника"
  - "Лимит 50 МП оставлен во всех профилях; худший случай — WebP 48 МП, около 310 МБ на одну обработку (вопрос владельцу ниже)"
  - "next.config.ts изменён: через next dev тело 10,5 МБ давало 500 (Next обрезает тело на 10 МБ), с proxyClientMaxBodySize '12mb' доходит целиком"

patterns-established:
  - "Профиль ImageProfile: types (mime сигнатуры → расширение), typeMessage, heicMessage, maxPixels, output webp|source, thumb, rejectWhenBusy"
  - "Отказы приёма: нет сигнатуры 400 typeMessage; сигнатура не из профиля 415 (HEIC — heicMessage); больше лимита пикселей 413; ошибка декодирования 400 IMAGE_CORRUPT_MESSAGE; переполнение очереди 503 IMAGE_BUSY_MESSAGE"

requirements-completed: [PHOTO-03, PHOTO-04]

coverage:
  - id: D1
    description: "JPEG с Orientation 6 и 8 и GPS → вертикальный WebP без EXIF и тега ориентации, миниатюра до 400 px"
    requirement: PHOTO-03
    verification:
      - kind: unit
        ref: "app/server/src/services/assets/image-intake.test.ts#JPEG с Orientation 6 и GPS становится вертикальным WebP без EXIF и миниатюрой до 400 px"
        status: pass
      - kind: unit
        ref: "app/server/src/services/assets/image-intake.test.ts#Orientation %i с GPS выпрямляется, EXIF и тег ориентации снимаются"
        status: pass
    human_judgment: false
  - id: D2
    description: "Таблица отказов: текст 400, GIF/HEIC/AVIF 415 (HEIC со своим текстом), PNG 8000×7000 413, битый JPEG 400"
    requirement: PHOTO-03
    verification:
      - kind: unit
        ref: "app/server/src/services/assets/image-intake.test.ts#$name: отказ $status"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ограничитель: одна задача одновременно, 503 при полной очереди только с rejectWhenBusy, FIFO"
    requirement: PHOTO-04
    verification:
      - kind: unit
        ref: "app/server/src/services/assets/image-intake.test.ts#createSlotLimiter"
        status: pass
    human_judgment: false
  - id: D4
    description: "Медиатека, встроенные картинки и аватар идут через acceptImage, HTTP-характеризация зелёная, исходник аватара без EXIF"
    requirement: PHOTO-03
    verification:
      - kind: integration
        ref: "app/server/src/routes/users/avatar.characterization.test.ts#JPEG с Orientation 6 и GPS: исходник в хранилище вертикальный и без EXIF"
        status: pass
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/routes/docs src/routes/users/avatar.characterization.test.ts src/services/assets src/services/question-content"
        status: pass
    human_judgment: false
  - id: D5
    description: "Замер памяти на macOS и запись настроек в ADR-0004"
    requirement: PHOTO-04
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/server tsx src/scripts/photo-memory-bench.ts"
        status: pass
    human_judgment: true
    rationale: "Замер на Linux-образе API, реальные снимки, читаемость тетрадной страницы и лимит памяти контейнера — шаги пользователя (12-10)"

duration: 20min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 01: Модуль приёма изображения и замер памяти Summary

**Одно правило приёма изображения `acceptImage` с четырьмя профилями (тип по сигнатуре, лимит 50 МП по заголовку, `autoOrient`, WebP без метаданных, миниатюра, ограничитель 1/8 с 503 только у фото ответа); медиатека, встроенные картинки и аватар переведены на него; замер пика RSS записан в ADR-0004**

## Performance

- **Duration:** около 20 мин
- **Started:** 2026-10-16T10:53:00Z
- **Completed:** 2026-10-16T11:12:00Z
- **Tasks:** 3 из 3
- **Files modified:** 11 (3 новых, 8 изменённых)

## Accomplishments

- `app/server/src/services/assets/image-intake.ts`: `acceptImage`, `createImageIntake`, `createSlotLimiter`, `detectImageType`, `IMAGE_PROFILES`, `ImageRejectedError`, константы `IMAGE_MAX_PIXELS = 50_000_000`, `IMAGE_INTAKE_CONCURRENCY = 1`, `IMAGE_INTAKE_QUEUE_LIMIT = 8`, тексты отказов дословно из плана. `sharp.cache(false)` и `sharp.concurrency(1)` при загрузке модуля.
- Медиатека (`uploadImage`), встроенные картинки (`storeImage` внутри `storeInlineImages`) и аватар (`saveAvatar`) вызывают `acceptImage` со своим профилем; локальные списки типов, `MAX_DIMENSION`, `WEBP_QUALITY`, `AVATAR_TYPES` и прямые вызовы `fileTypeFromBuffer` удалены. `fileTypeFromBuffer` в не-тестовом коде сервера остался только в `image-intake.ts`.
- Скрипт `app/server/src/scripts/photo-memory-bench.ts` и раздел ADR-0004 «Обработка фото и память».
- Тело 10,5 МБ проходит rewrites `next dev` после `experimental.proxyClientMaxBodySize: '12mb'`.

## Task Commits

Не закоммичено (правило пользователя: коммитит ведущая сессия). Все изменения лежат в рабочем дереве worktree.

1. **Task 1: acceptImage для фото ответа** — не закоммичено
2. **Task 2: отказы, ограничитель, замер, 10 МБ через Next, ADR-0004** — не закоммичено
3. **Task 3: медиатека, встроенные картинки и аватар через acceptImage** — не закоммичено

## Замер памяти (macOS arm64, Node 24.17.0, sharp 0.35.5, libvips 8.18.7)

Команда: `yarn workspace @bio-exam/server tsx src/scripts/photo-memory-bench.ts` (серия 30). Профиль answerPhoto, каждый случай в отдельном процессе, пик RSS — прирост над базой процесса. Пик МБ / время мс.

| Вход | Файл, МБ | 1 обработка | 2 подряд (concurrency 1) | 2 одновременно (concurrency 2) |
| --- | --- | --- | --- | --- |
| JPEG 4,9 МП (2560×1920, как шлёт клиент) | 3,1 | 87 / 603 | 114 / 1125 | 193 / 577 |
| JPEG 12 МП, Orientation 6 и 8 | 7,5 | 84 / 615 | 104 / 1223 | 182–186 / 625 |
| JPEG 48 МП, Orientation 6 и 8 | 30,1 | 69 / 698 | 89 / 1385 | 149–151 / 705 |
| PNG 24 МП однотонный, Orientation 6 и 8 | 0,3 | 59 / 252 | 79 / 500 | 134 / 258 |
| PNG 48 МП однотонный, Orientation 6 и 8 | 0,6 | 74–75 / 394 | 95–96 / 785 | 165–166 / 408 |
| PNG 49 МП однотонный | 0,6 | 63 / 228 | 91 / 453 | 149 / 238 |
| WebP lossless 48 МП однотонный, Orientation 6 и 8 | 0,003 | 308 / 338 | 308 / 649 | 597–614 / 350 |
| WebP q80 48 МП с шумом, Orientation 6 | 23,2 | 276 / 1472 | 312 / 2852 | 602 / 1455 |
| PNG 64 МП однотонный | 0,8 | отказ 413 по заголовку, 0,7 МБ / 2 мс | — | — |

Серия 30 обработок JPEG 12 МП при concurrency 1: RSS процесса 194–255 МБ, после 30-й 217 МБ, без роста ступенькой; среднее 612 мс, около 98 фото в минуту. Первый прогон той же серии: 186–232 МБ.

**Выбор:** `IMAGE_INTAKE_CONCURRENCY = 1` — выигрыш пары по времени 49% (условие «не меньше 30%» выполнено), но пик пары на WebP 48 МП 597–614 МБ и на WebP q80 48 МП 602 МБ, выше 200 МБ. `IMAGE_INTAKE_QUEUE_LIMIT = 8` — при concurrency 1 ждущая задача добавляет только свой буфер (вторая подряд +20 МБ к пику), восемь буферов по 10 МБ — 80 МБ.

## Тело 10 МБ через Next (режим `next dev`)

Эхо-сервер Node на свободном порту, `API_ORIGIN=http://127.0.0.1:<порт эха> yarn workspace @bio-exam/web dev -p <порт>`, `PUT /api/echo` с multipart-телом через `fetch` (не `curl`). `.env` не понадобился.

| Файл | Тело запроса, байт | До правки | После `proxyClientMaxBodySize: '12mb'` |
| --- | --- | --- | --- |
| 9,5 МиБ (9 961 472 байт) | 9 961 643 | 200, эхо приняло 9 961 643 | 200, эхо приняло 9 961 643 |
| 10,5 МиБ (11 010 048 байт) | 11 010 219 | 500, лог Next: «Request body exceeded 10MB for /api/echo. Only the first 10MB will be available unless configured», затем «Failed to proxy … socket hang up» | 200, эхо приняло 11 010 219 |

`next.config.ts` изменён (ключ в `experimental`, проверено по `node_modules/next/dist/server/config-schema.js` Next 16.3.8). Прод идёт мимо Next, правка касается dev и e2e. Процессы `next dev` и эхо остановлены (группа процесса), фоновых процессов нет.

## CodeGraph

`codegraph impact` до правок:
- `saveAvatar` — 5 символов: `avatars.ts` `saveAvatar:143`; `routes/users/avatar.ts` (маршрут `POST /api/users/avatar:58`); `routes/users/index.ts`; `services/assets/index.ts`.
- `uploadImage` — 7 символов: `images.ts` `uploadImage:60`; `routes/docs/assets.ts` (`POST /api/docs/assets:60`); `routes/index.ts`; `routes/tests/admin/assets.ts` (`POST /:id/assets:39`); `services/assets/index.ts`.
- `storeInlineImages` — 11 символов: `inline-images.ts` (`storeInlineImages:45`, `withStoredInlineImages:68`); `services/question-content/inline-images.ts` (`moveInlineImages:49`); `scripts/inline-images.ts` (`main:27`); `services/question-content/index.ts`; `services/question-content/write.ts` (`createTestWithQuestions:402`, `createQuestion:328`, `updateQuestion:236`).

`codegraph affected` по `image-intake.ts`, `images.ts`, `inline-images.ts`, `avatars.ts`, `index.ts` сервиса: 91 тестовый файл и модуль сервера (маршруты docs, users, tests, миграционные тесты, инвентарь маршрутов); все они в серверном наборе `yarn verify`, который прошёл.

## Проверки

- Характеризация до правок: `src/routes/uploads.test.ts src/routes/docs src/routes/users/avatar.characterization.test.ts` — 4 файла, 123 теста, зелёные. После: 4 файла, 124 теста (новый тест аватара с Orientation 6 и GPS), зелёные.
- `image-intake.test.ts`: 14 тестов, зелёные.
- Набор Task 3 (`uploads`, `docs`, `avatar.characterization`, `services/assets`, `services/question-content`): 17 файлов, 304 теста, зелёные.
- `yarn workspace @bio-exam/server tsx src/scripts/photo-memory-bench.ts --series 5` и полный прогон (серия 30): код 0, все ожидаемые исходы совпали.
- `yarn workspace @bio-exam/server typecheck` — чисто; `lint` — только прежнее предупреждение `services/storage/keys.ts:8` (no-control-regex).
- `yarn verify: OK` (server 2059 тестов, web 1649, exam-core 745, rbac 37), с первого прогона.
- Критерии приёмки по `grep` выполнены: `autoOrient`, `cache(false)`, четыре экспорта, `IMAGE_PROFILES.mediaLibrary|inlineImage|avatar` в вызывающих, `fileTypeFromBuffer` только в `image-intake.ts`, «Обработка фото и память» и `photo-memory-bench` в ADR-0004, четыре текста отказов в тесте.

## TDD Gate Compliance

RED не получен: модуль Task 1 собран сразу по `<interfaces>` плана целиком (отказы, ограничитель, профили), поэтому случаи `<behavior>` Task 2, написанные до следующих правок `image-intake.ts`, прошли с первого прогона (14 из 14). Правок модуля по итогам тестов Task 2 не понадобилось.

## Files Created/Modified

- `app/server/src/services/assets/image-intake.ts` — модуль приёма изображения (новый).
- `app/server/src/services/assets/image-intake.test.ts` — поворот 6 и 8, таблица отказов, профили медиатеки и аватара, ограничитель (новый).
- `app/server/src/scripts/photo-memory-bench.ts` — замер пика RSS (новый).
- `app/server/src/services/assets/images.ts` — `uploadImage` через профиль `mediaLibrary`, реэкспорт `IMAGE_TYPE_ERROR`, `isAllowedImageMime` берёт список из профиля.
- `app/server/src/services/assets/inline-images.ts` — `storeImage` через профиль `inlineImage`, `ImageRejectedError` → `null`.
- `app/server/src/services/assets/avatars.ts` — `saveAvatar` через профиль `avatar`, ключ с `accepted.ext`, запись и кроп от `accepted.full`, реэкспорт `AVATAR_TYPE_ERROR`.
- `app/server/src/services/assets/index.ts` — экспорт `acceptImage`, `IMAGE_PROFILES`, `ImageRejectedError`, типов `AcceptedImage`, `ImageProfile`.
- `app/server/src/routes/users/avatar.characterization.test.ts` — исходник «PNG 64×64 без EXIF» вместо побайтового равенства; новый тест JPEG Orientation 6 + GPS.
- `app/server/src/routes/uploads.test.ts` — исходник аватара ищется по ключу без `_cropped`.
- `docs/adr/0004-storage-port-two-adapters.md` — раздел «Обработка фото и память».
- `app/web/next.config.ts` — `experimental.proxyClientMaxBodySize: '12mb'`.

## Decisions Made

См. `key-decisions`. Кратко: concurrency 1 и очередь 8 по замеру; допущение 2 (перекодирование аватара) и лимит 50 МП во всех профилях — как в плане; правка `next.config.ts` понадобилась.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Замер в одном процессе занижает пик WebP**
- **Found during:** Task 2 (замер)
- **Issue:** первая обработка WebP 48 МП в процессе показывает около 105 МБ, а каждая следующая (и любая после `metadata()`, как в `acceptImage`) — 288–310 МБ. Оценка devils-advocate «WebP 48 МП +72…77 МБ» получена первым декодированием и занижена.
- **Fix:** скрипт запускает каждый случай в отдельном дочернем процессе с входом, прочитанным из файла; меряется путь `acceptImage` целиком (сигнатура, заголовок, обработка, миниатюра).
- **Files modified:** `app/server/src/scripts/photo-memory-bench.ts`

**2. [Rule 3 - Blocking] Тело больше 10 МБ не проходит next dev**
- **Found during:** Task 2 шаг 4
- **Issue:** 10,5 МиБ через rewrites — 500 (обрезка на 10 МБ).
- **Fix:** `experimental.proxyClientMaxBodySize: '12mb'`, повторная проверка — 200 и все байты (как предусматривал план).
- **Files modified:** `app/web/next.config.ts`

**3. Мелкие уточнения сверх плана**
- В бенч добавлены строки «JPEG 4,9 МП как шлёт клиент» (для числа фото в минуту на реальном входе) и «WebP q80 48 МП» (lossy WebP тоже декодируется целиком).
- Миниатюра строится с `withoutEnlargement: true` (маленькое фото не растягивается до 400 px).
- HEIC-ветка узнаёт ещё `image/heic-sequence` и `image/heif-sequence`.
- `next dev` при запуске создал неотслеживаемые `app/web/AGENTS.md` и `app/web/CLAUDE.md`; удалены `rm`, к плану не относятся.

---

**Total deviations:** 2 исправления (Rule 1, Rule 3) и мелкие уточнения.
**Impact on plan:** цель и решения CONTEXT не менялись.

## Изменения поведения по HTTP (ожидаемые, в рамках плана)

- Медиатека и аватар: распознанная, но не разрешённая сигнатура (GIF в медиатеку, AVIF, HEIC) теперь 415 с прежним текстом профиля вместо 400; нет сигнатуры — по-прежнему 400 с прежним текстом.
- Повреждённый файл с верной сигнатурой — 400 `IMAGE_CORRUPT_MESSAGE` (раньше у медиатеки это была ошибка sharp без статуса `ApiError`, а аватар записывал исходник, не декодируя его).
- Изображение больше 50 МП — 413 `IMAGE_TOO_LARGE_MESSAGE` во всех профилях.
- Медиатека и встроенные картинки поворачивают фото по EXIF; исходник аватара перекодируется без EXIF/GPS.

## Issues Encountered

- Худший случай памяти — WebP 48 МП: около 310 МБ на одну обработку при concurrency 1 (файл lossless однотонного 48 МП весит 2,6 КБ, проходит лимит размера). Лимит 50 МП по плану не менялся. **Вопрос владельцу (для 12-10 или решения после замера на Linux):** отдельный меньший лимит пикселей для WebP (PNG 24 МП — 59 МБ) или WebP не принимать у фото ответа (клиент всегда шлёт JPEG).
- Журнал «разбитых окон» (`gsd_run windows append`) не заполнялся: правила исполнителя запрещают запускать gsd-tools для записи; запись — за ведущей сессией, если нужна.

## Не проверено

- Замер на Linux-образе API (`node dist/scripts/photo-memory-bench.js` в контейнере с лимитом памяти API), серия на glibc, реальные снимки (`--dir`, `--out`), читаемость тетрадной страницы при 2560 px, HEIC в Safari — шаги пользователя (12-10).
- Через `next start` тело не проверялось (мерил `next dev`).

## User Setup Required

Нет. Шаги пользователя фазы собираются в 12-10.

## Next Phase Readiness

- 12-04 (обёртка multer): `ImageRejectedError` наследует `ApiError` со `statusCode` 400/413/415/503; `isAllowedImageMime` ещё используется фильтром `routes/docs/assets.ts` и берёт список из `IMAGE_PROFILES.mediaLibrary.types`.
- 12-07 (маршруты фото): `acceptImage(buffer, IMAGE_PROFILES.answerPhoto)` отдаёт `full`, `thumb` (WebP), `width`, `height`; 503 `IMAGE_BUSY_MESSAGE` приходит из ограничителя — `Retry-After` ставит маршрут.
- Лимит 10 МБ для фото ответа в ADR-0004 записан как настройка; в коде его ставит маршрут/обёртка multer (12-04, 12-07).

## Предлагаемое сообщение коммита

`feat: Приём изображений одним модулем: тип по сигнатуре, лимит 50 МП, поворот по EXIF и WebP без метаданных для фото ответа, медиатеки, встроенных картинок и аватара; замер памяти sharp в ADR-0004, тело до 12 МБ через next dev`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/server/src/services/assets/image-intake.ts
- FOUND: app/server/src/services/assets/image-intake.test.ts
- FOUND: app/server/src/scripts/photo-memory-bench.ts
- FOUND: раздел «Обработка фото и память» в docs/adr/0004-storage-port-two-adapters.md
- Коммиты: не закоммичено (по правилу), проверка хэшей не применяется
