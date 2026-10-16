# Phase 12: Photos on session authentication - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Вошедший ученик прикрепляет до 5 обработанных фото к открытому ответу с компьютера (файловый выбор); фото уменьшаются в браузере, отправляются по одному с повторами, на сервере проходят sharp (поворот, WebP, миниатюра, без метаданных) и хранятся в новом пространстве `answers/`. Их видят только владелец и разрешённые проверяющие, а память API ограничена. Фото после закрытия окна отклоняются правилом фазы 11. Закрываются DEBT-01 (413/415/400 вместо 500 на старых маршрутах загрузки) и DEBT-07 (ADR-0004: кто читает `images/` и `answers/`).

Вне фазы: QR, токен и страница телефона (13); создание открытого вопроса, текст ответа, сдача, «Готово» (14); просмотр и оценка проверяющим (15); срок хранения и очистка сирот (16); модерация содержимого (MODX-01).

</domain>

<decisions>
## Implementation Decisions

### Архитектура вокруг фазы (ARCH-REVIEW)
- **D-01 (решение пользователя):** Правило приёма изображения собирается в одном серверном модуле (тип по сигнатуре, лимит пикселей, поворот, WebP, очистка метаданных, константы). Отдельный план, до планов маршрутов и фото; через него идут фото ответов и медиатека, аватар. См. `12-ARCH-REVIEW.md` A1.
- **D-02 (решение пользователя):** Отказы multer (размер, тип, обрыв формы) приводятся к 413/415/400 в одном месте; тесты, закрепляющие 500 (`routes/uploads.test.ts:163,170,298,396,411`), переписываются на 4xx. A2, DEBT-01.
- **D-03 (решение пользователя):** Правило «кто читает какое пространство хранилища» (`images/`, `avatars/`, `topics/`, `answers/`) собирается в одном месте, ADR-0004 фиксирует его (DEBT-07). `answers/` не попадает в `isServableImageKey` и общий прокси; `storageUrl` для него не строит ссылку на прокси. A3.
- **D-04 (решение пользователя):** Мёртвый маршрут `POST /api/tests/:id/assets` (`routes/tests/admin/assets.ts`) удаляется в этой фазе после сверки с `route-inventory.snapshot.test.ts` и ADR; его тесты и снимок инвентаря обновляются. A5.
- **D-05 (рекомендация, отложено):** Клиент `MediaLibrary.tsx` (дубли лимита 5 МБ и списка MIME) и `lib/http/errors.ts` не переделываются; новый компонент фото берёт текст отказа из 4xx-ответа сервера. A4 лежит в журнале «разбитых окон».

### Хранение и привязка
- **D-06 (решение пользователя):** Фото принадлежит сессии и вопросу: строка и ключ `answers/{sessionId}/{questionId}/{photoId}/{full,thumb}.webp`; при сдаче (фаза 14) строка получает `attempt_id`, файл не переезжает. Это уточняет исследование (оно предлагало `attemptId`): попытка есть только после сдачи, а `photoUploadWindow` принимает `sessionId`.
- **D-07 [авто]:** `photoId` — UUID, создаёт клиент; загрузка идемпотентна (`PUT .../photos/:photoId`), повтор того же `photoId` возвращает существующую строку и не плодит дубль. Лимит 5 фото на ответ проверяется в той же транзакции, что вставка, с блокировкой строки ответа/сессии.
- **D-08 [авто]:** Время загрузки ставит сервер (`uploaded_at default now()`), не EXIF и не клиент.
- **D-09 (решение пользователя):** Удаление фото учеником (пока окно открыто) — сразу удалить строку и оба файла. Сначала проверка окна `photoUploadWindow`, после закрытия убрать нельзя.
- **D-10 [авто]:** Окно проверяется одной функцией `photoUploadWindow` + `uploadWindowRefusal` (фаза 11, D-09) на загрузке и удалении; отказ 422 с кодами `UPLOAD_WINDOW_CLOSED` / `UPLOAD_WINDOW_NONE`, фото не сохраняется.

### Обработка и память
- **D-11 [авто]:** Стартовые числа (подтверждает или меняет первый план-замер): файл до 10 МБ, лимит пикселей около 50 МП, поворот по EXIF, длинная сторона 2560 px, WebP q82, миниатюра 400 px q75, sharp без кэша (`cache(false)`), один семафор на процесс (1 или 2 по замеру), результат записать в ADR/документ с замером (критерий 5).
- **D-12 (решение пользователя):** HEIC на сервере не принимается: 415 с понятным текстом. `heic-decode` не добавляется. Пересмотр — если замер на реальных фото или логи покажут HEIC.
- **D-13 (решение пользователя):** Фото выше лимита пикселей отклоняется 413 «слишком большое изображение»; shrink-on-load не используется (клиент уже уменьшает до 2560 px).
- **D-14 [авто]:** Тип определяется по сигнатуре буфера (`fileTypeFromBuffer`), заголовку `Content-Type` не верим; разрешены JPEG, PNG, WebP; неверная сигнатура 400, неподдерживаемый тип 415, слишком большой 413; тексты сообщений русские и читаемые.
- **D-15 [авто]:** Первый план — измерительный спайк: пик памяти sharp на 12 и 48 МП (Orientation 6 и 8, concurrency 1 и 2), читаемость тетрадной страницы при 2560 px, файл до 10 МБ через Next rewrites в `yarn dev`, решение по HEIC на реальных образцах пользователя.

### Раздача и доступ
- **D-16 (ROADMAP):** Фото отдаёт отдельный маршрут, не общий прокси `/api/docs/assets/proxy`; `Cache-Control: private, no-store` (исследование предлагало immutable, критерий 3 важнее); `X-Content-Type-Options: nosniff`; чужой запрос получает тот же ответ, что и для несуществующего файла.
- **D-17 (решение пользователя):** До сдачи фото видит только владелец. Проверяющие (`canReviewAttempt`, шов `services/access-policy/`) получают доступ после сдачи, когда есть попытка; правила доступа без попытки не вводятся.

### Клиент
- **D-18 [авто]:** Общий компонент фото (выбор файла, уменьшение в браузере `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas → JPEG q0.8, длинная сторона 2560 px, отправка по одному, счётчик «N из 5», удаление) готовится так, чтобы фаза 13 добавила «Сделать фото» (`capture`) и «Выбрать из галереи» без переделки; в `accept` писать `image/*`, не `image/heic`.
- **D-19 (решение пользователя):** Блок фото в раннере показывается только для вопроса открытого типа из сида и e2e; тип `open` для авторов остаётся скрытым до фазы 17, dev-флага нет.
- **D-20 (решение пользователя):** Сбойная загрузка повторяется сама три раза с нарастающей паузой тем же `photoId`, затем остаётся кнопка «Повторить»; шестое фото отклоняется понятным сообщением; отказ окна показывает текст сервера.

### Claude's Discretion
- Имена файлов и модулей, форма таблицы фото (поля сверх `session_id`, `question_id`, `photo_id`, `attempt_id` NULL, `uploaded_at`, `expires_at`), номер миграции — решает планировщик, учитывая правило ADR-0003 и то, что применённые миграции не правятся.
- Размер миниатюры и точное качество WebP — по результатам спайка.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Решения и требования
- `.planning/ROADMAP.md` раздел «Phase 12» — цель, критерии успеха, шаги пользователя.
- `.planning/REQUIREMENTS.md` — PHOTO-01…06, DEBT-01, DEBT-07.
- `.planning/phases/12-photos-on-session-authentication/12-ARCH-REVIEW.md` — находки A1–A5 и решения.
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-CONTEXT.md` — D-06…D-10 (окно загрузки).
- `docs/adr/0004-storage-port-two-adapters.md` — порт хранилища; ADR фазы 12 дописывает, кто читает `images/` и `answers/`.
- `docs/adr/0001-express-owns-data-and-access-policy.md`, `docs/adr/0006-enforce-authorization-by-construction.md` — доступ и проверка прав на сервере.
- `docs/adr/0003-verification-before-refactoring.md` — характеризация до рефакторинга.
- `docs/adr/0005-decompose-by-concept.md` — нарезка модулей.

### Исследование
- `.planning/research/STACK.md` §2 (конвейер sharp, клиентское сжатие, HEIC), §5 (хранение и раздача фото ответов).
- `.planning/research/PITFALLS.md` — ловушки загрузки и памяти.

### Навыки проекта (прочитать перед правкой своей области)
- `.agents/skills/bio-exam-api/SKILL.md`, `.agents/skills/bio-exam-web/SKILL.md`, `.agents/skills/bio-exam-data/SKILL.md`.
- `plans/README.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/server/src/services/attempt-sessions/upload-window.ts` — `photoUploadWindow`, `uploadWindowRefusal`, `uploadWindowState`: окно загрузки, боевых вызывающих пока нет.
- `packages/exam-core/src/upload-window.ts` — коды и статус отказа окна (`UPLOAD_WINDOW_ERROR_CODES`, 422).
- `app/server/src/services/storage/` — порт хранилища (`write/read/exists/remove/copy/list`), `keys.ts` (`STORAGE_NAMESPACES`), адаптеры local/supabase/memory.
- `app/server/src/services/access-policy/scope.ts` — `canReviewAttempt` для проверяющих.
- `app/server/src/services/assets/images.ts`, `avatars.ts`, `inline-images.ts` — три копии приёма изображения (A1).
- `app/server/src/middleware/rateLimiter.ts` — лимит запросов (на маршрутах загрузки не стоит).

### Established Patterns
- multer `memoryStorage` с `fileFilter`, голый `Error` из фильтра даёт 500 (A2).
- `fileTypeFromBuffer` для сигнатуры в `images.ts` и `avatars.ts`.
- Идемпотентность клиентским UUID (как `clientAttemptId`).

### Integration Points
- Новое пространство `answers` в `services/storage/keys.ts`, новый маршрут раздачи, миграция таблицы фото.
- Раннер теста: `app/web/components/tests/` (блок фото для сид-вопроса открытого типа).
- `routes/tests/index.ts:31` — подключение мёртвого маршрута (удаляется, D-04).

</code_context>

<specifics>
## Specific Ideas

Ответ ученика на фото: бумажная тетрадь, читаемость рукописи при увеличении проверяющим важнее размера файла. Образцы фото iPhone и Android даёт пользователь для спайка.

</specifics>

<deferred>
## Deferred Ideas

- Переделка `MediaLibrary.tsx` под тексты 4xx (A4) — позже, в журнале «разбитых окон».
- Поддержка HEIC на сервере (`heic-decode`) — только если замер или логи покажут потребность.
- Модерация содержимого фото — MODX-01, не v3.0.
- Срок хранения и очистка сирот — фаза 16; QR и телефон — фаза 13.

</deferred>

---

*Phase: 12-Photos on session authentication*
*Context gathered: 2026-10-13*
