---
phase: 12-photos-on-session-authentication
verified: 2026-10-16T13:08:09Z
status: passed
score: 5/5 критериев подтверждены по коду; критерий 5 дополнительно ждёт Linux-замера пользователя (12-UAT.md)
covered_files: [".planning/phases/12-photos-on-session-authentication/12-01-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-01-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-02-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-02-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-03-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-03-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-04-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-04-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-05-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-05-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-06-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-06-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-07-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-07-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-08-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-08-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-09-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-09-SUMMARY.md", ".planning/phases/12-photos-on-session-authentication/12-10-PLAN.md", ".planning/phases/12-photos-on-session-authentication/12-10-SUMMARY.md", "app/server/drizzle/0031_answer_photos.sql", "app/server/drizzle/meta/0031_snapshot.json", "app/server/drizzle/meta/_journal.json", "app/server/drizzle/migrations-manifest.json", "app/server/route-inventory.txt", "app/server/src/db/schema.ts", "app/server/src/lib/db-errors.ts", "app/server/src/middleware/in-flight-gate.ts", "app/server/src/middleware/upload.ts", "app/server/src/middleware/validateParams.ts", "app/server/src/routes/answer-photos.test.ts", "app/server/src/routes/answer-photos.ts", "app/server/src/routes/docs/assets.test.ts", "app/server/src/routes/docs/assets.ts", "app/server/src/routes/index.ts", "app/server/src/routes/tests/index.ts", "app/server/src/routes/tests/registration.characterization.test.ts", "app/server/src/routes/tests/session-photos.test.ts", "app/server/src/routes/tests/session-photos.ts", "app/server/src/routes/tests/teacher-zone-tests.matrix.test.ts", "app/server/src/routes/uploads.test.ts", "app/server/src/routes/users/avatar.characterization.test.ts", "app/server/src/routes/users/avatar.ts", "app/server/src/routes/users/index.ts", "app/server/src/scripts/photo-memory-bench.ts", "app/server/src/services/access-policy/index.ts", "app/server/src/services/access-policy/scope-rules.ts", "app/server/src/services/access-policy/scope.test.ts", "app/server/src/services/access-policy/scope.ts", "app/server/src/services/access-policy/zone-loader.ts", "app/server/src/services/answer-photos/index.ts", "app/server/src/services/assets/avatars.ts", "app/server/src/services/assets/image-intake.test.ts", "app/server/src/services/assets/image-intake.ts", "app/server/src/services/assets/images.ts", "app/server/src/services/assets/index.ts", "app/server/src/services/assets/inline-images.ts", "app/server/src/services/attempt-sessions/index.ts", "app/server/src/services/storage/index.ts", "app/server/src/services/storage/keys.ts", "app/server/src/services/storage/links.test.ts", "app/server/src/test-support/attempt-world.ts", "app/web/components/tests/TestRunner.tsx", "app/web/components/tests/answer-photos/PhotoBlock.tsx", "app/web/components/tests/answer-photos/resize.ts", "app/web/components/tests/answer-photos/upload-queue.test.ts", "app/web/components/tests/answer-photos/upload-queue.ts", "app/web/components/tests/answer-photos/use-answer-photos.ts", "app/web/components/tests/attempt-lifecycle/lifecycle.ts", "app/web/lib/tests/answer-photos-api.ts", "app/web/lib/tests/upload-window.test.ts", "app/web/lib/tests/upload-window.ts", "app/web/next.config.ts", "docs/adr/0004-storage-port-two-adapters.md", "e2e/fixtures/seed.json", "e2e/tests/answer-photos.spec.ts", "packages/exam-core/src/answer-photos.ts", "packages/exam-core/src/index.ts", "scripts/check-exam-core-dist.mjs", "scripts/check-migrations.mjs", "scripts/storage-no-private-access.test.mjs", "scripts/teacher-zone-guards.test.mjs", "scripts/tests-router-composition.test.mjs"]
covered_digest: "v2:sha256:42bb60d56981340ccf25935a2a5f7fb4e29a95a6775ab2bad88c7a918ca879fc"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "PHOTO-01: на телефоне «Сделать фото» и «Выбрать из галереи»"
    addressed_in: "Phase 13"
    evidence: "Phase 13 goal: «A student can add photos to an open answer from a phone by scanning a QR code…»; Folded-in: «The phone page reuses the Phase 12 photo component». PhotoBlock уже умеет источники camera/gallery (prop sources), раннер передаёт только file"
  - truth: "Очередь фото при «Завершить» (WR-03), просмотр крупного фото (вариант full), отсчёт окна до сдачи"
    addressed_in: "Phase 14"
    evidence: "Phase 14 SC2/SC3: ответ текстом и до 5 фото, «sees until when photos can be added»; 12-10-SUMMARY «Остаток для фазы 14», окно №11"
  - truth: "Файлы answers/ остаются при каскадном удалении теста, вопроса или темы (IN-03)"
    addressed_in: "Phase 16"
    evidence: "Phase 16 SC2: «deleting a test or a user deletes their answer files, and a reconcile run finds no orphan files or rows»"
human_verification:
  - test: "Шаг пользователя 1 и 4 (12-10-SUMMARY): замер node dist/scripts/photo-memory-bench.js в отдельном контейнере образа API с лимитом памяти контейнера API, серия 30; таблицу записать в ADR-0004 строкой «Образ API (Linux)», лимит памяти контейнера выбрать по замеру"
    expected: "Пик RSS на 12 и 48 МП (JPEG, PNG, WebP) при concurrency 1 и полной очереди ниже выбранного лимита контейнера с запасом на буферы принимаемых запросов"
    why_human: "Нужен Linux-образ и контейнер с лимитом; на macOS WebP 48 МП даёт около 310 МБ на одну обработку"
  - test: "Решение владельца по WebP 48 МП (12-10-SUMMARY «Решение владельца по замеру 12-01»): отдельный меньший лимит пикселей для WebP либо не принимать WebP у фото ответа"
    expected: "Решение записано в ADR-0004 и, если меняется профиль, в IMAGE_PROFILES.answerPhoto"
    why_human: "Решение владельца после Linux-замера"
  - test: "Шаг пользователя 2: реальные снимки iPhone и Android (большой JPEG, HEIC) через --dir; читаемость тетрадной страницы при 2560 px"
    expected: "Снимки выпрямлены, читаемы, память в пределах; число HEIC — основание для пересмотра D-12"
    why_human: "Нужны реальные снимки с устройств"
  - test: "Шаг пользователя 3: Mac Safari, в раннере выбрать фото HEIC"
    expected: "Клиент уменьшает через canvas и отправляет JPEG, фото принимается; если приходит 415 HEIC — сообщить"
    why_human: "Поведение createImageBitmap для HEIC есть только в Safari"
  - test: "Шаг пользователя 5: лимит тела запроса Caddy"
    expected: "Не ниже 10 МБ плюс запас на multipart (в профиле сервера 20 МБ)"
    why_human: "Конфигурация сервера вне репозитория"
  - test: "Шаг пользователя 6: выкатка миграции 0031 по правилам профиля сервера"
    expected: "Таблица answer_photos создана; проверка загрузки — на e2e или копии данных (тип open в проде неактивен до фазы 17)"
    why_human: "Выкатка на прод выполняется пользователем"
---

# Фаза 12: Фото под входом ученика. Отчёт проверки

**Цель фазы:** вошедший ученик прикрепляет до 5 обработанных фото к открытому ответу с компьютера, видят их только владелец и проверяющие по правилу доступа, загрузки не могут исчерпать память контейнера API.
**Проверено:** 2026-10-16T13:08:09Z, рабочее дерево ветки dev (HEAD dcd0a5f плюс незакоммиченные правки ревью)
**Статус:** passed (шаги пользователя вне репозитория записаны в 12-UAT.md пунктами 5–10 как skipped с владельцем и сроком)
**Повторная проверка:** да, 2026-10-16: пробел критерия 5 закрыт в коде (`inFlightGate` до `singleFileUpload`: 9 одновременных приёмов, сверх этого 503 с `Retry-After` до чтения тела; строка ADR-0004 поправлена; тест `in-flight-gate.test.ts`), `yarn verify` и тесты маршрута зелёные

## Достижение цели

### Критерии успеха

| # | Критерий | Статус | Доказательство |
|---|----------|--------|----------------|
| 1 | В раннере (сидированный открытый вопрос) выбор файлов, уменьшение в браузере, отправка по одному с повторами, «N из 5», удаление при открытом окне, повтор без дубля, отказ шестому с понятным текстом | ✓ VERIFIED | `TestRunner.tsx:403` рендерит `PhotoBlock` для `questionUiTemplate === 'open'` при открытой сессии. `resize.ts` уменьшает до `ANSWER_PHOTO_MAX_SIDE` (2560) в JPEG. `upload-queue.ts`: один активный запрос, паузы 1000/3000/9000 мс, тот же `photoId` при повторе, лимит 5 на клиенте. Сервер: повтор по `photoId` отвечает 200 без новой строки, лимит 5 под `FOR UPDATE` сессии. Тесты: `upload-queue.test.ts` 32/32; `session-photos.test.ts` «повтор с тем же photoId… без дубля», «шесть одновременных загрузок дают ровно пять фото и отказ шестому», «при открытом окне удаляет строку и оба файла». e2e `answer-photos.spec.ts` на рабочем дереве: 30 passed (desktop и mobile, с setup), включая «сбой сети: три автоповтора, затем «Повторить» отправляет то же фото» (один `photoId` на 4 запроса) и «семь фото разом: пять готовых, лишние одной строкой» |
| 2 | JPEG, PNG, WebP и фото iPhone с поворотом принимаются; хранится WebP, выпрямленный, без метаданных и GPS, с миниатюрой; неверная сигнатура, слишком большой или неподдерживаемый файл дают 413/415/400 с текстом; аватар и медиатека отвечают теми же 4xx вместо 500 | ✓ VERIFIED | `image-intake.ts`: тип по сигнатуре (`file-type`), 400 без сигнатуры, 415 для чужого типа (отдельный текст HEIC), 413 по пикселям до декодирования, `autoOrient()`, WebP без `keepMetadata`, миниатюра 400 px. `upload.ts`: `LIMIT_FILE_SIZE` → 413, прочие ошибки multer → 400. Тесты: `image-intake.test.ts` (Orientation 6 и 8 с GPS → вертикальный WebP без EXIF и тега ориентации; текст 400, GIF/AVIF/HEIC 415, PNG 56 МП 413, битый JPEG 400), `session-photos.test.ts` (сохранённый `full.webp` вертикальный без EXIF, 413 на 10 МБ, 415/400 по типу), `uploads.test.ts` (аватар и медиатека: 400 по сигнатуре, 413 «Файл больше 5 МБ», 415 GIF у медиатеки, сломанный multipart 400). Вход WebP у профиля фото ответа проверяется только скриптом замера (строки WebP 48 МП в ADR-0004), отдельного юнит-теста нет. Реальные снимки iPhone и HEIC из Safari — проверка человеком |
| 3 | Фото отдаётся только владельцу и проверяющим по правилу доступа с `Cache-Control: private, no-store`; остальным тот же ответ, что на отсутствующий файл; общий маршрут картинок вопросов фото не отдаёт; ADR-0004 записывает, кто читает `images/` и `answers/` | ✓ VERIFIED | `routes/answer-photos.ts`: `canReadAnswerPhoto` (владелец сессии; проверяющий через `canReviewAttempt` только при `attempt_id` сессии), одинаковый 404 «Фото не найдено» для чужого, несуществующего и неизвестного варианта, заголовки `private, no-store`, `nosniff`, CORP. `NAMESPACE_READERS.answers = 'owner-and-reviewers'`, `isServableImageKey` → false, `storageUrl` бросает ошибку. Тесты: `answer-photos.test.ts` (4 теста, включая «проверяющий видит фото только после сдачи и только в разделе своей зоны»), `docs/assets.test.ts` «файл answers/… лежит в хранилище, но proxy и signed отвечают 400», `links.test.ts`. ADR-0004 раздел «Кто читает пространство». Оговорка: неверный UUID даёт 400, без входа 401 — утечки нет, но это не тот же 404 |
| 4 | Фото после закрытия окна отклоняется правилом фазы 11 с понятным текстом и не сохраняется | ✓ VERIFIED | `uploadAnswerPhoto`: проверка окна до обработки и повторно в транзакции под `FOR UPDATE`; при отказе записанные файлы удаляются. Тест `session-photos.test.ts` «после закрытия окна загрузка отклоняется 422, строки и файлов нет» и «после закрытия окна удаление отклоняется 422». Клиент: `uploadWindowRefusalText`, тест `upload-queue.test.ts` «текст отказа окна 422 совпадает с текстом UI-SPEC». e2e отказа окна нет (окно №12) |
| 5 | Фото 12 и 48 МП по нескольку сразу держат API под измеренным лимитом памяти; лимит пикселей, параллельность и отключённый кэш записаны с замером | ✗ FAILED (partial) | Записано: ADR-0004 «Обработка фото и память» и «Замер» (macOS: 50 МП, `cache(false)`, `concurrency(1)`, ограничитель 1/8, 503 у фото ответа; таблица пиков). Не обеспечено: буферы multer до ограничителя не ограничены (WR-01), строка ADR про 80 МБ не поправлена вопреки решению по WR-01, лимит памяти контейнера не выбран, Linux-замера нет, решение по WebP 48 МП (около 310 МБ на одну обработку) открыто. См. «Пробелы» |

**Счёт:** 4/5 критериев подтверждены (0 присутствуют без поведенческой проверки)

### Отложенное

| # | Что | Где | Основание |
|---|-----|-----|-----------|
| 1 | «Сделать фото» и «Выбрать из галереи» на телефоне (часть PHOTO-01) | Фаза 13 | Цель фазы 13 и «The phone page reuses the Phase 12 photo component»; `PhotoBlock` поддерживает `sources`, раннер передаёт только `file` |
| 2 | Очередь фото при «Завершить» (WR-03), просмотр `full`, отсчёт окна до сдачи | Фаза 14 | SC2/SC3 фазы 14; 12-10-SUMMARY «Остаток для фазы 14» |
| 3 | Файлы `answers/` при каскадном удалении теста, вопроса, темы (IN-03) | Фаза 16 | SC2 фазы 16 |

### Артефакты

| Артефакт | Назначение | Статус | Подробности |
|----------|-----------|--------|-------------|
| `app/server/src/services/assets/image-intake.ts` | Единый приём изображений | ✓ VERIFIED | 4 профиля; используют фото ответа, медиатека, встроенные картинки, аватар |
| `app/server/src/middleware/upload.ts` | Обёртка multer 413/400 | ✓ VERIFIED | Используется `docs/assets.ts`, `users/avatar.ts`, `session-photos.ts` |
| `app/server/drizzle/0031_answer_photos.sql` | Таблица фото | ✓ VERIFIED | Есть; прогон `with-test-db` в этой проверке накатил цепочку миграций на пустую базу, 48 тестов пишут и читают `answer_photos` |
| `app/server/src/services/answer-photos/index.ts` | Загрузка, список, удаление, чтение, удаление при удалении ученика | ✓ VERIFIED | `removeUserAnswerPhotos` вызывается в `routes/users/index.ts:265` |
| `app/server/src/routes/tests/session-photos.ts` | PUT/DELETE/GET фото под сессией | ⚠️ WIRED, без ограничения приёма | Смонтирован `/tests/public`; см. пробел WR-01 |
| `app/server/src/routes/answer-photos.ts` | Раздача фото | ✓ VERIFIED | Смонтирован `/answer-photos` |
| `app/server/src/services/storage/keys.ts` | `NAMESPACE_READERS` | ✓ VERIFIED | Используется `isServableImageKey`, `storageUrl` |
| `app/web/components/tests/answer-photos/*` | Блок фото, очередь, уменьшение | ✓ VERIFIED | Подключён в `TestRunner.tsx` |
| `docs/adr/0004-storage-port-two-adapters.md` | Правило чтения пространств, настройки и замер | ⚠️ неточная строка | Строка 73 про 80 МБ (WR-01) |

### Ключевые связи

| Откуда | Куда | Через | Статус |
|--------|------|-------|--------|
| `PhotoBlock` | `PUT/DELETE/GET …/photos` | `answer-photos-api.ts` → очередь → `useAnswerPhotos` | WIRED (e2e) |
| `PhotoBlock` `<img>` | `GET /api/answer-photos/:id/thumb` | `answerPhotoUrl` | WIRED (e2e «миниатюра Фото 1 видна») |
| `session-photos.ts` | `uploadAnswerPhoto` → `acceptImage(IMAGE_PROFILES.answerPhoto)` → `storage().write` → `answer_photos` | сервис | WIRED (тесты маршрута) |
| `answer-photos.ts` | `canReadAnswerPhoto` → `zones.answerPhotoSubject` → `canReviewAttempt` | шов доступа | WIRED (тесты маршрута) |
| Общий прокси и signed | `isServableImageKey` | `NAMESPACE_READERS` | WIRED, `answers/` → 400 |
| Удаление пользователя | `removeUserAnswerPhotos` | `routes/users/index.ts` | WIRED (тест «удаление ученика убирает его фото») |

### Поведенческие проверки (запущены в этой проверке)

| Поведение | Команда | Результат | Статус |
|-----------|---------|-----------|--------|
| Очередь фото: по одному, повторы, лимит, удаление, снимок с `limitRefusal`/`atLimit` | `yarn workspace @bio-exam/web vitest run components/tests/answer-photos/upload-queue.test.ts` | 32 passed | ✓ PASS |
| Сервер: загрузка, повтор, UUID заглавными, лимит, окно, 404/409, удаление, раздача, приём, отказы multer | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test src/routes/tests/session-photos.test.ts src/routes/answer-photos.test.ts src/services/assets/image-intake.test.ts src/routes/uploads.test.ts` | 4 файла, 48 passed | ✓ PASS |
| Блок фото в раннере на рабочем дереве (после правок ревью в `PhotoBlock`/`upload-queue`) | `node scripts/e2e.mjs e2e/tests/answer-photos.spec.ts` | 30 passed (44,4 с), desktop и mobile | ✓ PASS |

Полные `yarn verify` и `yarn e2e` не запускались: по 12-10-SUMMARY они прошли на dcd0a5f. Незакоммиченные правки `BankExplorer.tsx`, `bank.spec.ts`, `teacher-zone.spec.ts` (переименование пункта меню) к фазе 12 не относятся и в этой проверке не прогонялись.

### Покрытие требований

| Требование | Описание | Статус | Доказательство |
|------------|----------|--------|----------------|
| PHOTO-01 | Выбор файлов с компьютера; на телефоне «Сделать фото» и «Выбрать из галереи» | PARTIAL (часть телефона отложена в фазу 13) | Компьютер: e2e `answer-photos.spec.ts` (`input[type=file]` с `multiple`, `accept="image/*"`). Телефон: `PhotoBlock` поддерживает `camera` (`capture="environment"`) и `gallery`, но ни один экран их не включает и тестов на них нет; реальные устройства — фазы 13 и 17 |
| PHOTO-02 | Уменьшение в браузере, по одному, повторы, без дублей | SATISFIED | `resize.ts`; `upload-queue.test.ts`; `session-photos.test.ts` повтор 200; e2e один `photoId` на 4 запроса |
| PHOTO-03 | JPEG, PNG, WebP (и iPhone из Safari), сигнатура, поворот, без метаданных, WebP и миниатюра; 4xx с текстом | SATISFIED + NEEDS_HUMAN | Тесты приёма и маршрута; HEIC из Safari и реальные снимки — шаги пользователя 2 и 3 |
| PHOTO-04 | Обработка ограничена (пиксели, параллельность, без кэша), загрузки не исчерпают память | PARTIAL + NEEDS_HUMAN | sharp ограничен и записан в ADR; буферы запросов не ограничены (WR-01), ADR неточен, Linux-замер и лимит контейнера — шаги 1 и 4 |
| PHOTO-05 | Только владелец и проверяющие, `private, no-store`, остальным как отсутствующему, не через общий прокси | SATISFIED | `answer-photos.test.ts`, `docs/assets.test.ts`, `links.test.ts` |
| PHOTO-06 | Удаление при открытом окне и счётчик «N из 5» | SATISFIED | e2e удаление «0 из 5», «5 из 5»; `session-photos.test.ts` DELETE при открытом и закрытом окне |
| DEBT-01 | Существующие маршруты загрузки отвечают 413/415/400 вместо 500 | SATISFIED | `uploads.test.ts` для `users/avatar` и `docs/assets`; мёртвый `POST /api/tests/:id/assets` удалён (12-02), других `req.file` в сервере нет |
| DEBT-07 | ADR-0004 записывает, кто читает `images/` и `answers/` | SATISFIED | ADR-0004 «Кто читает пространство»; та же таблица в коде `NAMESPACE_READERS` |

Сиротских требований нет: REQUIREMENTS.md относит к фазе 12 ровно PHOTO-01…06, DEBT-01, DEBT-07.

### Найденные антипаттерны

| Файл | Строка | Что | Важность | Влияние |
|------|--------|-----|----------|---------|
| `app/server/src/routes/tests/session-photos.ts` | 87–95 | Нет ограничения одновременных приёмов до `singleFileUpload`, нет `rateLimiter` (WR-01) | ⚠️ Warning → пробел критерия 5 | N×10 МБ в памяти до 503; сейчас недостижимо из-за D-19 |
| `docs/adr/0004-storage-port-two-adapters.md` | 73 | Оценка памяти очереди без буферов принимаемых запросов | ⚠️ Warning | Запись настроек «с замером» вводит в заблуждение |
| `app/web/components/tests/answer-photos/upload-queue.ts` | 238–240 | DELETE 404 у записи во время работы сервера над PUT (WR-02) | ℹ️ Info | Окно №10, путь узкий |
| `app/server/src/services/assets/avatars.ts` | — | Кроп аватара (`renderCrop`, `recropAvatar`) вне ограничителя sharp (12-SECURITY флаг 2, окно №8) | ℹ️ Info | Второй путь загрузки вне ограничителя памяти; отложено и записано |
| `app/server/src/services/assets/image-intake.ts` | 153–158 | Ошибки sharp при декодировании, кроме лимита пикселей, всегда 400 (WR-05 исправлен частично) | ℹ️ Info | Ресурсный сбой первого декодирования выглядит как «Файл повреждён» |

Маркеров `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` в файлах фазы нет.

### Проверка человеком

1. **Linux-замер и лимит контейнера (шаги 1 и 4).** Запустить `node dist/scripts/photo-memory-bench.js` в отдельном контейнере образа API с лимитом памяти контейнера API, серия 30; записать строку «Образ API (Linux)» в ADR-0004; выбрать лимит памяти. Ожидается: пик на 12 и 48 МП при concurrency 1 и полной очереди ниже лимита с запасом на буферы приёма.
2. **Решение по WebP 48 МП.** Около 310 МБ на одну обработку: отдельный меньший лимит пикселей для WebP либо не принимать WebP у фото ответа. Решение записать в ADR-0004 и при изменении — в `IMAGE_PROFILES.answerPhoto`.
3. **Реальные снимки (шаг 2).** iPhone и Android, большой JPEG и HEIC через `--dir`; читаемость тетрадной страницы при 2560 px; число HEIC — основание пересмотреть D-12.
4. **HEIC в Mac Safari (шаг 3).** Выбрать HEIC в раннере: ожидается JPEG от клиента и принятое фото.
5. **Caddy (шаг 5).** Лимит тела не ниже 10 МБ с запасом на multipart.
6. **Выкатка 0031 (шаг 6).** По правилам профиля сервера; проверка загрузки на e2e или копии данных.

### Пробелы

Нет. Единственный пробел первой проверки (критерий 5, буферы запросов до ограничителя sharp) закрыт: перед `singleFileUpload` стоит `inFlightGate` с лимитом `IMAGE_INTAKE_CONCURRENCY + IMAGE_INTAKE_QUEUE_LIMIT`, память под тела запросов не больше 9 по 10 МБ; ADR-0004 описывает это. Критерий 5 остаётся на проверке человеком: Linux-замер, лимит контейнера и решение по WebP.

---

_Проверено: 2026-10-16T13:08:09Z_
_Проверяющий: Claude (gsd-verifier)_
