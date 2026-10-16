# Phase 12: Photos on session authentication - Research

**Researched:** 2026-10-13
**Domain:** приём и обработка изображений на Express (multer 2.4, sharp 0.35.5, file-type 22), хранилище с правилом доступа по пространствам, идемпотентная загрузка с клиента (canvas, повторы), раздача с проверкой владельца и проверяющего
**Confidence:** HIGH по коду репозитория, sharp и multer (прочитано и проверено запуском); MEDIUM по памяти (синтетические замеры на macOS, не Linux-контейнер); LOW по поведению реальных телефонов (не измерялось, это фазы 13 и 17)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Архитектура вокруг фазы (ARCH-REVIEW)
- **D-01 (решение пользователя):** Правило приёма изображения собирается в одном серверном модуле (тип по сигнатуре, лимит пикселей, поворот, WebP, очистка метаданных, константы). Отдельный план, до планов маршрутов и фото; через него идут фото ответов и медиатека, аватар. См. `12-ARCH-REVIEW.md` A1.
- **D-02 (решение пользователя):** Отказы multer (размер, тип, обрыв формы) приводятся к 413/415/400 в одном месте; тесты, закрепляющие 500 (`routes/uploads.test.ts:163,170,298,396,411`), переписываются на 4xx. A2, DEBT-01.
- **D-03 (решение пользователя):** Правило «кто читает какое пространство хранилища» (`images/`, `avatars/`, `topics/`, `answers/`) собирается в одном месте, ADR-0004 фиксирует его (DEBT-07). `answers/` не попадает в `isServableImageKey` и общий прокси; `storageUrl` для него не строит ссылку на прокси. A3.
- **D-04 (решение пользователя):** Мёртвый маршрут `POST /api/tests/:id/assets` (`routes/tests/admin/assets.ts`) удаляется в этой фазе после сверки с `route-inventory.snapshot.test.ts` и ADR; его тесты и снимок инвентаря обновляются. A5.
- **D-05 (рекомендация, отложено):** Клиент `MediaLibrary.tsx` (дубли лимита 5 МБ и списка MIME) и `lib/http/errors.ts` не переделываются; новый компонент фото берёт текст отказа из 4xx-ответа сервера. A4 лежит в журнале «разбитых окон».

#### Хранение и привязка
- **D-06 (решение пользователя):** Фото принадлежит сессии и вопросу: строка и ключ `answers/{sessionId}/{questionId}/{photoId}/{full,thumb}.webp`; при сдаче (фаза 14) строка получает `attempt_id`, файл не переезжает. Это уточняет исследование (оно предлагало `attemptId`): попытка есть только после сдачи, а `photoUploadWindow` принимает `sessionId`.
- **D-07 [авто]:** `photoId` — UUID, создаёт клиент; загрузка идемпотентна (`PUT .../photos/:photoId`), повтор того же `photoId` возвращает существующую строку и не плодит дубль. Лимит 5 фото на ответ проверяется в той же транзакции, что вставка, с блокировкой строки ответа/сессии.
- **D-08 [авто]:** Время загрузки ставит сервер (`uploaded_at default now()`), не EXIF и не клиент.
- **D-09 (решение пользователя):** Удаление фото учеником (пока окно открыто) — сразу удалить строку и оба файла. Сначала проверка окна `photoUploadWindow`, после закрытия убрать нельзя.
- **D-10 [авто]:** Окно проверяется одной функцией `photoUploadWindow` + `uploadWindowRefusal` (фаза 11, D-09) на загрузке и удалении; отказ 422 с кодами `UPLOAD_WINDOW_CLOSED` / `UPLOAD_WINDOW_NONE`, фото не сохраняется.

#### Обработка и память
- **D-11 [авто]:** Стартовые числа (подтверждает или меняет первый план-замер): файл до 10 МБ, лимит пикселей около 50 МП, поворот по EXIF, длинная сторона 2560 px, WebP q82, миниатюра 400 px q75, sharp без кэша (`cache(false)`), один семафор на процесс (1 или 2 по замеру), результат записать в ADR/документ с замером (критерий 5).
- **D-12 (решение пользователя):** HEIC на сервере не принимается: 415 с понятным текстом. `heic-decode` не добавляется. Пересмотр — если замер на реальных фото или логи покажут HEIC.
- **D-13 (решение пользователя):** Фото выше лимита пикселей отклоняется 413 «слишком большое изображение»; shrink-on-load не используется (клиент уже уменьшает до 2560 px).
- **D-14 [авто]:** Тип определяется по сигнатуре буфера (`fileTypeFromBuffer`), заголовку `Content-Type` не верим; разрешены JPEG, PNG, WebP; неверная сигнатура 400, неподдерживаемый тип 415, слишком большой 413; тексты сообщений русские и читаемые.
- **D-15 [авто]:** Первый план — измерительный спайк: пик памяти sharp на 12 и 48 МП (Orientation 6 и 8, concurrency 1 и 2), читаемость тетрадной страницы при 2560 px, файл до 10 МБ через Next rewrites в `yarn dev`, решение по HEIC на реальных образцах пользователя.

#### Раздача и доступ
- **D-16 (ROADMAP):** Фото отдаёт отдельный маршрут, не общий прокси `/api/docs/assets/proxy`; `Cache-Control: private, no-store` (исследование предлагало immutable, критерий 3 важнее); `X-Content-Type-Options: nosniff`; чужой запрос получает тот же ответ, что и для несуществующего файла.
- **D-17 (решение пользователя):** До сдачи фото видит только владелец. Проверяющие (`canReviewAttempt`, шов `services/access-policy/`) получают доступ после сдачи, когда есть попытка; правила доступа без попытки не вводятся.

#### Клиент
- **D-18 [авто]:** Общий компонент фото (выбор файла, уменьшение в браузере `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas → JPEG q0.8, длинная сторона 2560 px, отправка по одному, счётчик «N из 5», удаление) готовится так, чтобы фаза 13 добавила «Сделать фото» (`capture`) и «Выбрать из галереи» без переделки; в `accept` писать `image/*`, не `image/heic`.
- **D-19 (решение пользователя):** Блок фото в раннере показывается только для вопроса открытого типа из сида и e2e; тип `open` для авторов остаётся скрытым до фазы 17, dev-флага нет.
- **D-20 (решение пользователя):** Сбойная загрузка повторяется сама три раза с нарастающей паузой тем же `photoId`, затем остаётся кнопка «Повторить»; шестое фото отклоняется понятным сообщением; отказ окна показывает текст сервера.

### Claude's Discretion
- Имена файлов и модулей, форма таблицы фото (поля сверх `session_id`, `question_id`, `photo_id`, `attempt_id` NULL, `uploaded_at`, `expires_at`), номер миграции — решает планировщик, учитывая правило ADR-0003 и то, что применённые миграции не правятся.
- Размер миниатюры и точное качество WebP — по результатам спайка.

### Deferred Ideas (OUT OF SCOPE)
- Переделка `MediaLibrary.tsx` под тексты 4xx (A4) — позже, в журнале «разбитых окон».
- Поддержка HEIC на сервере (`heic-decode`) — только если замер или логи покажут потребность.
- Модерация содержимого фото — MODX-01, не v3.0.
- Срок хранения и очистка сирот — фаза 16; QR и телефон — фаза 13.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHOTO-01 | Ученик добавляет фото с компьютера выбором файла; на телефоне «Сделать фото» и «Выбрать из галереи» | Компонент фото с `<input type="file" accept="image/*" multiple>`; кнопки камеры и галереи — те же входы с `capture` и без, их включает фаза 13 (D-18). Раздел «Клиент: конвейер и очередь» |
| PHOTO-02 | Уменьшение в браузере, отправка по одному с повторами, повтор не создаёт дубль | `createImageBitmap` → canvas → `toBlob('image/jpeg', 0.8)`; очередь-фабрика без React со швами таймера; `PUT …/photos/:photoId` с клиентским UUID; сервер: быстрый путь «строка уже есть» + уникальный ключ. Паттерны 4 и 6 |
| PHOTO-03 | JPEG/PNG/WebP, тип по сигнатуре, поворот, без метаданных, WebP и миниатюра, 4xx с текстом | Модуль приёма изображения: `fileTypeFromBuffer` → проверка размеров по `metadata()` → `autoOrient().resize().webp()`; метаданные sharp удаляет по умолчанию (проверено запуском). Паттерны 1 и 2 |
| PHOTO-04 | Обработка ограничена: лимит пикселей, параллельность, без кэша | `sharp.cache(false)`, `sharp.concurrency(1)`, `limitInputPixels`, семафор на процесс с пределом очереди; предварительный замер в разделе «Память» |
| PHOTO-05 | Фото видят только владелец и разрешённые проверяющие, `private, no-store`, чужому — как отсутствующему, мимо общего прокси | Таблица читателей пространств в `services/storage/keys.ts`; отдельный маршрут раздачи; функция шва `canReadAnswerPhoto` в `scope.ts` через сессию → `attempt_id` → `canReviewAttempt`. Паттерн 3 и 5 |
| PHOTO-06 | Ученик удаляет фото, пока окно открыто, видит «N из 5» | `DELETE …/photos/:photoId` с проверкой окна под блокировкой сессии, удаление строки, затем файлов; счётчик из ответа списка/загрузки и константы exam-core |
| DEBT-01 | Старые маршруты загрузки отдают 413/415/400 вместо 500 | Одна обёртка multer, переводящая `MulterError` и ошибки busboy в 4xx; модуль приёма бросает типизированные отказы; переписать тесты `uploads.test.ts`. Паттерн 2 |
| DEBT-07 | ADR-0004 записывает, кто читает `images/` и `answers/` | Раздел ADR-0004 «Кто читает пространство» с той же таблицей, что в коде. Паттерн 3 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

- Навигация по коду через CodeGraph (`codegraph explore`, `codegraph impact <symbol>` перед правкой символа, `codegraph affected` для выбора тестов) [CITED: AGENTS.md].
- Перед правкой области читать навык: `bio-exam-api` (маршруты, доступ, попытка, хранилище), `bio-exam-data` (схема и миграции), `bio-exam-web` (раннер, запросы) [CITED: AGENTS.md, раздел Routing].
- Работа с базой только против одноразовой `test_*` на `localhost`/`127.0.0.1` с `BIO_EXAM_ISOLATED_ENV=1` (`node scripts/with-test-db.mjs <команда>`); `DATABASE_URL` из `.env` не использовать [CITED: AGENTS.md].
- Применённую миграцию в `app/server/drizzle/` не править, только новая; запись в `migrations-manifest.json` [CITED: AGENTS.md; навык bio-exam-data].
- Новый ключ окружения, который читает код, добавляется в `app/server/.env.example` с заполнителем, иначе падает `check-env-contract` [CITED: AGENTS.md]. Рекомендация: числа обработки фото держать константами в коде, а не env, чтобы не трогать контракт.
- Документы и комментарии в `.env.example` по-русски; команда `yarn …` в доке должна существовать [CITED: AGENTS.md].
- `yarn verify` зелёный — условие готовности; прогон с нулём тестов считается провалом [CITED: AGENTS.md].
- Форматирование отдельным коммитом [CITED: AGENTS.md].
- Глобальные правила пользователя: GSD не коммитит; комментарии в коде не писать; ответы и документы по-русски; минимальное решение без лишних обёрток; для UI брать готовые компоненты (shadcn из `app/web/components/ui`); «готово» для UI — после проверки в браузере [CITED: ~/.claude/CLAUDE.md].
- Навык bio-exam-api: доступ к объекту решают только функции `services/access-policy/scope.ts`, новая проверка объекта добавляется туда; `routes/tests/**` не импортирует `services/storage`; маршруты не собирают литералы ключей `topics/` и `avatars/` [CITED: .agents/skills/bio-exam-api/SKILL.md].
- Навык bio-exam-web: запросы только через `app/web/lib/http/request.ts`; логика — в фабрике без React со швами (`now`, `setTimer`, `clearTimer`), Vitest в environment `node`, только `*.test.ts` [CITED: .agents/skills/bio-exam-web/SKILL.md].

## Summary

Фаза не требует новых пакетов: `sharp` 0.35.5, `multer` 2.4.0, `file-type` 22.0.0 уже стоят и делают всё нужное [VERIFIED: node_modules/*/package.json, запуск]. Работа распадается на три слоя. Сначала долг вокруг (D-01…D-04): один модуль приёма изображения вместо трёх копий в `services/assets/*`, одна обёртка multer, превращающая отказы в 413/415/400, таблица «кто читает пространство» в `services/storage/keys.ts` с записью в ADR-0004 и удаление мёртвого `POST /api/tests/:id/assets`. Затем сервер фото: миграция таблицы, сервис `answer-photos` (он один вызывает `storage()`), маршруты загрузки, списка, удаления и раздачи, функция шва доступа. В конце клиент: чистая очередь загрузки с повторами, уменьшение через canvas и блок фото в раннере для вопроса `open`.

Главные неочевидные факты. (1) sharp по умолчанию удаляет все метаданные, но без `autoOrient()` пиксели не поворачивает; проверено запуском: JPEG 800x400 с Orientation 6 и GPS даёт WebP 400x800 без EXIF, ICC и XMP. (2) Тексты ошибок multer и busboy английские («File too large», «Unexpected end of form», «Field name missing»), а клиентский `readApiError` показывает только кириллический `error` — значит, перевод в русские 4xx обязателен на сервере. (3) Удаление `routes/tests/admin/assets.ts` ломает три охранных теста сразу: `tests-router-composition.test.mjs` требует не меньше 12 суброутеров (их ровно 12), `teacher-zone-guards.test.mjs` и `storage-no-private-access.test.mjs` перечисляют файл и маршрут явно. (4) Доступ проверяющего надо строить через `test_sessions.attempt_id`, а не через `attempt_id` строки фото: строку свяжет с попыткой только фаза 14, а фото, загруженные до сдачи, проверяющий должен видеть сразу после неё. (5) Тип `open` засеян неактивным, поэтому проверка «вопрос открытый» должна брать карту типов с `includeInactive: true`, как `draftAnswerRule`.

Предварительный замер на этой машине (macOS arm64, синтетика): одна обработка 12 МП или 48 МП JPEG с Orientation 6 до 2560 px WebP q82 и миниатюры даёт прирост RSS около 90 МБ, две параллельно — около 185 МБ; PNG 49 МП — 65 МБ при одном потоке libvips. 48 МП JPEG дешёвый потому, что libjpeg сам декодирует в уменьшенном масштабе при сжатии вдвое и больше. Это не заменяет спайк D-15 на Linux-образе и реальных снимках, но показывает, что 768 МБ контейнера хватает при семафоре 1–2 и пределе очереди.

**Primary recommendation:** восемь планов в порядке «спайк → модуль приёма и обёртка multer → правило пространств и удаление мёртвого маршрута → контракт и миграция → сервис и маршруты фото → клиентская очередь и блок в раннере → e2e и запись замера»; весь код обработки изображения и все вызовы `storage()` для фото живут в сервисах, маршруты только переводят исходы в HTTP.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Выбор файла, уменьшение до 2560 px, первичное снятие EXIF | Browser / Client | — | Экономит трафик и память сервера; canvas перекодирует и теряет метаданные |
| Повторы с паузой, идемпотентный `photoId`, счётчик «N из 5» | Browser / Client | API (лимит истины) | Клиент ведёт очередь, сервер решает лимит и дубли |
| Тип по сигнатуре, лимит пикселей, поворот, WebP, миниатюра, очистка метаданных | API / Backend | — | Клиенту доверять нельзя (запросы шлёт не только наш клиент) |
| Перевод отказов multer в 413/415/400 | API / Backend | — | Один middleware до обработчиков |
| Окно загрузки, лимит 5, идемпотентность | API / Backend | Database (блокировка `FOR UPDATE`, уникальный ключ, `clock_timestamp()`) | Время и счёт — по базе, как в фазе 11 |
| Хранение `answers/…` | Database / Storage | API (сервис `answer-photos`) | Порт хранилища, ADR-0004 |
| Доступ владелец/проверяющий, одинаковый 404 | API / Backend | — | ADR-0001: Express владеет политикой доступа; шов `scope.ts` |
| Раздача байтов с `private, no-store`, `nosniff`, CORP | API / Backend | CDN/Caddy (не кэширует) | Отдельный маршрут, не общий прокси |
| Проксирование `/api/*` | Frontend Server (Next rewrites в dev/e2e) | Caddy в проде (`/api/*` → `api:4000`) | В проде Next в цепочке загрузки не участвует [CITED: ~/.claude/servers/bio-exam.md] |

## Standard Stack

### Core (уже в зависимостях, новых нет)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | 0.35.5 (libvips 8.18.7) | `autoOrient`, `resize`, `webp`, `metadata`, `limitInputPixels`, `cache`, `concurrency` | Уже используется в `services/assets/*`; метаданные удаляет по умолчанию [VERIFIED: node_modules/sharp/package.json, `sharp.versions`, lib/index.d.ts:751] |
| multer | 2.4.0 | Приём одного файла `memoryStorage`, лимиты `fileSize`, `files`, `parts`, `fields` | Уже на трёх маршрутах; ошибки с `code` [VERIFIED: node_modules/multer/package.json, lib/multer-error.js] |
| file-type | 22.0.0 | `fileTypeFromBuffer` — тип по сигнатуре | Уже в `images.ts`, `avatars.ts`, `inline-images.ts`; текст → `undefined`, GIF → `image/gif`, AVIF → `image/avif` (проверено запуском) |
| zod | ^3.24.3 | Схемы ответов фото в `@bio-exam/exam-core` | Контракт HTTP по ADR-0002 |
| Vitest | 5.0.3 | Тесты server и web | Конфиги `app/server/vitest.config.ts`, `app/web/vitest.config.ts` |
| Playwright | в репозитории (`e2e/playwright.config.ts`) | e2e блока фото: `setInputFiles` | `yarn e2e` |

### Supporting (платформа, без пакетов)

| Средство | Назначение | Когда |
|----------|-----------|-------|
| `createImageBitmap(file, { imageOrientation: 'from-image' })` | Декодирование с учётом EXIF-ориентации | Клиентское уменьшение (`from-image` — значение по умолчанию) [CITED: developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap] |
| `HTMLCanvasElement.toBlob('image/jpeg', 0.8)` | Перекодирование без метаданных | Клиентское уменьшение |
| `crypto.randomUUID()` | `photoId` на клиенте | Идемпотентность |
| Промис-семафор в коде (около 20 строк) | Ограничение параллельных обработок sharp | Сервер, модуль приёма |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Свой промис-семафор | `p-limit` | Лишняя зависимость ради 20 строк; предел очереди всё равно писать самим |
| multipart + multer | Сырой `PUT` с `Content-Type: image/jpeg` и `express.raw({ limit })` | Меньше разбора, но расходится с остальными маршрутами загрузки и с D-02 «в одном месте»; оставить multer |
| `heic-decode` | — | Отклонено D-12 |
| `compressorjs` на клиенте | Нативный canvas | Брать только если на телефонах canvas даст сбои (фазы 13/17) |

**Installation:** не требуется.

**Version verification:** версии взяты из установленных пакетов (`node_modules/<pkg>/package.json`) и `sharp.versions` на этой машине; `npm view` не запускался, потому что фаза ничего не ставит.

## Package Legitimacy Audit

Фаза не устанавливает внешних пакетов: `sharp`, `multer`, `file-type`, `zod` уже в `app/server/package.json` и `yarn.lock` [VERIFIED: app/server/package.json]. `heic-decode` исключён решением D-12.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | Новых пакетов нет |

**Packages removed due to [SLOP] verdict:** нет
**Packages flagged as suspicious [SUS]:** нет

## Architecture Patterns

### System Architecture Diagram

```
Ученик (раннер, вопрос open)
  │ выбор файлов (input accept="image/*" multiple)
  ▼
[клиент] уменьшение: createImageBitmap → canvas ≤2560 px → toBlob(jpeg, 0.8)
  │   сбой декодирования → отправить оригинал (сервер решит: 415/413/400)
  ▼
[клиент] очередь: по одному, photoId = randomUUID(), до 3 автоповторов (сеть, 5xx, 503)
  │   4xx → показать текст сервера, не повторять
  ▼
PUT /api/…/sessions/:sessionId/questions/:questionId/photos/:photoId  (multipart, поле file)
  │
  ├─ sessionRequired → checkAttemptAccess(testId) ──нет──► 403/404
  ├─ обёртка multer (fileSize 10 МБ, files 1) ──ошибка──► 413 / 400 (русский текст)
  ▼
[сервис answer-photos]
  ├─ сессия своя? вопрос этого теста и шаблона open? ──нет──► 404 / 422
  ├─ строка photoId уже есть у этой сессии и вопроса? ──да──► 200 + существующая строка
  ├─ предварительная проверка окна (без блокировки) ──закрыто──► 422 UPLOAD_WINDOW_*
  ▼
[модуль приёма изображения] семафор (1–2) + предел очереди ──переполнено──► 503
  ├─ fileTypeFromBuffer: нет сигнатуры → 400; не JPEG/PNG/WebP (HEIC, GIF…) → 415
  ├─ metadata(): ширина×высота > лимита → 413
  ├─ sharp(…, limitInputPixels, failOn).autoOrient().resize(2560).webp(q82) + миниатюра 400 q75
  └─ повреждённый файл (ошибка sharp) → 400
  ▼
storage().write(answers/{sessionId}/{questionId}/{photoId}/full.webp, thumb.webp)
  ▼
транзакция БД: SELECT test_sessions … FOR UPDATE → photoUploadWindow(tx) (clock_timestamp)
  ├─ окно закрыто → откат, удалить записанные файлы → 422
  ├─ строк ≥ 5 → откат, удалить файлы → 409/422 «не больше 5 фото»
  ├─ конфликт photoId (чужая сессия) → откат, удалить файлы → 409
  └─ INSERT answer_photos (uploaded_at = now()) → COMMIT → 201

GET /api/answer-photos/:photoId/:variant  (thumb | full)
  ├─ canReadAnswerPhoto(req, photoId): владелец сессии ИЛИ (session.attempt_id и canReviewAttempt)
  │     нет / не найдено → один и тот же 404
  └─ storage().read(ключ из строки) → image/webp, private no-store, nosniff, CORP same-origin

GET /api/docs/assets/proxy?path=answers/… → isServableImageKey = false → 400 (как сейчас для чужих пространств)
```

### Recommended Project Structure

```
app/server/src/
├── services/assets/
│   ├── image-intake.ts        # D-01: правило приёма (сигнатура, пиксели, поворот, WebP, профили, семафор, отказы)
│   ├── images.ts              # медиатека через image-intake
│   ├── avatars.ts             # аватар через image-intake
│   └── inline-images.ts       # base64 из текста вопроса через image-intake
├── services/answer-photos/    # единственный вызывающий storage() для answers/
│   ├── index.ts               # uploadAnswerPhoto, listAnswerPhotos, deleteAnswerPhoto, readAnswerPhoto
│   └── *.test.ts
├── services/storage/keys.ts   # D-03: answers в STORAGE_NAMESPACES + таблица читателей
├── services/access-policy/    # canReadAnswerPhoto в scope-rules.ts/scope.ts, загрузчик в zone-loader.ts
├── middleware/upload.ts       # D-02: singleFileUpload({ field, maxBytes }) с переводом ошибок в 4xx
├── routes/answer-photos.ts    # раздача GET /api/answer-photos/:photoId/:variant
└── routes/tests/public.ts или routes/tests/session-photos.ts  # PUT/DELETE/GET списка под сессией
packages/exam-core/src/answer-photos.ts  # лимит 5, 10 МБ, коды отказов, схемы ответа
app/web/components/tests/answer-photos/  # очередь (фабрика), уменьшение, PhotoBlock.tsx
```

Имена — на усмотрение планировщика (Claude's Discretion); важна граница: `routes/tests/**` не импортирует `services/storage` [VERIFIED: scripts/storage-no-private-access.test.mjs:43-46].

### Pattern 1: Модуль приёма изображения (D-01, A1)

**What:** одна функция с профилями вместо трёх копий констант и пайплайнов. Сейчас:
- `images.ts`: `const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])`, `const MAX_DIMENSION = 1920`, `const WEBP_QUALITY = 85` [VERIFIED: app/server/src/services/assets/images.ts:24-27];
- `inline-images.ts`: `const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])`, те же `MAX_DIMENSION = 1920`, `WEBP_QUALITY = 85`, `sharp(payload, { animated: detected.mime === 'image/gif' })` [VERIFIED: app/server/src/services/assets/inline-images.ts:16-19,37];
- `avatars.ts`: `AVATAR_TYPES` с `'image/gif'`, оригинал пишется как есть: `await storage().write(key, buffer, { contentType: detected.mime, upsert: false })` [VERIFIED: app/server/src/services/assets/avatars.ts:19-24,155].
Ни одно место не вызывает `autoOrient`.

**Рекомендуемый интерфейс (эскиз, имена — предложение):**

```typescript
export type ImageProfile = {
  types: ReadonlySet<string>
  maxPixels: number
  maxSide: number
  quality: number
  thumb?: { side: number; quality: number }
  animated?: boolean
}

export type AcceptedImage = { full: Buffer; thumb: Buffer | null; width: number; height: number }

export async function acceptImage(buffer: Buffer, profile: ImageProfile): Promise<AcceptedImage>
```

Внутри: `fileTypeFromBuffer` → `ImageRejectedError(400 | 415)`; `sharp(buffer).metadata()` → `width * height > maxPixels` → `ImageRejectedError(413)`; затем под семафором `sharp(buffer, { limitInputPixels: maxPixels, failOn: 'error' }).autoOrient().resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).webp({ quality })`; миниатюра — из уже уменьшенного буфера (дешевле, чем второй раз из оригинала). Ошибки sharp «Input image exceeds pixel limit» → 413, остальные ошибки декодирования → 400 «Файл повреждён или не является изображением».

**Профили:**
- `answerPhoto`: JPEG/PNG/WebP, около 50 МП, 2560, q82, миниатюра 400 q75 (D-11, уточняет спайк).
- `mediaLibrary` и `inlineImage`: сохранить нынешние 1920/q85; `inlineImage` сохраняет GIF и `animated` (иначе меняется поведение картинок вопросов). Добавление `autoOrient()` для медиатеки — исправление (фото с iPhone в медиатеке сейчас ложатся боком, A1).
- Аватар: см. Open Question 2 (GIF и хранение оригинала как есть).

**Почему отдельный план до маршрутов:** ADR-0003 требует характеризации до рефакторинга. Поведение медиатеки и аватара уже закреплено HTTP-тестами (`routes/uploads.test.ts`, `routes/docs/assets*.test.ts`, `routes/users/avatar*.test.ts`); план добавляет тесты на интерфейсе `acceptImage` и только потом переводит вызывающих.

### Pattern 2: Отказы multer → 4xx в одном месте (D-02, A2, DEBT-01)

**Что сейчас:** фильтры бросают голый `Error` (`cb(new Error(IMAGE_TYPE_ERROR))` [VERIFIED: app/server/src/routes/docs/assets.ts:25-31]); общий обработчик отдаёт 500 всему, у чего нет `ApiError` и числового `status` [VERIFIED: app/server/src/app.ts:124-137]. Тесты закрепляют 500: «File too large», текст фильтра, «Unexpected end of form», «Field name missing» [VERIFIED: app/server/src/routes/uploads.test.ts:160-171,296-299,394-412].

Коды `MulterError` в 2.4.0 (дословно): `LIMIT_PART_COUNT: 'Too many parts'`, `LIMIT_FILE_SIZE: 'File too large'`, `LIMIT_FILE_COUNT: 'Too many files'`, `LIMIT_FIELD_KEY: 'Field name too long'`, `LIMIT_FIELD_VALUE: 'Field value too long'`, `LIMIT_FIELD_COUNT: 'Too many fields'`, `LIMIT_UNEXPECTED_FILE: 'Unexpected file field'`, `MISSING_FIELD_NAME: 'Field name missing'`, `LIMIT_FIELD_NESTING: 'Field name nesting too deep'`, `LIMIT_FIELD_ARRAY_INDEX: 'Field name array index too large'`, `STREAM_DESTROYED: 'File stream was destroyed'`, `INVALID_FIELD_NAME: 'Invalid field name'` [VERIFIED: node_modules/multer/lib/multer-error.js:3-16]. «Unexpected end of form» — это не `MulterError`, а ошибка busboy, которую multer пробрасывает через `busboy.on('error', …)` [VERIFIED: node_modules/multer/lib/make-middleware.js:426].

**Рекомендация:** обёртка вокруг `upload.single(field)`, которая любую ошибку, вышедшую из multer, превращает в `ApiError`: `LIMIT_FILE_SIZE` → 413 «Файл больше N МБ»; отказ фильтра (если фильтр останется) → 415; всё остальное (прочие `MulterError`, ошибки busboy) → 400 «Не удалось прочитать файл из запроса». С `memoryStorage` ошибок ввода-вывода нет, поэтому всё, что бросает multer, — ошибка клиента. Ошибки `Request aborted`/`Request closed` тоже уходят в 400: клиент уже ушёл, статус не важен, важно не логировать их как 500.

```typescript
export function singleFileUpload(options: { field: string; maxBytes: number }): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: options.maxBytes, files: 1, fields: 10, parts: 12 },
  }).single(options.field)
  return (req, res, next) => upload(req, res, (error?: unknown) => next(error ? uploadRefusal(error, options.maxBytes) : undefined))
}
```

Значения `fields`/`parts` — предложение [ASSUMED]. Фильтр по `file.mimetype` убрать совсем: заголовок недоверенный (D-14), Safari и «Файлы» подписывают типы по-разному, решение по сигнатуре принимает модуль приёма. Следствия для тестов, закрепляющих 500 (D-02 требует переписать их на 4xx):
- «MIME text/plain» с текстом внутри (`uploads.test.ts:163`) → 400 по сигнатуре (её нет);
- «image/gif отклоняется фильтром» (`uploads.test.ts:298`) переписывается на настоящие GIF-байты (`sharp({ create }).gif()`, `fileTypeFromBuffer` даёт `image/gif` — проверено запуском) → 415 по сигнатуре для медиатеки; PNG-байты с заголовком GIF больше не тестируются как отказ;
- «File too large» (`:170`) → 413; «Unexpected end of form» и «Field name missing» (`:396`, `:411`) → 400.

**Тексты отказов закреплены тестами.** `IMAGE_FILTER_ERROR`, `DOCS_FILTER_ERROR` в `uploads.test.ts:138-139` и текст `'Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)'` в `avatar.characterization.test.ts:148-152` проверяются дословно. Если модуль приёма даст один текст на все профили, эти тесты упадут по формулировке, а не по поведению. Решение планировщика: либо текст отказа по типу — поле профиля (например, `typeMessage`), и прежние тексты сохраняются, либо задача рефакторинга явно правит эти строки тестов.

Стоит ли трогать `app.ts`: можно дополнительно научить общий `errorHandler` распознавать `MulterError` (на случай нового маршрута, который поставит `multer` без обёртки), но «одно место» — обёртка. Минимально — только обёртка.

### Pattern 3: Кто читает пространство (D-03, A3, DEBT-07)

Сейчас `export const STORAGE_NAMESPACES = ['images', 'topics', 'avatars'] as const` [VERIFIED: app/server/src/services/storage/keys.ts:3], а правило чтения склеено из предиката:

```typescript
if (segments[0] === 'images' || segments[0] === 'avatars') return true
return segments[0] === 'topics' && segments.length >= 5 && segments[3] === 'assets'
```
[VERIFIED: app/server/src/services/storage/keys.ts:80-81]

и шаблона `` `/api/docs/assets/proxy?path=${encodeURIComponent(normalizeKey(key))}` `` в `storageUrl` [VERIFIED: app/server/src/services/storage/index.ts:158-160]. Добавление `answers` в список без других правок даст: `normalizeKey('answers/…')` проходит, `storageUrl` строит ссылку на прокси, прокси её отклоняет 400 (`isServableImageKey` = false).

**Рекомендация:** таблица в `keys.ts`, из которой выводятся и предикат, и отказ `storageUrl`:

```typescript
export const STORAGE_NAMESPACES = ['images', 'topics', 'avatars', 'answers'] as const

const NAMESPACE_READERS = {
  images: 'signed-in',
  avatars: 'signed-in',
  topics: 'signed-in-assets-only',
  answers: 'owner-and-reviewers',
} as const satisfies Record<StorageNamespace, string>
```

`isServableImageKey` возвращает `true` только для `signed-in` и для `topics/…/assets/…`; `storageUrl(key)` для пространства не из прокси бросает ошибку программиста (не `ApiError`), тест закрепляет. `satisfies Record<StorageNamespace, …>` заставит компилятор потребовать запись для нового пространства. Значения строк — предложение [ASSUMED].

ADR-0004 получает раздел «Кто читает пространство» с той же таблицей: `images/` и `avatars/` — любой вошедший (по замыслу: картинки вопросов и аватары), `topics/` — любой вошедший только для `…/assets/…`, `answers/` — владелец сессии и проверяющие по `canReviewAttempt` после сдачи, отдельным маршрутом, никогда через прокси.

Другие места, которые читают ключи: `parseStorageLink`/`ownStorageKey` начнут разбирать `answers/…` как свой ключ. `storedAvatarValue` требует префикс `avatars/${userId}/` [VERIFIED: app/server/src/services/storage/links.ts:117-123], `resolveImageLink` требует `isServableImageKey` [VERIFIED: links.ts:97-102] — утечки через них нет. `storage:reconcile` перечисляет только `topics` (`module.list('topics', { recursive: true })` [VERIFIED: app/server/src/services/question-content/reconcile.ts:148]), поэтому `--delete-orphans` фото не удалит.

### Pattern 4: Загрузка фото: порядок шагов и блокировка

1. `checkAttemptAccess({ testId, userId, canReadTest })` — как у остальных маршрутов сессии [VERIFIED: app/server/src/routes/tests/public.ts:439-440].
2. Сессия принадлежит `(testId, userId)` — `sessionFilter({ sessionId, owner })` [VERIFIED: app/server/src/services/attempt-sessions/sessions.ts:40-57]; вопрос принадлежит тесту и имеет `uiTemplate === 'open'` через `getQuestionTypeMapForTest({ testId, includeInactive: true })` — так делает `draftAnswerRule` [VERIFIED: app/server/src/services/attempt-sessions/draft-answers.ts:14-19]. Без `includeInactive: true` засеянный неактивным `open` не найдётся.
3. Быстрый путь идемпотентности: строка с этим `photoId`, этой сессией и вопросом уже есть → вернуть её (200), sharp не запускать.
4. Предварительная проверка окна `photoUploadWindow(db, { sessionId })` без блокировки: отказать до тяжёлой обработки.
5. Обработка в модуле приёма (семафор). Не внутри транзакции: на проде `idle_in_transaction_session_timeout` = 1 мин, а блокировка сессии задержала бы сдачу [CITED: ~/.claude/servers/bio-exam.md, строка про фазу 11].
6. Запись двух файлов с `upsert: true` (повтор того же `photoId` после обрыва перезаписывает свои же файлы).
7. Транзакция: `SELECT … FROM test_sessions WHERE id = … FOR UPDATE` (та же блокировка, что берёт `submitAttempt` [VERIFIED: app/server/src/services/attempt-sessions/submit.ts:136-149]) → `photoUploadWindow(tx, { sessionId })` (решает по `clock_timestamp()` [VERIFIED: app/server/src/services/attempt-sessions/upload-window.ts:55]) → повторная проверка строки `photoId` → `count(*)` по `(session_id, question_id)` → `INSERT`. Порядок блокировок «сессия первой» совпадает со сдачей, взаимоблокировки нет.
8. Отказ в транзакции (окно, лимит, конфликт PK `photoId` с другой сессией) → после отката удалить записанные файлы (best effort, сирот добирает фаза 16).

**Гонка двух одинаковых PUT одной сессии** до конфликта PK не доходит: оба запроса ждут одну блокировку `FOR UPDATE` сессии, второй на повторной проверке строки (шаг 7) находит строку победителя и отвечает 200, свои (те же самые) файлы не удаляет — на них уже ссылается строка. Удаление записанных файлов допустимо только при отказе окна, лимита или при конфликте PK с другой сессией; в последнем случае это безопасно, потому что ключ содержит `sessionId` проверенной сессии и чужие файлы лежат по другому пути.

Ответ: `201` для новой строки, `200` для повтора; тело — строка фото (`id`, `questionId`, `uploadedAt`, URL миниатюры и полного) и текущее число фото ответа.

**Отказ окна.** `uploadWindowRefusal` возвращает `{ status: 422, body: { error: 'UPLOAD_WINDOW_CLOSED' | 'UPLOAD_WINDOW_NONE', uploadClosesAt } }` [VERIFIED: app/server/src/services/attempt-sessions/upload-window.ts:73-90; packages/exam-core/src/upload-window.ts:3-8 — `closed: 'UPLOAD_WINDOW_CLOSED'`, `none: 'UPLOAD_WINDOW_NONE'`, `UPLOAD_WINDOW_REFUSAL_STATUS = 422`]. В теле нет русского текста — см. Open Question 1.

**Сессия открыта, таймер не истёк:** `uploadWindowState` для несданной сессии с лимитом открыт до `startedAt + (limit + window)` минут, без лимита — всегда открыт; закрытая без сдачи (`expired`/`superseded`) даёт `session_closed` → код `UPLOAD_WINDOW_NONE` [VERIFIED: upload-window.ts:28-41].

### Pattern 5: Раздача и доступ (D-16, D-17)

- Маршрут вне `routes/tests` (например, `routes/answer-photos.ts`, монтируется в `routes/index.ts`), `GET /api/answer-photos/:photoId/:variant`, `variant ∈ { thumb, full }`.
- Решение о доступе — функция шва `canReadAnswerPhoto(req, photoId)` в `scope-rules.ts`/`scope.ts` (правило навыка: новая проверка объекта — только там). Логика: строка фото → сессия; `session.user_id === req.authUser.id` → да; иначе `session.attempt_id !== null && canReviewAttempt(req, session.attempt_id)`. Поиск субъекта — новым методом `ZoneLoader` (по образцу `topicOfAttempt` [VERIFIED: app/server/src/services/access-policy/zone-loader.ts:23,86]).
- `canReviewAttempt = zoned(req, 'tests.read', …topicOfAttempt…)` [VERIFIED: app/server/src/services/access-policy/scope-rules.ts:128-129]; у роли ученика `grants: {}` [VERIFIED: packages/rbac/src/roles.ts:38-43], поэтому ученик чужое фото через ветку проверяющего не получит.
- Отказ и отсутствие — один ответ: `404 { error: 'Фото не найдено' }` (текст — предложение). Неверный UUID — 400 от `validateUUID`, это не раскрывает существование.
- Заголовки: `Content-Type: image/webp` (фиксированный), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin` — глобально helmet ставит `crossOriginResourcePolicy: { policy: 'cross-origin' }` [VERIFIED: app/server/src/app.ts:39], маршрут переопределяет.
- Ключ файла строится сервером из строки (`answers/{sessionId}/{questionId}/{photoId}/{variant}.webp`), не из параметров запроса.
- Охранный тест зоны: «Новый маршрут доступа к объекту зоны добавляется в инвентарь теста» `scripts/teacher-zone-guards.test.mjs` [CITED: навык bio-exam-api].

### Pattern 6: Клиент: конвейер и очередь

- Фабрика без React (`createPhotoUploadQueue({ upload, now, setTimer, clearTimer, randomId })`), хук-обёртка тонкий — так требует навык web [CITED: .agents/skills/bio-exam-web/SKILL.md, раздел «Web-тесты»].
- Состояния элемента: `preparing → uploading → done | failed(retryable) | refused(4xx)`; автоповтор 3 раза с нарастающей паузой (например, 1 с, 3 с, 9 с) тем же `photoId` для сетевых ошибок, 5xx, 429 и 503; 4xx не повторяются, показывается `failureMessage(failure)` — он выводит кириллический `error` сервера [VERIFIED: app/web/lib/http/errors.ts:12-37].
- Счётчик «N из 5»: сервер — источник истины (число из ответа PUT и списка); клиент блокирует выбор, когда `done + uploading ≥ 5`, а шестое фото, если всё же ушло, получает понятный отказ сервера.
- Уменьшение строго по одному файлу: `bitmap.close()`, `canvas.width = canvas.height = 0`, `URL.revokeObjectURL` после каждого; `toBlob` может вернуть `null` → отправить оригинал [CITED: .planning/research/PITFALLS.md M7].
- `request(url, { method: 'PUT', body: formData })` — модуль запросов принимает `body?: FormData` [VERIFIED: app/web/lib/http/request.ts:19-29].
- Картинки — обычный `<img src="/api/answer-photos/…/thumb">`, не `next/image`: оптимизатор Next ходил бы за картинкой сам, без cookie ученика, и кэшировал бы ответ.
- `sessionId` в снимке жизненного цикла сейчас не отдаётся: `AttemptSnapshot` содержит `startedAt`, `uploadClosesAt`, `serverOffsetMs`, но не `sessionId` [VERIFIED: app/web/components/tests/attempt-lifecycle/lifecycle.ts:77-97]. Блоку фото нужен `sessionId` — добавить поле в снимок (или отдельный геттер) в `lifecycle.ts`.
- Блок рисуется в `TestRunner.tsx` рядом с `QuestionInput` при `question.questionUiTemplate === 'open'` (D-19); `QuestionInput` для `open` сейчас возвращает `null` [VERIFIED: app/web/components/tests/QuestionInput.tsx:33-135].

### Anti-Patterns to Avoid

- **Копировать пайплайн `inline-images.ts` для фото:** нет `autoOrient`, есть GIF и `animated` — ровно то, чего фото не нужно.
- **Добавить `answers` в `isServableImageKey` или выдавать фото через `storageUrl`/`resolveImageUrl`:** фото стали бы доступны любому вошедшему.
- **sharp внутри транзакции с `FOR UPDATE` сессии:** держит блокировку, на которой ждёт сдача; на проде рвётся по `idle_in_transaction_session_timeout`.
- **Считать лимит 5 без блокировки:** параллельные загрузки обходят лимит.
- **Доступ проверяющего через `answer_photos.attempt_id`:** до фазы 14 он всегда `NULL`.
- **Повторять 4xx на клиенте:** бесконечные повторы при 413/415 (PITFALLS M2).
- **Доверять `file.mimetype` или имени файла:** тип только по сигнатуре.
- **`withMetadata()`/`keepMetadata()`/`keepExif()` в конвейере фото:** вернут EXIF и GPS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Определение формата | Свои проверки магических байтов | `fileTypeFromBuffer` (file-type 22) | Десятки форматов, HEIC/AVIF/GIF различаются по бокам контейнера |
| Поворот по EXIF | Ручное чтение Orientation и `rotate(угол)` | `autoOrient()` в sharp; на клиенте `imageOrientation: 'from-image'` | 8 значений ориентации с отражениями; двойной поворот при смешении |
| Снятие метаданных | Поиск и вырезание сегментов APP1/XMP | Поведение sharp по умолчанию (не вызывать `withMetadata`) | GPS, XMP, IPTC, ICC в разных контейнерах |
| Защита от «бомб» | Свой подсчёт пикселей по заголовку | `metadata()` + `limitInputPixels` | libvips уже читает заголовки всех форматов |
| Разбор multipart | Свой парсер | multer 2.4 (busboy) | Границы, обрывы, лимиты |
| Окно загрузки | Новое сравнение времени | `photoUploadWindow` + `uploadWindowRefusal` | Одна функция по `clock_timestamp()` (D-10) |
| Доступ проверяющего | Проверка роли в маршруте | `canReviewAttempt` из `scope.ts` | Правило зоны, охранные тесты |
| Повторы запроса при 401 | Свой `fetch` | `request` из `lib/http/request.ts` (через `apiFetch`) | Цепочка refresh, `web-requests-guards.test.mjs` |

**Key insight:** всё тяжёлое (форматы, ориентация, метаданные, multipart) уже решено установленными библиотеками; собственного кода здесь — только границы: что принимать, кому отдавать, в каком порядке писать файл и строку.

## Runtime State Inventory

Фаза удаляет маршрут и меняет правило пространств, поэтому инвентарь заполнен.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Мёртвый маршрут писал в общую `images/` — файлы остаются картинками медиатеки, ссылок на маршрут в базе нет. Новое пространство `answers/` пустое | Нет миграции данных. Новая таблица — миграцией (следующий номер после `0030_attempt_upload_window`, последняя запись журнала `idx: 30` [VERIFIED: app/server/drizzle/meta/_journal.json]) |
| Live service config | Caddy: тело до 20 МБ выше лимита 10 МБ; контейнер `api` 768m; `/api/*` идёт в `api:4000` мимо Next [CITED: ~/.claude/servers/bio-exam.md] | Шаги пользователя: решение по лимиту памяти после замера, проверка лимита тела Caddy |
| OS-registered state | Нет — проверено чтением профиля сервера: таймеры бэкапа и автовыкатки не завязаны на маршруты загрузки | Нет |
| Secrets/env vars | Новых ключей не нужно, если числа обработки — константы. `JSON_BODY_LIMIT` к multipart не относится | Нет (если планировщик всё же вынесет числа в env — запись в `.env.example`) |
| Build artifacts | Снимок `app/server/route-inventory.txt` (строка `POST /api/tests/:id/assets` [VERIFIED: app/server/route-inventory.txt:91]); `packages/exam-core/dist` после правки пакета | Перегенерировать `routes:inventory`; собрать exam-core перед отдельным прогоном тестов сервера |

Связанные с удалением маршрута правки в охранных тестах (все прочитаны):
- `scripts/tests-router-composition.test.mjs:80` — `assert.ok(exported.length >= 12, …)`; суброутеров ровно 12, после удаления 11 → тест упадёт, порог снизить до 11.
- `scripts/teacher-zone-guards.test.mjs:30,49` — `const ASSET_ROUTES = 'app/server/src/routes/tests/admin/assets.ts'` и запись в карте монтирования; убрать.
- `scripts/storage-no-private-access.test.mjs:71` — `['post', '/:id/assets']` в `SCOPED_ROUTES`; функция `scopeGateViolations` требует регистрацию каждого пути из списка → убрать строку.
- `app/server/src/routes/uploads.test.ts:141-147,184-216` — элемент `ROUTES` `tests/assets` и блок `describe('POST /api/tests/:id/assets')`.
- `app/server/src/routes/tests/index.ts:6,31` — импорт и `router.use(assetsRouter)`.
- `.agents/skills/bio-exam-api/SKILL.md:77` — список суброутеров с `assets.ts`; там же строка 86 про пространства — дописать `answers/`.

## Common Pitfalls

### Pitfall 1: Удаление `assets.ts` ломает охранные тесты
**What goes wrong:** `yarn verify` падает на шаге `script-tests` не из-за поведения, а из-за списков в трёх охранных тестах.
**Why it happens:** порог `>= 12` и явные перечни файлов/путей.
**How to avoid:** одной задачей с удалением править три теста (см. Runtime State Inventory) и перегенерировать снимок инвентаря.
**Warning signs:** «суброутеров 11», «регистрация не найдена», ENOENT на `admin/assets.ts`.

### Pitfall 2: Английский текст отказа не доходит до ученика
**What goes wrong:** клиент показывает «Запрос отклонён (код 413)».
**Why it happens:** `readApiError` берёт `error`, только если в нём есть кириллица [VERIFIED: app/web/lib/http/errors.ts:8,12-18]; тексты multer и busboy английские.
**How to avoid:** все отказы загрузки — русские тексты на сервере; коды окна (`UPLOAD_WINDOW_*`) перевести (Open Question 1).

### Pitfall 3: Проверка «вопрос открытый» не видит засеянный `open`
**What goes wrong:** загрузка к вопросу `open` отвечает «вопрос не найден».
**Why it happens:** `open` засеян `is_active = false` до фазы 17 [CITED: навык bio-exam-api, раздел «Попытка теста»].
**How to avoid:** `getQuestionTypeMapForTest({ testId, includeInactive: true })`.

### Pitfall 4: Память: неограниченная очередь держит буферы
**What goes wrong:** семафор ограничивает sharp, но каждый ждущий запрос уже держит до 10 МБ в `memoryStorage`.
**Why it happens:** multer читает тело до обработчика.
**How to avoid:** предел очереди семафора (например, 8–16 ожидающих) → 503 «Сервер занят, повторите» с `Retry-After`; клиент повторяет 503 автоматически. Число уточняет спайк. Семафор один на процесс (D-11), и через модуль приёма идут ещё медиатека, аватар и `inline-images.ts` (учитель сохраняет вопрос с base64). Решение планировщика: отказ 503 по переполнению очереди — только для профиля фото ответа; остальные профили ждут в очереди без отказа, иначе сохранение вопроса начнёт отвечать 503 во время пачки загрузок учеников.
**Warning signs:** рост RSS при пачке загрузок без роста `sharp.counters().process`.

### Pitfall 5: glibc и фрагментация памяти
**What goes wrong:** RSS API растёт от загрузки к загрузке и не возвращается.
**Why it happens:** документация sharp: «The default memory allocator on most glibc-based Linux systems (e.g. Debian, Red Hat) is unsuitable», поэтому sharp на таких системах сам ограничивает потоковую параллельность и рекомендует jemalloc [CITED: sharp.pixelplumbing.com/install/]. Образ собирается из `node:24-slim` (Debian) [CITED: ~/.claude/servers/bio-exam.md].
**How to avoid:** спайк меряет на Linux-образе (или в `node:24-slim` контейнере) серию из 20–50 загрузок, а не одну; если RSS растёт ступенькой — решение пользователя о jemalloc (`LD_PRELOAD`) в Dockerfile на сервере (вне репозитория).

### Pitfall 6: Повтор PUT «воскрешает» удалённое фото
**What goes wrong:** ученик удалил фото, пока висел повтор той же загрузки, и фото вернулось.
**Why it happens:** D-09 удаляет строку без надгробия; идемпотентность держится только пока строка есть.
**How to avoid:** клиент не даёт удалить элемент со статусом `uploading` (кнопка удаления только у `done`/`failed`) и снимает таймер повтора при удалении. Надгробие противоречит D-09 — не вводить.

### Pitfall 7: Порядок «файл → строка» и сироты
**What goes wrong:** строка без файла (битая миниатюра у проверяющего) или файл без строки.
**How to avoid:** при загрузке сначала файлы, потом строка (сирота файла безвредна: без строки её никто не отдаёт); при удалении сначала строка (коммит), потом файлы. Сирот добирает фаза 16.

### Pitfall 8: Удаление пользователя оставляет файлы `answers/`
**What goes wrong:** строки фото уйдут каскадом, файлы останутся.
**Why it happens:** `DELETE /api/users/:id` делает только `db.delete(users)` [VERIFIED: app/server/src/routes/users/index.ts:257-271]; ADR-0007 требует «Файлы хранилища удаляет сервис до строк».
**How to avoid:** см. Open Question 3.

### Pitfall 9: `api-routes-have-callers` для новых маршрутов
**What goes wrong:** тест падает: «маршрут без вызовов».
**Why it happens:** каждый маршрут из инвентаря должен иметь вызов в `app/web` (без юнит-тестов) или `e2e`, все статические сегменты пути — в одном файле [VERIFIED: scripts/api-routes-have-callers.test.mjs:57-72].
**How to avoid:** клиентский модуль API фото содержит все статические сегменты (`tests`, `public`, `sessions`, `questions`, `photos`, `answer-photos`) в одном файле.

### Pitfall 10: Mac Safari отдаёт HEIC
**What goes wrong:** с `accept="image/*"` macOS Safari оставляет HEIC; браузер его декодирует, но если canvas-путь упадёт и уйдёт оригинал — сервер ответит 415.
**How to avoid:** 415 с текстом «Формат HEIC не поддерживается: сохраните фото как JPEG или сфотографируйте через сайт» (текст — предложение); спайк D-15 проверяет, что `createImageBitmap` в Safari декодирует HEIC и клиент шлёт JPEG.

### Pitfall 11: 48 МП в спайке и ограничение 10 МБ
**What goes wrong:** синтетический 48 МП JPEG с шумом весит 21,7 МБ и не пройдёт лимит файла — замер «48 МП» через маршрут невозможен.
**How to avoid:** замер sharp — прямым вызовом модуля приёма на файле; через маршрут — реальные снимки (обычно меньше 10 МБ) или 48 МП с меньшей энтропией.

## Code Examples

### Конвейер фото и снятие метаданных (проверено запуском на sharp 0.35.5)

```typescript
const out = await sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' })
  .autoOrient()
  .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 82 })
  .toBuffer()
```

Результат запуска на JPEG 800x400 с `orientation: 6` и EXIF с GPS: вход `w 800, h 400, orientation 6, exif true, autoOrient 400x800`; выход `w 400, h 800, orientation null, exif false, icc false, xmp false, format webp`. Сообщения ошибок: превышение лимита — `"Input image exceeds pixel limit"`; обрезанный JPEG при `failOn: 'warning'` — `"VipsJpeg: premature end of JPEG image"`; текст — `"Input buffer contains unsupported image format"`. `fileTypeFromBuffer` для текста — `undefined`, для GIF — `{ ext: 'gif', mime: 'image/gif' }`, для AVIF — `{ ext: 'avif', mime: 'image/avif' }` [VERIFIED: запуск probe.mjs в scratchpad против node_modules проекта].

Опции конструктора в типах 0.35.5: `autoOrient?`, `failOn?` («Use the default 'warning' level with untrusted input»), `limitInputPixels?` (по умолчанию 268402689), `unlimited?`, `sequentialRead?`; функции `concurrency()`, `counters()` (`queue`, `process`), `cache()` [VERIFIED: node_modules/sharp/lib/index.d.ts:89-117,984-1013,1063-1068]. Текущее состояние кэша по умолчанию: `{"memory":{"current":0,"high":0,"max":50},"files":{"current":0,"max":20},"items":{"current":0,"max":100}}`, `concurrency()` на macOS = 4 [VERIFIED: запуск].

### Фикстура для тестов поворота и GPS

```typescript
const rotated = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 100, b: 50 } } })
  .jpeg()
  .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'Apple', Model: 'iPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' } } })
  .toBuffer()
```
Проверка в тесте: `(await sharp(saved).metadata())` → `width < height`, `exif` отсутствует, `orientation` отсутствует. Для Orientation 8 — то же с `orientation: 8`.

### Существующие помощники тестов попытки

`app/server/src/test-support/attempt-world.ts` уже даёт `seedAttemptWorld`, `createAttemptTest`, `assignTest`, `insertOpenSession`, `insertOpenQuestion`, `shiftStartedAt`, `submitAttempt`, `countRows` [VERIFIED: app/server/src/test-support/attempt-world.ts:74-185]; `memoryStorage()` из `test-support/storage.ts` и `mem.keys(prefix)` — для проверки хранилища, как в `uploads.test.ts`.

## Память: предварительный замер (не заменяет спайк D-15)

Машина: macOS arm64, Node 24.17.0, sharp 0.35.5, `sharp.cache(false)`, синтетические JPEG с шумом и Orientation 6, полный конвейер (2560 px WebP q82 + миниатюра 400 q75), прирост RSS над базой процесса [VERIFIED: запуск mem.mjs в scratchpad]:

| Вход | Потоков libvips | Параллельно | Прирост RSS | Время |
|------|-----------------|-------------|-------------|-------|
| 12 МП JPEG (5,4 МБ) | 1 | 1 | 86 МБ | 571 мс |
| 12 МП JPEG | 1 | 2 | 186 МБ | 580 мс |
| 12 МП JPEG | 4 | 2 | 188 МБ | 569 мс |
| 48 МП JPEG (21,7 МБ) | 1 | 1 | 89 МБ | 614 мс |
| 48 МП JPEG | 1 | 2 | 188 МБ | 625 мс |
| 49 МП PNG (однотонный, 0,67 МБ) | 1 | 1 | 65 МБ | 244 мс |
| 49 МП PNG | 4 | 2 | 207 МБ | 213 мс |
| 64 МП PNG при лимите 50 МП | 1 | 1 | отказ «Input image exceeds pixel limit» | — |

Выводы для плана: (1) пик примерно линеен по числу одновременных обработок — семафор 1 держит прирост около 90 МБ, 2 — около 190 МБ; при простое API около 125 МБ [CITED: ~/.claude/servers/bio-exam.md] обе цифры укладываются в 768 МБ, но с запасом только при пределе очереди (буферы multer по 10 МБ). (2) Число потоков libvips почти не влияет на пик. (3) JPEG дешёвый из-за декодирования в уменьшенном масштабе (shrink-on-load libjpeg срабатывает сам при `resize`; D-13 говорит о том, что выше лимита пикселей не уменьшаем, а отказываем, — это не противоречит автоматическому shrink-on-load JPEG). Ограничения замера: macOS, не Linux glibc; синтетика; одна обработка, без серии (фрагментация не видна) — всё это и есть содержание спайка.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sharp().rotate()` без аргументов для EXIF | `autoOrient()` (алиас) или опция `autoOrient: true` | есть в 0.35.5 [VERIFIED: lib/index.d.ts:400-421,984-991] | Читаемее; обе формы снимают тег Orientation |
| `withMetadata()` чтобы сохранить ICC | По умолчанию метаданные удаляются, ICC приводится к sRGB | — | Для фото ничего не вызывать |
| `browser-image-compression` | `createImageBitmap` + canvas | — | Ноль зависимостей [CITED: .planning/research/STACK.md] |
| multer 1.x с `fileFilter` по mimetype | multer 2.x, `MulterError.code`, решение по сигнатуре | multer 2.0 | Перевод ошибок по `code` |

**Deprecated/outdated:** ничего из используемого не устарело; `heic-decode` и HEIC вне фазы (D-12).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Значения `fields: 10, parts: 12` в лимитах multer | Pattern 2 | Низкий: при FormData с одним полем любые разумные числа подходят |
| A2 | Строки ролей таблицы читателей (`signed-in`, `owner-and-reviewers` …) | Pattern 3 | Нет: имена внутренние |
| A3 | Предел очереди семафора 8–16 и ответ 503 с `Retry-After` | Pitfall 4 | Средний: число уточняет спайк; без предела очередь держит буферы |
| A4 | Паузы автоповтора 1 с / 3 с / 9 с | Pattern 6 | Низкий: D-20 задаёт только «нарастающие» |
| A5 | Тексты отказов («Фото не найдено», про HEIC) | Pattern 5, Pitfall 10 | Низкий: формулировки |
| A6 | Linux-образ поведёт себя по памяти сопоставимо с macOS-замером | Память | Средний: проверяет спайк на `node:24-slim` |
| A7 | `next/image` оптимизатор не передаёт cookie и кэширует ответ | Pattern 6 | Низкий: рекомендация — обычный `<img>` в любом случае |
| A8 | Номера ASVS 4.0.3 в разделе безопасности | Security Domain | Низкий: справочно |

## Open Questions

1. **Текст отказа окна (D-20 «отказ окна показывает текст сервера»).**
   - What we know: тело отказа — `{ error: 'UPLOAD_WINDOW_CLOSED' | 'UPLOAD_WINDOW_NONE', uploadClosesAt }`, схема `UploadWindowRefusalSchema` без поля текста [VERIFIED: packages/exam-core/src/upload-window.ts:14-17]; `readApiError` показывает только кириллический `error`.
   - What's unclear: добавлять ли русское поле (`message`) в тело отказа (необязательное поле схемы exam-core) или переводить код на клиенте.
   - Recommendation: тексты двух кодов — константа в `@bio-exam/exam-core` рядом с кодами; сервер кладёт её в необязательное поле `message`, клиент показывает `message`, иначе текст по коду. Одна строка на код, нет расхождения.

2. **Аватар через модуль приёма (D-01): GIF и оригинал.**
   - What we know: аватар принимает GIF и хранит исходный буфер с EXIF/GPS как есть; кроп считается по пикселям без `autoOrient`, а браузер показывает исходник повёрнутым по EXIF, поэтому кроп повёрнутого JPEG сейчас, вероятно, смещён [VERIFIED: app/server/src/services/assets/avatars.ts:92-106,143-156].
   - What's unclear: можно ли перестать принимать GIF у аватара (станет 415) и перекодировать оригинал (поворот, без метаданных).
   - Recommendation: профиль аватара — JPEG/PNG/WebP/GIF (без смены поведения по типам), оригинал перекодировать с `autoOrient()` и без метаданных, формат исходника сохранить для GIF (`animated`). Утвердить с пользователем, если планировщик решит убрать GIF.

3. **Файлы `answers/` при удалении пользователя (ADR-0007).**
   - What we know: строки уйдут каскадом (`session_id` → `test_sessions` cascade); удаление пользователя файлы не трогает (и аватары тоже); очистка сирот — фаза 16.
   - What's unclear: делать ли в фазе 12 удаление файлов фото пользователя до удаления строк.
   - Recommendation: минимум в фазе 12 — функция сервиса `removeUserAnswerPhotos(userId)` (список ключей из строк, затем `storage().remove`), вызываемая из `DELETE /api/users/:id` до удаления; если планировщик откладывает — записать в окна/фазу 16 явно.

4. **Блок фото после сдачи и после истечения таймера.**
   - What we know: сервер принимает фото до `upload_closes_at` и после сдачи; раннер после сдачи показывает исход «Ответ принят» со строкой окна (фаза 11), вопросы в режиме чтения при `deadlinePassed`.
   - What's unclear: показывает ли фаза 12 блок фото в этих состояниях.
   - Recommendation: в фазе 12 блок живёт в карточке вопроса, пока сессия открыта, включая `deadlinePassed` до финализации (окно ещё открыто); экран после сдачи — фазы 13/14. Подтвердить на discuss/plan, если пользователь ждёт загрузку после «Ответ принят» уже здесь.

5. **Запись замера (критерий 5): ADR или документ.**
   - Recommendation: числа и настройки — раздел в ADR-0004 рядом с таблицей читателей или отдельный `docs/adr/0009-…`; планировщик выбирает. Профиль сервера (лимит контейнера) правит пользователь.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | всё | ✓ | 24.17.0 | — |
| Yarn (Corepack) | всё | ✓ | 4.12.0 | — |
| PostgreSQL 17 (initdb/pg_ctl) | тесты с базой, `yarn verify` | ✓ | `/opt/homebrew/opt/postgresql@17`, `with-test-db` поднимает сам | — |
| sharp prebuilt (libvips 8.18.7) | обработка | ✓ | 0.35.5 | — |
| Playwright Chromium | `yarn e2e` | ✓ | chromium-1243 в кэше | `yarn playwright install chromium` |
| Docker / Linux-образ `node:24-slim` | спайк памяти на Linux | не проверялось | — | замер на сервере пользователем или на `192.168.1.2` |
| Реальные фото iPhone/Android (JPEG, HEIC) | спайк D-15 | ✗ | — | шаг пользователя; без них — синтетика с пометкой |

**Missing dependencies with no fallback:** реальные снимки для решения по читаемости и HEIC (шаг пользователя по ROADMAP).
**Missing dependencies with fallback:** Linux-замер памяти — синтетика на macOS как предварительная оценка.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (server, web); `node:test` для `scripts/*.test.mjs`; Playwright для `e2e/` |
| Config file | `app/server/vitest.config.ts`, `app/web/vitest.config.ts`, `e2e/playwright.config.ts` |
| Quick run command | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- <файл>`; `yarn workspace @bio-exam/web test -- <файл>` |
| Full suite command | `yarn verify` (+ `yarn e2e` отдельно) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHOTO-03 | Сигнатура: текст → 400, GIF/HEIC/AVIF → 415, > лимита пикселей → 413, обрезанный → 400 | unit (модуль приёма) | `yarn workspace @bio-exam/server test -- src/services/assets/image-intake.test.ts` | ❌ Wave 0 |
| PHOTO-03 | Orientation 6 и 8 → вертикальный WebP без EXIF/GPS, миниатюра ≤ 400 px | unit | то же | ❌ Wave 0 |
| PHOTO-04 | Семафор: не больше N одновременных обработок, предел очереди → 503 | unit (фейковые задачи) | то же | ❌ Wave 0 |
| DEBT-01 | 413/400 (и 415, если фильтр остаётся) на `docs/assets` и `users/avatar`, русский текст, хранилище пусто | integration (HTTP, test DB) | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- src/routes/uploads.test.ts` | ✅ (переписать) |
| DEBT-07 | `answers/…` через `/api/docs/assets/proxy` и `/signed` → отказ; `storageUrl('answers/…')` бросает | unit + integration | `… test -- src/services/storage/links.test.ts src/routes/docs/assets.test.ts` | ✅ (дописать) |
| PHOTO-02 | Повтор того же `photoId` → 200, одна строка, файлы не плодятся | integration | `… test -- src/services/answer-photos/*.test.ts` (или маршрута) | ❌ Wave 0 |
| PHOTO-06 | Шесть параллельных PUT → ровно 5 строк, шестой — отказ с текстом | integration | то же | ❌ Wave 0 |
| PHOTO-06 | Удаление при открытом окне — строка и оба файла ушли; при закрытом — 422 | integration (`shiftStartedAt`) | то же | ❌ Wave 0 |
| PHOTO-05 | Владелец 200; чужой ученик и учитель чужой зоны → тот же 404, что у несуществующего; учитель зоны до сдачи 404, после сдачи 200; заголовки `private, no-store`, `nosniff`, CORP | integration | то же | ❌ Wave 0 |
| PHOTO-05 (критерий 4) | Фото после закрытия окна → 422 `UPLOAD_WINDOW_CLOSED`, в хранилище и базе ничего | integration | то же | ❌ Wave 0 |
| PHOTO-02 | Очередь: 3 автоповтора с паузами тем же `photoId`, затем «Повторить»; 4xx без повтора | unit (web, швы таймера) | `yarn workspace @bio-exam/web test -- components/tests/answer-photos/upload-queue.test.ts` | ❌ Wave 0 |
| PHOTO-01/06 | Раннер: выбор файлов, «N из 5», удаление, шестое отклонено, после перезагрузки фото на месте | e2e | `yarn e2e -- e2e/tests/answer-photos.spec.ts` | ❌ Wave 0 |
| — | Миграция: цепочка с пустой базы, каскады на `users`/`test_sessions` по ADR-0007 | integration | `yarn verify` (шаг `migrations`), `src/db/user-deletion-rule.test.ts` | ✅ (держит зелёным) |
| — | Охранные тесты после удаления маршрута и новых маршрутов | scripts | `node --test scripts/*.test.mjs` в `yarn verify` | ✅ (править) |
| PHOTO-04 (критерий 5) | Пик памяти 12/48 МП, concurrency 1/2 | manual-only (спайк, запись числа) | скрипт спайка; не в `yarn verify` | ❌ |

### Sampling Rate
- **Per task commit:** точечный файл теста задачи (команды выше).
- **Per wave merge:** `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` и `yarn workspace @bio-exam/web test`.
- **Phase gate:** `yarn verify` зелёный и полный `yarn e2e`, не только новый спек: по D-19 блок фото появится в каждом вопросе `open` из сида, то есть в уже существующих сценариях `review.spec.ts`, `attempt-review-pending.spec.ts`, `deadline-finalised.spec.ts`, `timed-attempt.spec.ts` (тесты `review-*`, `deadline-timed-*`). Затем `/gsd-verify-work`. Перед `/gsd-ship` открыто окно №3 журнала `.planning/WINDOWS.md` (A4, `MediaLibrary.tsx`): при `windows_enforce: true` ship блокируется, нужен `waive` с причиной или исправление.

### Wave 0 Gaps
- [ ] `app/server/src/services/assets/image-intake.test.ts` — PHOTO-03, PHOTO-04 (фикстуры через `sharp().withMetadata({ orientation })`).
- [ ] Тесты сервиса/маршрутов фото — PHOTO-02, 05, 06, критерий 4 (помощники `attempt-world.ts`, `memoryStorage()`).
- [ ] `app/web/components/tests/answer-photos/upload-queue.test.ts` — очередь и повторы.
- [ ] Сид e2e: тест с вопросом `open`, назначенный отдельному ученику на проект (desktop/mobile), чтобы не мешать `review-*` и `photo-window-*` [VERIFIED: e2e/fixtures/seed.json:395-586 — существующие тесты с `"template": "open"`].
- [ ] `e2e/tests/answer-photos.spec.ts`.

Не раздувать тесты (память проекта «Test hygiene»): юниты только для логики с вариантами (модуль приёма, очередь), остальное — интеграционные сценарии.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | да (косвенно) | Сессия `sessionRequired`, как у маршрутов попытки |
| V3 Session Management | нет изменений | — |
| V4 Access Control | да | `canReadAnswerPhoto` в `scope.ts` (владелец или `canReviewAttempt` после сдачи), одинаковый 404, проверка сессии и вопроса на загрузке |
| V5 Input Validation | да | `fileTypeFromBuffer`, `metadata()` и `limitInputPixels`, перекодирование sharp, UUID-параметры `validateUUID` |
| V6 Cryptography | нет | `crypto.randomUUID()` на клиенте — идентификатор, не секрет |
| V8 Data Protection | да | Снятие EXIF/GPS (клиент и сервер), `Cache-Control: private, no-store` |
| V12 Files and Resources (ASVS 4.0.3) | да | Лимит размера (multer 10 МБ, Caddy 20 МБ), тип по содержимому, хранение вне веб-корня, ключ строит сервер, `nosniff`, фиксированный `Content-Type`, CORP `same-origin` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Чтение чужого фото через общий прокси | Information disclosure | `answers` вне `isServableImageKey`, тест на прокси |
| Перебор `photoId` чужого ответа | Information disclosure | Одинаковый 404 для чужого и отсутствующего |
| Декомпрессионная «бомба» (PNG/JPEG с огромными размерами) | Denial of service | `metadata()` → 413 до декодирования, `limitInputPixels`, семафор, предел очереди |
| Подмена типа (HTML/SVG под видом image/png) | Tampering / XSS | Сигнатура, перекодирование в WebP, фиксированный `image/webp`, `nosniff` |
| Обход лимита 5 параллельными запросами | Tampering | `FOR UPDATE` сессии + счёт в транзакции |
| Загрузка после закрытия окна | Tampering | `photoUploadWindow` под блокировкой по `clock_timestamp()` |
| Встраивание фото ученика чужим сайтом | Information disclosure | `Cross-Origin-Resource-Policy: same-origin` на маршруте раздачи |
| GPS домашнего адреса в фото несовершеннолетнего | Information disclosure | Двойное снятие метаданных, тест на отсутствие EXIF |
| Перезапись чужих файлов повтором с чужим `photoId` | Tampering | Ключ включает `sessionId` и `questionId` из проверенной сессии; конфликт PK → 409 и удаление своих файлов |

## Sources

### Primary (HIGH confidence)
- Код репозитория, прочитан в этой сессии: `services/storage/{keys,links,index,port}.ts`, `services/assets/{images,avatars,inline-images,index}.ts`, `routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/tests/admin/assets.ts`, `routes/tests/{index,public}.ts`, `routes/index.ts`, `app.ts`, `services/attempt-sessions/{upload-window,sessions,access,index,draft-answers,submit}.ts`, `services/access-policy/{scope,scope-rules}.ts`, `packages/exam-core/src/upload-window.ts`, `routes/uploads.test.ts`, `app/web/components/tests/{QuestionInput,TestRunner}.tsx`, `attempt-lifecycle/lifecycle.ts`, `app/web/lib/http/{request,errors}.ts`, `scripts/{storage-no-private-access,teacher-zone-guards,tests-router-composition,api-routes-have-callers}.test.mjs`, `app/server/route-inventory.txt`, `e2e/fixtures/seed.json`, ADR-0004, ADR-0006, ADR-0007, навыки bio-exam-api/data/web.
- `node_modules/multer/lib/multer-error.js`, `make-middleware.js` (2.4.0); `node_modules/sharp/lib/index.d.ts` (0.35.5).
- Запуски в scratchpad: `probe.mjs` (поворот, метаданные, тексты ошибок, file-type), `mem.mjs` (память).
- https://sharp.pixelplumbing.com/install/ — аллокатор glibc, список форматов предсобранной сборки (без HEIC).
- https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap — `imageOrientation`, `resizeWidth`.

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` §2, §5 и `.planning/research/PITFALLS.md` C3, C6, M1–M9 (исследование вехи 2026-10-06).
- Профиль сервера `~/.claude/servers/bio-exam.md` (Caddy, лимиты контейнеров, образ).

### Tertiary (LOW confidence)
- Поведение Safari/Android с HEIC и canvas на реальных устройствах (из STACK/PITFALLS, не проверялось).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — пакеты установлены, API проверены по типам и запуском.
- Architecture: HIGH — границы и охранные тесты прочитаны; имена модулей — рекомендация.
- Pitfalls: HIGH по коду и охранным тестам, MEDIUM по памяти (синтетика, macOS), LOW по устройствам.

**Research date:** 2026-10-13
**Valid until:** 2026-11-12 (стек стабилен; пересмотреть, если обновится sharp или multer)
