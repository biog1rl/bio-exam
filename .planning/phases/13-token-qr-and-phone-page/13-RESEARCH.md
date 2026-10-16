# Phase 13: Token, QR and phone page - Research

**Researched:** 2026-10-16
**Domain:** ссылка-способность без входа (токен во фрагменте), страница телефона вне сессии, QR на компьютере, опрос списка фото, закрытие DEBT-02
**Confidence:** MEDIUM (серверная и веб-часть по коду: HIGH; поведение сканеров и просмотрщиков на устройствах: `[ASSUMED]`, закрывается спайком)

Метки: `[VERIFIED: путь:строки]` — открыт файл в этой сессии, значения процитированы дословно; `[CITED: url, дата]` — документация, прочитана 2026-10-16; `[ASSUMED]` — не проверено, нужна проверка владельцем или спайк. Код фазы 12 ещё исполняется другой сессией и в `dev` не весь: всё, что про `answer_photos`, `services/answer-photos`, `createPhotoUploadQueue`, `PhotoBlock`, дано «по плану 12-0N, код не весь в dev».

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 [владелец]:** Токен лежит во фрагменте адреса: `<origin>/photo-upload#<токен>`. Фрагмент не уходит серверу и не попадает в Referer, поэтому Next, Caddy и `errorHandler` токена не видят. Страница `/photo-upload` одна и статическая, в списке публичных путей стоит точным значением, а не префиксом. Страница читает `location.hash` и шлёт токен заголовком. Запасной вариант на случай, если спайк покажет потерю фрагмента в используемом ученикам браузере или просмотрщике: путь `/photo-upload/<токен>` (префикс со слэшем, тест в `proxy.test.ts`, маскировка пути в журнале Caddy владельцем). Reversibility: costly.
- **D-02 [раньше, подтверждено владельцем 2026-10-16]:** Токен непрозрачный: `randomBytes(32).toString('base64url')`, в БД `sha256` (hex), область — слот `(session_id, question_id)` (не попытка: попытки до сдачи нет, D-06 фазы 12), до 3 активных ссылок на слот, нового секрета в окружении нет. Reversibility: one-way.
- **D-03 [владелец]:** QR после перезагрузки страницы на компьютере остаётся тем же: адрес выданной ссылки кэшируется на компьютере в `sessionStorage` по ключу `<sessionId>:<questionId>`; при потере кэша (новая вкладка) выдаётся новая ссылка без отзыва прежних, поэтому открытая страница телефона не гаснет. Четвёртая выдача при трёх активных гасит самую старую (`revoked_at`). Удаление ссылок физически не делается: гаснут через `revoked_at` или каскадом с сессией.
- **D-04 [по умолчанию]:** Токен передаётся только заголовком `X-Upload-Token`; в пути, query и теле API-запросов его нет. `req.headers["x-upload-token"]` добавляется в `LOG_REDACT_PATHS` (`app/server/src/lib/logger.ts`) в той же фазе, вместе с токеном. Страница отвечает `Referrer-Policy: no-referrer`, `X-Robots-Tag`/`robots` noindex, без внешних ресурсов (шрифты, аналитика).
- **D-05 [по умолчанию]:** Выдача: `POST /api/tests/public/tests/:id/sessions/:sessionId/questions/:questionId/upload-link` под сессией входа (владелец сессии, `checkAttemptAccess`, окно открыто, вопрос шаблона `open`), ответ — токен; ссылку клиент строит из `window.location.origin`. Базу из заголовков `Origin`/`Host` (как в `buildInviteLink`, `app/server/src/routes/auth/invites.ts:25`) не берём и новую переменную окружения не заводим.
- **D-06 [владелец]:** Столбец источника `answer_photos.uploaded_via text NOT NULL DEFAULT 'session' CHECK (uploaded_via IN ('session','link'))` в той же миграции 0032, что таблица ссылок (в 0031 фазы 12 его нет). Нужен фазе 15 для пометки «загружено по ссылке».
- **D-07 [владелец в части миниатюр, остальное по умолчанию]:** Маршруты ссылки отдельны: `GET /api/upload/context`, `GET /api/upload/photos`, `PUT /api/upload/photos/:photoId` (multipart, идемпотентность и лимит 5 как у фазы 12, D-07), `DELETE /api/upload/photos/:photoId`, `GET /api/upload/photos/:photoId/thumb`. Middleware `uploadTokenRequired` полностью игнорирует `req.authUser`, не вызывает `requestAccess` и кладёт в `req.uploadScope` только `{ linkId, sessionId, questionId }` из строки ссылки; идентификаторы вопроса и сессии из пути и тела не читаются. Полноразмерных фото по ссылке нет. Маршруты получают отдельную категорию в `route-inventory.txt` и охранный тест: любой маршрут вне `/api/upload/*` отвечает 401 на один лишь заголовок токена, токен не читает чужой слот.
- **D-08 [владелец]:** Одно правило живости ссылки: токен найден по `sha256`, `revoked_at IS NULL`, сессия жива, пользователь активен (не заблокирован), назначение теста существует, `photoUploadWindow` открыто (то же правило, что на компьютере, `app/server/src/services/attempt-sessions/upload-window.ts`). Сдача теста ссылку не гасит: после `submittedAt` окно открыто до `uploadClosesAt` (тест с таймером и без лимита принимают фото после сдачи); «Готово» фазы 14 сдвигает `uploadClosesAt`, нового состояния в фазе 13 нет. Критерий 2 ROADMAP («после сдачи») читается как «после закрытия окна, наступившего после сдачи». Отзыв назначения и блокировка проверяются по текущему состоянию БД на каждом запросе. «Назначение существует» читается так же, как на cookie-пути: `isAssignedOrPrivileged` для владельца сессии (администратор или учитель, проходящий тест без назначения, не должен получить «ссылка недействительна»); правило считается по `userId`, а не по `Request` (D-23).
- **D-09 [владелец]:** Состояния отказа: токен верный, окно закрыто — отдельный ответ 422 `UPLOAD_WINDOW_CLOSED`/`UPLOAD_WINDOW_NONE` фазы 11 с временем закрытия (телефон показывает «окно закрыто»); токен неизвестен, отозван, ученик заблокирован, назначение снято, сессия закрыта — один ответ 404 «ссылка недействительна» с одинаковым телом и без различающих заголовков.
- **D-10 [владелец]:** Телефон удаляет любое фото своего вопроса (как в QR-03 и D-09 фазы 12: строка и файлы сразу, пока окно открыто).
- **D-11 [по умолчанию]:** GET без побочных эффектов: открытие адреса ботом мессенджера или сканером ничего не создаёт и не «сжигает». `last_used_at` пишется только маршрутами `/api/upload/*`.
- **D-12 [по умолчанию]:** Лимиты запросов: основной ключ — хеш токена (`rateLimiter({ keyPrefix, clientKey })` уже принимает ключ клиента, `app/server/src/middleware/rateLimiter.ts:60`), IP — вторичный мягкий и широкий ключ только для неизвестного токена; жёсткого лимита по IP нет (десятки телефонов за одним школьным роутером). Настоящая защита от перегрузки — семафор обработки фото фазы 12. Числа решает планировщик.
- **D-13 [по умолчанию]:** Ошибки загрузки на маршрутах ссылки идут через обёртку multer фазы 12 (400/413/415, 503 с `Retry-After`); повтор на клиенте только для сети, 5xx, 429 и 503.
- **D-14 [по умолчанию]:** Страница телефона — в `app/web/app/(internal)/photo-upload/` рядом с `invite`, не в `(protected)`; не вызывает `/api/auth/me`, не уходит на `/login`. Поправка к исследованию вехи: `invite` лежит не вне оболочки, а внутри `AppLayout` (корневой `layout.tsx`: `getServerMe`, `AuthProvider` с keep-alive, боковое меню, шапка с колокольчиком, `SearchDialog`), у неё пропущен только `AuthGuard`. Публичный путь задан тремя списками с разным сравнением: `PUBLIC_PREFIXES` (`app/web/proxy.ts:9`, `startsWith`), `skipPathPrefixes` в `AppLayout.tsx:70` (`startsWith`), `AUTH_PAGE_PREFIXES` (`app/web/lib/session/client.ts:40`, точное или с `/`). Решение — D-25 (один модуль публичных путей, на них оболочка не рисуется).
- **D-15 [по умолчанию]:** Состояния страницы: готово, загружается, 5 из 5, окно закрыто, ссылка недействительна, нет сети. Переходы и тексты — в UI-SPEC (`/gsd-ui-phase 13`) после спайка на устройствах. Страница показывает вопрос (текст), номер вопроса, название теста, счётчик «N из 5», оставшееся время окна по серверным секундам.
- **D-16 [по умолчанию]:** Компонент фазы 12 (`PhotoBlock`, очередь загрузки `createPhotoUploadQueue`, уменьшение в браузере) используется как есть с `sources={['camera','gallery']}`: «Сделать фото» (`capture="environment"`, без `multiple`) и «Выбрать из галереи» (без `capture`, `multiple`); везде `accept="image/*"`, не `image/heic`. Очередь получает транспорт и источник миниатюр параметрами (в 12-06 это уже зависимости), для телефона — заголовок токена и `fetch` + `URL.createObjectURL`: тег `img` заголовка не передаёт. Если для этого `PhotoBlock` нужно расширить (источник миниатюр, адреса), правка идёт отдельным планом до плана страницы.
- **D-17 [по умолчанию]:** Подсказка для встроенных просмотрщиков: если выбор файла там не работает, страница показывает «Откройте ссылку в браузере» и кнопку копирования ссылки. Условия показа и текст уточняет спайк.
- **D-18 [владелец]:** Панель компьютера: у открытого вопроса раннера под блоком фото — QR (клиентская библиотека, например `qrcode.react`; пакета нет в `package.json`, исследователь проверяет лицензию и версию) и ссылка текстом в DOM с кнопкой «Скопировать» (нужна и ученикам, и e2e, QR камерой в Playwright не читается). Фото с телефона появляются через опрос списка фазы 12 раз в 2,5 с, пока панель открыта (`refreshWhenHidden: false`); `photos_revision` и ETag не вводим (в миграции 0031 столбца нет). Панель показывается на устройствах с точным указателем; на телефоне в раннере вместо QR сразу «Сделать фото» и «Выбрать из галереи».
- **D-19 [по умолчанию]:** E2E два контекста: компьютер с `storageState`, телефон — второй `browser.newContext()` без него; ссылка берётся из DOM; фото ждёт `expect.poll`/`toBeVisible`, не `waitForTimeout`. Десктопный сценарий выполняется один раз (мобильный проект пропускает), мобильный проект проверяет страницу телефона на 375 px. Окна и таймеры управляются сервером (короткое окно в сиде), не `page.clock`.
- **D-20 [владелец]:** Картинка страницы 404 рисуется заново в SVG по концепции сайта. Файла `app/web/public/img/not-found.png` в репозитории нет (удалён в `afe2b15`), `not-found.tsx:20` ссылается на него. Черновик лежит в `.planning/phases/13-token-qr-and-phone-page/assets/not-found.svg`; план переносит его в `app/web/public/img/not-found.svg` и меняет `src`. Проверка: страница 404 грузит картинку (`naturalWidth > 0`).
- **D-21 [владелец]:** `Toaster` в коде один (корневой `app/layout.tsx`, `AppLayout` второго не содержит; журнал «разбитых окон» №2 закрыт), критерий 5 читается как «одно и то же сообщение не показывается дважды». Фаза закрепляет это проверкой e2e на одном сообщении, `visibleToasts` не меняется.
- **D-22 [по умолчанию]:** Спайк идёт до UI-SPEC и дизайна страницы телефона (ROADMAP, Research). Первый план фазы — отдельная страница-стенд для спайка (одиночный HTML без зависимостей, по образцу измерительного плана 12-01), результаты владельца формируют `13-SPIKE.md` и входят в `/gsd-ui-phase 13`. Матрица устройств и проверок — в `13-RESEARCH.md`, раздел «План спайка на устройствах». Стенд в этой сессии не строился.
- **D-23 [владелец]:** Углубить `services/answer-photos`: одна функция «слот принимает фото» от `sessionId`, `questionId` и владельца сессии (не от `Request`): активность пользователя, назначение или привилегия (как `isAssignedOrPrivileged`), принадлежность вопроса сессии и шаблон `open`, окно `photoUploadWindow`. Её вызывают маршруты фото под cookie (план 12-07) и `uploadTokenRequired`; отдельный api-план до планов маршрутов ссылки, после 12-07. (находка F1)
- **D-24 [владелец]:** Углубить `app/web/components/tests/answer-photos`: `PhotoBlock` и хук очереди принимают транспорт (список, загрузка, удаление, источник миниатюры) и режим повторной сверки со списком сервера вместо жёсткой связки с cookie-адресами слота; два адаптера — сессия входа и ссылка. Отдельный web-план до плана страницы телефона и панели QR; стартует после слияния фазы 12 (правит 12-06 и 12-09). (F2)
- **D-25 [владелец]:** Публичные пути собираются в одном модуле (`app/web/lib/navigation`, имя решает планировщик) с точным сравнением `=== p || startsWith(p + '/')` для `proxy.ts`, `AppLayout`/`AuthGuard` и `lib/session/client.ts`; на публичных путях `AppLayout` не рисует меню, шапку, колокольчик, поиск и не вызывает `getServerMe`, корневой layout не разделяется; тест: закрыты `/invites`, `/users`, `/photo-upload-x`. Отдельный web-план до плана страницы телефона. (F3)
- **D-26 [по умолчанию]:** Отложено: модуль «что не попадает в журнал» (F4), `x-upload-token` в `LOG_REDACT_PATHS`, тест на него в `logger.test.ts` и `Referrer-Policy` остаются в D-04. Отклонено: отдельный модуль лимитов (F5), решает порядок middleware по D-12.

### Claude's Discretion
Имена файлов и модулей (`services/upload-links`, `uploadTokenRequired`), точные числа лимитов запросов, интервал опроса в пределах 2–3 с, размер QR, текст подсказок и сообщений, форма ответа `GET /api/upload/context`, число миграции (0032, если 0031 фазы 12 не сдвинется).

### Deferred Ideas (OUT OF SCOPE)
- Шина событий и SSE вместо опроса списка — чаты v4.0.
- Чтение полноразмерных фото по ссылке; HEIC на сервере (`heic-decode`).
- Дизайн-контракт страницы телефона (`UI-SPEC.md`) — `/gsd-ui-phase 13` после спайка.
- Отображение пометки «по ссылке» проверяющему — фаза 15.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Описание | Что в исследовании |
|----|----------|--------------------|
| QR-01 | QR и ссылка у открытого вопроса | раздел 3 (qrcode.react, SVG, M), раздел 6 (опрос) |
| QR-02 | Ссылка умеет только фото своего слота, без входа | раздел 4 (uploadTokenRequired, живость), раздел 1 (транспорт) |
| QR-03 | Телефон добавляет и удаляет фото | разделы 2, 5 |
| QR-04 | Токен не в журналах, Referer, индексе; лимиты по токену | разделы 1, 4, 10 |
| QR-05 | Фото видны на компьютере за секунды | раздел 6 |
| DEBT-02 | Картинка 404, один `Toaster` | раздел 7 |
</phase_requirements>

## Summary

Фрагмент безопасен для сервера по построению: спецификация Referrer Policy на шаге «Strip url for use as a referrer» обнуляет fragment у любого реферера, RFC 9110 §17.11 переносит фрагмент через редиректы. Единственный реальный риск D-01 — клиентские посредники (сканеры QR, мессенджеры, VK `away.php`, Telegram WebView), которые могут потерять `#`. Источников, подтверждающих или опровергающих это для школьных устройств, не найдено: рекомендация «фрагмент, запасной путь» держится на уровне MEDIUM, а спайк — единственная проба-опровержение. Резервное `sessionStorage` из D-01 оправдано, а не декоративно.

Серверная часть почти целиком собирается из готового: образец токена (`invites.ts`), единое правило окна (`upload-window.ts`), `rateLimiter` с `clientKey`. Новое — таблица `answer_upload_links`, `uploaded_via`, `uploadTokenRequired`, сервис `upload-links`. Главные ловушки не в CONTEXT: (1) статическая страница `/photo-upload` сразу роняет `lib/navigation/sections.test.ts` (нужна запись в `NOT_LISTED`); (2) очередь 12-06 умеет только `seed` один раз, для опроса нужна команда сверки (`sync`) — правка PhotoBlock-плана D-24 обязана её включить; (3) `crypto.randomUUID` и `navigator.clipboard.writeText` не работают по http на LAN-стенде спайка; (4) Caddy при включённой директиве `log` пишет `X-Upload-Token` в журнал, если не отфильтровать.

**Primary recommendation:** фрагмент (D-01) с `sessionStorage`-копией; путь `/photo-upload/<токен>` — только если спайк покажет потерю `#` в браузерах учеников. Спайк-стенд — первый план, до UI-SPEC.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Выдача/отзыв токена | API / Backend | — | секрет и `sha256` только на сервере, права владельца сессии |
| Проверка токена и живости | API / Backend | Database | решение по текущему состоянию БД на каждом запросе (ADR-0001) |
| Лимиты по токену | API / Backend | — | `rateLimiter` в памяти, один процесс API |
| Чтение токена из `location.hash` | Browser / Client | — | фрагмент серверу не доступен |
| Публичность `/photo-upload` | Frontend Server (proxy.ts, AppLayout) | Browser (`client.ts`) | три списка путей, D-25 сводит в один модуль |
| QR-рендер | Browser / Client | — | `QRCodeSVG` без доступа к `window` при рендере |
| Опрос списка фото | Browser / Client (SWR) | API | кэш запросов без шины событий |
| Журнал без токена | API (`pino` redact) | CDN/Caddy (владелец) | два журнала: приложения и обратного прокси |
| Картинка 404 | CDN / Static (`public/img`) | Frontend Server | статический SVG, `next/image` отдаёт как есть |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `qrcode.react` | 4.2.0 | QR на компьютере (`QRCodeSVG`) | ISC, peer `react ^19`, без postinstall; SVG рендерится на сервере без `window` |
| `swr` | ^2.3.3 | опрос списка (`refreshInterval`) | `[VERIFIED: app/web/package.json:83]` `"swr": "^2.3.3",` — уже установлен |
| `sharp`, `multer`, `pino`, `drizzle` | уже в проекте | приём фото, лог, схема | ничего нового |

`[VERIFIED: npm registry, 2026-10-16]` `npm view qrcode.react`: версия 4.2.0, лицензия ISC, опубликована в 2024-12 (22 месяца назад — нейтральный факт, пакет стабилен и не требует обновлений под React 19: peer `^19`), загрузки ~9,9 млн/нед. Источник пакета найден через документацию Context7/сайт пакета и подтверждён `gsd-tools query package-legitimacy check`: OK.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `qrcode.react` | Kibo UI `qr-code` | тянет `qrcode` + `culori`, возвращает `null` на сервере и рисует в `useEffect` (мерцание, нет SSR) — отклонено |
| `QRCodeSVG` | `QRCodeCanvas` | canvas обращается к `window.devicePixelRatio` (`lib/index.js:1016` пакета); SVG чётче при масштабе и SSR-безопасен |
| готовый shadcn-компонент | — | `[VERIFIED: проба 2026-10-16]` `https://ui.shadcn.com/r/styles/new-york-v4/qr-code.json` вернул `404` (то же для `new-york/qr-code.json`), положительный контроль `.../new-york-v4/button.json` и `.../calendar.json` вернули `200`: в реестре shadcn компонента `qr-code` нет |

**Installation:**
```bash
yarn workspace @bio-exam/web add qrcode.react@4.2.0
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `qrcode.react` | npm | 9+ лет, последний релиз 2024-12 | ~9,9M/нед | github.com/zpao/qrcode.react | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none. Postinstall у пакета нет (`npm view qrcode.react scripts.postinstall` пусто).

## Architecture Patterns

### System Architecture Diagram

```
Компьютер (раннер, указатель hover:hover+fine)
  PhotoBlock + QrPanel ──POST upload-link (cookie)──► API: issue (checkAttemptAccess, окно, шаблон open)
        │ sessionStorage[sessionId:questionId] = url ◄── token (base64url, 43 симв.), в БД sha256
        │ QRCodeSVG(origin + '/photo-upload#' + token)
        └─ SWR GET фото слота, refreshInterval 2500 ◄──────────────────────────────┐
                                                                                    │
Телефон: камера → /photo-upload (статика, Next, без AppLayout-оболочки)            │
  читает location.hash → sessionStorage-копия → history.replaceState(без #)        │
  request(..., headers: X-Upload-Token) ──► Caddy (log без токена, лимит тела 20МБ)│
     ──► Express /api/upload/*                                                      │
          rateLimiter(ключ sha256(токен); IP — только неизвестному токену)         │
          uploadTokenRequired: sha256 → answer_upload_links (уникальный индекс)    │
          живость (одна функция, по текущему БД) → req.uploadScope{linkId,session,question}
          services/answer-photos «слот принимает фото» (D-23) ── FOR UPDATE сессии,
          повторная проверка окна/лимита 5, uploaded_via='link' ───────────────────►┘
```

### Recommended Project Structure
```
app/server/src/
  services/upload-links/         # issue, revoke-oldest, resolve(token)->scope|null, liveness
  middleware/uploadTokenRequired.ts
  routes/upload/                 # context, photos (list/put/delete/thumb)
  db/schema.ts                   # answer_upload_links, answer_photos.uploaded_via
app/server/drizzle/0032_answer_upload_links.sql
app/web/
  lib/navigation/public-paths.ts # D-25: единый список и сравнение
  lib/upload-link/api.ts         # единственный файл с /api/upload/* (api-routes-have-callers)
  app/(internal)/photo-upload/page.tsx
  components/tests/answer-photos/  # транспорт-адаптеры (D-24), QrPanel
  public/img/not-found.svg
```

### Pattern 1: токен как способность
`uploadTokenRequired` читает только `X-Upload-Token`, считает `sha256` и ищет по уникальному индексу хеша. Поиск по индексу равных значений не даёт оракула по времени между «похожими» токенами (сравнение секрета на равенство внутри СУБД по хешу, а не посимвольно в JS); отдельное `timingSafeEqual` не нужно, но и нельзя искать по префиксу или `LIKE`. Все отказы после найденного/ненайденного токена (неизвестен, отозван, пользователь заблокирован, назначение снято, сессия закрыта без сдачи) — один ответ 404 «Ссылка недействительна» с одним телом, не 401 (401 включает refresh-машинерию `apiFetch` и `AuthExpiredError`). 422 `UPLOAD_WINDOW_*` — только при живой ссылке.

### Pattern 2: живость в одном месте
Одна функция живости от `userId`/`sessionId` (D-23): `users.is_active`, тест опубликован и тема активна, `isAssignedOrPrivileged` (назначение ИЛИ `tests.read` владельца), затем `photoUploadWindow` — и всё это повторяется внутри транзакции загрузки после `FOR UPDATE` сессии. Вне транзакции — для GET и `context`.

### Anti-Patterns to Avoid
- **Токен в пути или query API** — попадает в `errorHandler` (`path`), журнал Caddy и Referer.
- **`uploadTokenRequired` с `req.authUser`** — cookie вошедшего ученика уезжает вместе с запросом (`credentials: 'include'`), токен должен работать одинаково с cookie и без.
- **Префикс `/photo-upload`** — `startsWith` открывает `/photo-uploadx` (ловушка C2 исследования вехи; для `/invite` уже есть).
- **401 на `/api/upload/*`** — запускает `refresh` и редирект на `/login` внутри `apiFetch`.
- **`.from(testAssignments)` в файле маршрута** — запрещено охранным тестом (раздел 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR-кодирование | свой генератор | `qrcode.react` `QRCodeSVG` | коррекция ошибок, версии, маски |
| Окно загрузки | вторая формула времени | `photoUploadWindow` / `uploadWindowState` | единственное правило, фаза 11 |
| Доступ по назначению | свой JOIN в маршруте | `isAssignedOrPrivileged` из `attempt-sessions/access.ts` | охранный тест запрещает `.from(testAssignments)` в `routes/**` |
| Лимит запросов | свой счётчик | `rateLimiter({ keyPrefix, clientKey })` | уже поддерживает ключ клиента |
| Опрос | `setInterval` + ручной fetch | SWR `refreshInterval` | дедупликация, пауза на скрытой вкладке |
| Уменьшение/приём фото | всё заново | `prepareForUpload`, `image-intake` фазы 12 | не дублировать |

## Common Pitfalls

### Pitfall 1: `sections.test.ts` падает в день создания страницы
**What goes wrong:** `staticPages(APP_DIR)` собирает каждую `page.tsx` без сегмента `[param]` и требует запись в `NAV_SECTIONS`, кроме `NOT_LISTED`. **Источник:** `[VERIFIED: app/web/lib/navigation/sections.test.ts:22]` `const NOT_LISTED = new Set(['/', '/login'])`. **Как избежать:** добавить `'/photo-upload'` в `NOT_LISTED` (не в `NAV_SECTIONS`: это добавило бы страницу в меню). Это четвёртое место публичного пути помимо трёх из D-14.

### Pitfall 2: Caddy пишет заголовок токена в журнал
**What goes wrong:** журнал доступа Caddy включается директивой `log` в блоке сайта; запрос-заголовки по умолчанию попадают в запись, `X-Upload-Token` не маскируется. `[CITED: caddyserver.com/docs/caddyfile/directives/log, 2026-10-16]` `log` опциональна, по умолчанию пишет в stderr; доступны `format filter` (`request>headers>X-Upload-Token delete`) и `log_skip`. **Как избежать:** шаг владельца 1 в разделе 10 — сначала выяснить, есть ли `log` вообще.

### Pitfall 3: `Referrer-Policy` Caddy перекрывает заголовок Next
**What goes wrong:** если Caddy задаёт `Referrer-Policy` для всех ответов, значение Next с `no-referrer` не доедет. **Как избежать:** ставить политику ещё и в `<meta name="referrer">` через `metadata.referrer = 'no-referrer'` (тип `ReferrerEnum` содержит `'no-referrer'`: `[VERIFIED: node_modules/next/dist/lib/metadata/types/metadata-types.d.ts:35]` `export type ReferrerEnum = 'no-referrer' | 'origin' | 'no-referrer-when-downgrade' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin';`). Для варианта «фрагмент» это пояс-и-подтяжки, для запасного «путь» — несущая деталь.

### Pitfall 4: опрос не видит удалений на телефоне
`seed(photos)` очереди 12-06 «создаёт done-элементы и задаёт счётчик», повторные вызовы не определены (по плану 12-06, код не весь в dev), `useAnswerPhotos` из 12-09 вызывает его один раз. Опрос каждые 2,5 с требует сверки: добавить появившиеся на сервере, убрать удалённые телефоном, не трогать `preparing/uploading/retrying`. Подробно — раздел 6.

### Pitfall 5: stub спайка по http ломает копирование и UUID
`crypto.randomUUID` и `navigator.clipboard.writeText` доступны только в защищённом контексте `[CITED: developer.mozilla.org/docs/Web/API/Crypto/randomUUID, .../Clipboard/writeText, 2026-10-16]`. Стенд по `http://<LAN-IP>:8080` даст ложный отрицательный результат «копирование ссылки не работает». См. раздел 9.

### Pitfall 6: 404 для закрытой сессии против 422 окна
`[VERIFIED: app/server/src/services/attempt-sessions/upload-window.ts:29-31]` `if (input.closedAt && !input.submittedAt) { return { open: false, reason: 'session_closed', closesAt: null } }`. Если просто пропустить это через `photoUploadWindow`, маршрут отдаст 422 `NONE`, а D-09 требует 404 для «сессия закрыта». Сервис живости должен проверять `session_closed` отдельным ветвлением до отображения причины окна в 422.

### Pitfall 7: staff без назначения (D-08)
Если проверять только `test_assignments`, администратор или учитель, проходящий тест, получит 404 «ссылка недействительна» на собственной ссылке. Нужен `isAssignedOrPrivileged` по `userId` владельца сессии.

### Pitfall 8: `PhotoBlock` из 12-09 привязан к cookie-API
Хуки `useAnswerPhotos` и вызов `answerPhotoUrl` строят адреса с cookie (по плану 12-09). Без правки D-24 страница телефона не соберётся без копипасты.

### Pitfall 9: QR из `localhost`
Адрес `window.location.origin` на dev-машине даёт `http://localhost:3000/...`, который телефон открыть не может. Вывод: QR на dev проверять только по LAN-IP или на проде/стенде; в e2e QR камерой не читается — читаются текст ссылки и кнопка «Скопировать» (D-18).

## Code Examples

### Выдача и чтение токена
```typescript
const token = randomBytes(32).toString('base64url')
const tokenHash = createHash('sha256').update(token).digest('hex')
```
Образец — `routes/auth/invites.ts` (`randomBytes`, `sha256Hex`); нового кода шифрования нет.

### QR-панель (форма, не готовая реализация)
```tsx
<QRCodeSVG value={url} level="M" marginSize={4} size={208} title="QR-код для загрузки фото с телефона" />
```
`[VERIFIED: замер в scratchpad, 2026-10-16]` URL длиной 76–81 символ при уровне `M` даёт версию 5 (37 модулей, 45 с полями `marginSize 4`); при `size=192` это 4,27 px на модуль, для камеры телефона с расстояния монитора достаточно, `[ASSUMED]` подтвердить на устройствах в спайке. `boostLevel` оставить по умолчанию.

### Заголовок токена через `request`
`[VERIFIED: app/web/lib/http/request.ts]` `RequestOptions` принимает `headers`: страница телефона ходит через `request(..., { headers: { 'X-Upload-Token': token } })`, исключение в `FETCH_EXCEPTIONS` не нужно. Для `api-routes-have-callers` все статические сегменты `/api/upload/context` и `/api/upload/photos` должны встретиться вместе в одном веб-файле — это `lib/upload-link/api.ts`.

### Опрос
```typescript
useSWR(key, fetcher, { refreshInterval: 2500, refreshWhenHidden: false, revalidateOnReconnect: true, shouldRetryOnError: false })
```
`[CITED: swr.vercel.app/docs/api, 2026-10-16]` `dedupingInterval` по умолчанию 2000 мс < 2500 — опрос не склеивается.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| токен в пути `/u/<token>` | токен во фрагменте + заголовок | серверные журналы и Referer токена не видят |
| `next/image` для SVG с оптимизацией | SVG отдаётся как есть | `[VERIFIED: node_modules/next/dist/shared/lib/get-img-props.js:280-283]` `if (isDefaultLoader && !config.dangerouslyAllowSVG && src.split('?', 1)[0].endsWith('.svg')) {` — выставляется `unoptimized = true`, `dangerouslyAllowSVG` не нужен |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Фрагмент не теряется ни у одного сканера QR/просмотрщика, используемого учениками | 1 | высокий: ссылка не работает; закрывается спайком, запасной путь описан |
| A2 | `next start` не пишет путь запросов в stdout, который подхватит `docker compose logs` | 1 | низкий для варианта «фрагмент» (в запросе нет токена); для запасного «путь» — токен в журнале |
| A3 | Числа лимитов раздела 4 (широкий IP ~600/мин, по ссылке ~120/мин, выдача ~10/мин на userId) | 4 | низкий, решает планировщик |
| A4 | Размер QR 192–224 px читается камерой телефона с монитора | 3 | средний; проверяется спайком |
| A5 | iOS Safari/Android Chrome: `capture` и `accept="image/*"` ведут себя как в документации MDN | 2 | средний; спайк |
| A6 | Школьные смартфоны открывают ссылку из камеры в системном браузере, а не во встроенном просмотрщике | 1, 9 | средний; D-17 страхует |
| A7 | `incomingRequests` в Next не отключает журнал в `next start` по умолчанию | 1 | низкий |

## Open Questions

1. **Кого из учеников реально охватывает спайк?**
   - Known: список устройств и браузеров не задан.
   - Unclear: какие телефоны есть у владельца и учеников.
   - Recommendation: раздел 9, матрица минимум 3 устройства; решение владельца — какие считать обязательными.
2. **Лимит 3 активных ссылок на слот и сценарий «ученик открыл раннер на двух компьютерах»** — четвёртая выдача гасит самую старую; открытая страница телефона по ней покажет «ссылка недействительна». Вопрос владельцу: приемлемо ли.
3. **Что показывать на телефоне при `UPLOAD_WINDOW_NONE` после сдачи без окна** — отдельный текст или тот же «окно закрыто» (по D-09 тот же код 422, различаются причиной). Решает UI-SPEC.

## 1. Транспорт токена: фрагмент или путь (D-01)

**Рекомендация:** фрагмент, уверенность MEDIUM. Запасной путь `/photo-upload/<токен>` описан ниже и готов к включению по решению после спайка.

Что проверено:
- Referer: `[CITED: w3c.github.io/webappsec-referrer-policy, §8.4 «Strip url for use as a referrer», 2026-10-16]` шаг 5 «Set url's fragment to null» (в связке с обнулением userinfo) — фрагмент вырезается из любого реферера независимо от политики. Поэтому в варианте «фрагмент» `Referrer-Policy: no-referrer` не обязателен для токена, но остаётся по D-04 и для запасного пути.
- Серверы: `[CITED: RFC 9110 §7.1, 2026-10-16]` фрагмент не входит в request-target и не отправляется на сервер; `[CITED: RFC 9110 §17.11]` при редиректе без собственного фрагмента в `Location` браузер переносит исходный. Редирект Caddy → Next не теряет `#`.
- Корневой `app/web/app/layout.tsx` уже даёт `[VERIFIED: app/web/app/layout.tsx:21]` `robots: 'noindex, nofollow'`, а Caddy уже ставит `X-Robots-Tag` и частично `Referrer-Policy` (профиль сервера). Поэтому «noindex» из D-04 уже выполняется; новое — только `metadata.referrer` на странице.
- Журнал Next: `[VERIFIED: node_modules/next/dist/server/config-shared.d.ts]` конфиг `incomingRequests` описан как `If set to false, incoming request logging is disabled.` — про dev или `next start` текст не говорит. Тэг: `[ASSUMED]` A2. Проверка владельцем: `docker compose -f /opt/bio-exam/deploy/compose.yaml logs web` и поиск `photo-upload`. Для варианта «фрагмент» токена в этих строках быть не может.

Что не подтверждено (`[ASSUMED]`, A1): сторонние потребители ссылки. Четыре поиска 2026-10-16 нашли отсутствие сообщений, а не подтверждение; по правилу «отсутствие не доказательство» это не `[VERIFIED]`. Конкретные риски, найденные в источниках:
- VK: `away.php?to=<url>` теряет `#`, если адрес не закодирован процентами (актуально при «скопировал и вставил в VK»).
- Telegram Mini Apps: в документации сказано, что маршрутизация через hash «may lose the initial hash» — довод за `sessionStorage`-копию и `history.replaceState`.
- Встроенные просмотрщики (VK, Telegram, Instagram) могут не давать выбор файла или камеру — D-17.

**Страница:** при загрузке читает `location.hash`, сохраняет токен в `sessionStorage` (переживает перезагрузку и возврат из камеры, если вкладка выгружена), затем `history.replaceState(null, '', '/photo-upload')` — токен уходит из адресной строки и из скриншотов; для случая «вернулись в страницу без hash» читает копию. Копия живёт в `sessionStorage`, не `localStorage`: закрытие вкладки её стирает.

**Запасной путь (если спайк покажет потерю `#`):** `/photo-upload/<токен>` — `proxy.ts` и `AUTH_PAGE_PREFIXES` с префиксом со слэшем (D-25 уже даёт точное сравнение `=== p || startsWith(p + '/')`), тест в `proxy.test.ts`, динамический сегмент `[token]` в `app/(internal)/photo-upload/[token]/` (автоматически вне `NAV_SECTIONS`, `sections.test.ts` его не собирает). Тогда несущими становятся `Referrer-Policy`/`meta referrer`, маскировка пути в журнале Caddy (раздел 10) и проверка журнала `web`. Изменение формы после выкатки инвалидирует открытые страницы телефона (D-01, reversibility: costly).

## 2. Камера и галерея на телефонах

- `[CITED: developer.mozilla.org/docs/Web/HTML/Attributes/capture, 2026-10-16]` атрибут `capture` — подсказка; значение `environment` просит заднюю камеру, `user` — фронтальную; браузер вправе игнорировать. Для D-16: кнопка «Сделать фото» — `<input type="file" accept="image/*" capture="environment">` без `multiple`; «Выбрать из галереи» — `accept="image/*"` без `capture`, с `multiple`.
- `accept="image/*"`, не `image/heic`: iOS Safari при `image/*` конвертирует HEIC в JPEG при выборе (поведение Safari, `[ASSUMED]` A5 — проверить в спайке: имя, тип, размер выбранного файла). Конвейер 12 принимает JPEG/PNG/WebP, HEIC на сервере отложен.
- `capture` без `multiple` — это ограничение платформы (одна съёмка за раз); для нескольких фото используется галерея.
- EXIF и поворот: сервер поворачивает по EXIF (`image-intake`, коммит 4695011); на клиенте при уменьшении canvas-путём ориентация учитывается через `createImageBitmap(file, { imageOrientation: 'from-image' })`. В спайке сравниваются размеры бит-карты для `'from-image'` и `'none'` — это проверка EXIF без библиотеки.
- Встроенные просмотрщики: часть не поддерживает `<input type=file>` или камеру; подсказка D-17 «Откройте ссылку в браузере» + кнопка копирования. Условие показа — не определяется автоматически (UA ненадёжен): показывать под кнопками постоянной небольшой строкой, а если за 30 с после нажатия `change` не случился — усилить. Точное условие и текст — спайк.
- Возврат из камеры: страница может быть выгружена системой (особенно Android при нехватке памяти); `sessionStorage` + повторная сверка со списком сервера (`GET /api/upload/photos`) восстанавливают состояние. Незавершённая загрузка пересылается по тому же `photoId` (идемпотентность фазы 12).

## 3. QR-библиотека

- Пакет `qrcode.react` 4.2.0, лицензия ISC `[VERIFIED: npm registry, 2026-10-16]`; peer `react ^19`; SSR: `QRCodeSVG` — чистая функция от свойств, без `window`; `QRCodeCanvas` использует `window.devicePixelRatio` — не брать.
- Рекомендуемые свойства: `level="M"` (15 % восстановления — запас для бликов экрана при URL ~80 символов), `marginSize={4}` (тихая зона 4 модуля, по спецификации QR), `size` 192–224, `title` для скринридера. Версия не фиксируется вручную (`minVersion` по умолчанию).
- Замер 2026-10-16 (скрипт в scratchpad, не в репозитории): 76 символов → версия 5, 37 модулей, 45 с полями; при `size=192` 4,27 px на модуль.
- Готовый компонент: shadcn — нет (проба выше, 404); Kibo UI `qr-code` — отклонён (нет SSR, лишние зависимости). Свой тонкий `QrPanel` над `QRCodeSVG`: QR + ссылка текстом + «Скопировать». Правило «сначала готовое» из CLAUDE.md соблюдено: готовая — библиотека, оболочка обязательна, потому что нужны текст и кнопка.
- Показ панели: только `@media (hover: hover) and (pointer: fine)`; `window.matchMedia` в `useSyncExternalStore` (SSR-безопасно) или CSS `hidden`/`block`-варианты Tailwind. На телефоне (грубый указатель) в раннере показываются «Сделать фото» и «Выбрать из галереи».
- Копирование: `navigator.clipboard.writeText` с обработкой отказа (http, запрет разрешения) → запасной `textarea.select(); document.execCommand('copy')`; ссылка всё равно в DOM текстом.

## 4. Серверная часть

### Схема и миграция 0032
- `answer_upload_links`: `id uuid PK`, `session_id` FK → `test_sessions ON DELETE CASCADE`, `question_id` FK → `questions ON DELETE CASCADE` (D-02 «Integration Points»), `token_hash text NOT NULL` с **уникальным индексом**, `created_at`, `revoked_at timestamptz NULL`, `last_used_at timestamptz NULL`. Индекс «активные ссылки слота» `(session_id, question_id) WHERE revoked_at IS NULL`. Время — `now()` базы, как в 0031.
- `answer_photos.uploaded_via text NOT NULL DEFAULT 'session' CHECK (uploaded_via IN ('session','link'))` (D-06). Сервис 12-07 значение не передаёт (по плану 12-07) — после D-23 функция «слот принимает фото» получает параметр источника; существующие вызовы остаются на умолчании `'session'`.
- Правила миграций проекта: `lock_timeout` в начале файла, запись в `meta/_journal.json` и `migrations-manifest.json` (так делает 0031: `[VERIFIED: ls app/server/drizzle]` последний файл `0031_answer_photos.sql`), проверка цепочки из пустой БД делает `yarn verify`. Применённые миграции не правятся.
- ADR-0007: `[VERIFIED: docs/adr/0007-user-deletion-rule.md]` — для таблицы с ключом на пользователя правило удаления. В `answer_upload_links` прямого ключа на `users` нет (только сессия и вопрос, обе с `CASCADE`), значит таблица подпадает под правило косвенно; `user-deletion-rule.test.ts` должен остаться зелёным без исключений (CONTEXT, Integration Points). Если планировщик добавит `created_by`, это уже ключ на пользователя и потребует решения по ADR-0007.

### Порядок блокировок и единая живость
1. Вне транзакции: `resolve(token)` (индексный поиск) → строка ссылки с `session_id`, `question_id`.
2. Загрузка: транзакция → `SELECT … FOR UPDATE` строки `test_sessions` (как cookie-путь фазы 12) → повторить живость (пользователь активен, назначение/привилегия, тест опубликован, окно) → подсчёт фото слота (лимит 5) → вставка/идемпотентность по `photoId`. Это тот же порядок блокировок, что у cookie-маршрутов: сначала сессия, потом слот; тупика не создаёт.
3. Освежение `last_used_at` — отдельным запросом **после** фиксации, не в транзакции под блокировкой сессии, и только на `/api/upload/*` (D-11); GET `context` может писать `last_used_at`, но не создавать и не отзывать.
4. Отказы: 404 «Ссылка недействительна» (единое тело, без `Retry-After`, без различающих заголовков), 422 `UPLOAD_WINDOW_CLOSED`/`UPLOAD_WINDOW_NONE` + время закрытия. Не 401 и не 403.

`[VERIFIED: app/server/src/services/attempt-sessions/upload-window.ts:32-36]`
```
	if (input.submittedAt) {
		if (!input.uploadClosesAt) return { open: false, reason: 'no_window', closesAt: null }
		if (input.now.getTime() < input.uploadClosesAt.getTime()) return { open: true, closesAt: input.uploadClosesAt }
		return { open: false, reason: 'window_closed', closesAt: input.uploadClosesAt }
	}
```
Следствие для фазы 14: «Готово» ставит `upload_closes_at = now` → `window_closed` без нового состояния, D-08 выполняется; тест без лимита времени и не сданный: `open, closesAt: null` (строка 37).

### Живость: чего не хватает по сравнению с `loadSessionUser`
`loadSessionUser` фильтрует `users.is_active = true`; у ссылки сессии пользователя нет, поэтому живость делает собственный JOIN с `users` по владельцу сессии. `uploadTokenRequired` не вызывает `requestAccess` и не читает `req.authUser`.

### rateLimiter, ключи и числа (A3)
`[VERIFIED: app/server/src/middleware/rateLimiter.ts:65-66]` `const client = clientKey?.(req) || clientIp(req) || 'unknown'` / `const key = keyPrefix ? \`${keyPrefix}:${client}\` : client`.
- Слой 1 (до поиска токена): ключ `sha256(заголовок)` без обращения к БД — оракула нет; для запроса без заголовка — IP. Широкий мягкий IP-слой нужен только как защита от перебора неизвестных токенов: рекомендация `maxAttempts` ~600/мин на IP (школьный NAT, десятки телефонов).
- Слой 2 (после резолва): ключ `linkId`, ~120/мин на ссылку (список + загрузки + удаления + миниатюры одного ученика).
- Выдача `upload-link`: ключ `userId`, ~10/мин.
- Цена: карта `Map` лимитера растёт одной записью на каждый различный случайный токен до очистки раз в 5 минут — ограничено, но поэтому для неизвестного токена нужен вторичный IP-ключ.
- Настоящая защита от перегрузки — семафор обработки фото фазы 12 (503 + `Retry-After`).

### Журнал и redact
`[VERIFIED: app/server/src/lib/logger.ts:7]` `export const LOG_REDACT_PATHS = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]']`. Добавить `'req.headers["x-upload-token"]'` — квадратные скобки нужны из-за дефиса. `logger.test.ts` доказывает, что `req.headers` сериализуются в `req.log.*`; тест на токен пишется по его образцу. `errorHandler` в `app.ts` логирует `path`, не тело: при D-04 токена там быть не может (в варианте «путь» — может, тогда маска).

### Охранные тесты и инвентарь
- `route-inventory.txt`: новая категория для `/api/upload/*`; охранный тест по D-07 (маршрут вне `/api/upload/*` отвечает 401 на один лишь `X-Upload-Token`; токен не читает чужой слот).
- `[VERIFIED: scripts/attempt-integrity-guards.test.mjs:105-108]` `.from(testAssignments) вне управления назначениями: назначение проверяет canReadTest`; тест сканирует файлы `SERVER_ROUTES` (`assignmentQueryViolations`, строки 195-198), т.е. `app/server/src/routes/**`: поиск назначения только через `services/upload-links` или `isAssignedOrPrivileged`, не в файле маршрута.
- ADR-0006 пока Proposed; `sessionRequired` стоит на маршрутах поштучно. `/api/upload/*` — новые анонимные маршруты: когда механизм 1 ADR-0006 появится, им понадобится запись в `PUBLIC_ROUTES`.
- `test-support/auth-app.ts`: `call()` не принимает заголовки — для серверных тестов с `X-Upload-Token` нужен вариант вызова с заголовками (небольшое расширение тест-инфраструктуры в первом серверном плане).

## 5. Страница телефона в оболочке

Три списка публичных путей (D-14) плюс четвёртое место (`sections.test.ts`):

`[VERIFIED: app/web/proxy.ts:8-9]` `const PUBLIC_PATHS = new Set(['/login'])` / `const PUBLIC_PREFIXES = ['/invite']`; `isPublicPath` использует `pathname.startsWith(prefix)` — ловушка C2 уже есть для `/invite`.
`[VERIFIED: app/web/components/AppLayout/AppLayout.tsx:70]` `<AuthGuard redirectTo="/login" skipPaths={['/login']} skipPathPrefixes={['/invite']}>`.
`[VERIFIED: app/web/lib/session/client.ts:40]` `const AUTH_PAGE_PREFIXES = ['/login', '/invite']`.
`[VERIFIED: app/web/lib/navigation/sections.test.ts:22]` `const NOT_LISTED = new Set(['/', '/login'])`.

Правки (с D-25 всё идёт из одного модуля публичных путей, точное сравнение `=== p || startsWith(p + '/')`):
- `proxy.ts`: `/photo-upload` — точное значение (не префикс). `proxy.test.ts:170,277` (`test.each`) пополняются `/photo-upload`; закрытые контрпримеры `/invites`, `/users`, `/photo-upload-x`.
- `AppLayout.tsx`: `/photo-upload` в `skipPaths` (точное), не в `skipPathPrefixes`. Достаточно ли этого для D-14 «меню и шапка не показываются»: сейчас `<AuthGuard>` без `redirectTo` отдаёт `fallback=null`, пока `me = null`, поэтому меню, колокольчик и кнопка поиска скрываются сами; `SearchDialog` вне любого guard, но запрашивает только при открытии. D-25 требует большего (оболочка не рисуется и `getServerMe` не вызывается на публичных путях) — тогда `AppLayout` на публичных путях возвращает `children` без `AuthProvider`.
- `client.ts`: `/photo-upload` в `AUTH_PAGE_PREFIXES` (структура «точное или со слэшем» уже есть).
- `sections.test.ts`: `'/photo-upload'` в `NOT_LISTED`.
- `AuthProvider` с `initialMe = null`: на монтировании `refresh()` не вызывается, но интервал 10 минут и обработчик видимости вызывают `/api/auth/me` → 401 → `loadMe` возвращает `rejected`, без навигации. Безвредно, но показывает, что вырезать `AuthProvider` на публичных путях нельзя «заодно», пока D-25 не меняет `AppLayout` целиком; планировщик решает один способ.
- `web-requests-guards`: страница ходит только через `request` с `headers`; `FETCH_EXCEPTIONS` не растёт. Для `api-routes-have-callers` — один файл `lib/upload-link/api.ts`.
- Обработка `404 NOT_FOUND` внутри `apiFetch`: 401 не используется (раздел 4), поэтому цепочка refresh → `AuthExpiredError` не запускается.
- Первичная отрисовка: корневой layout `force-dynamic` и без внешних шрифтов на странице (D-04); `metadata` страницы: `robots: noindex`, `referrer: 'no-referrer'`.

## 6. Опрос 2,5 с и сверка очереди

- SWR на компьютере: `refreshInterval: 2500`, `refreshWhenHidden: false`, `revalidateOnReconnect: true`, `shouldRetryOnError: false`; опрос включён, пока панель QR смонтирована (ключ `null` выключает).
- Пробел контракта фазы 12: `seed(photos)` вызывается один раз. Для опроса нужна команда очереди `sync(serverPhotos)`: добавляет фото, появившиеся на сервере (`status: done`), убирает удалённые телефоном, не затрагивает элементы в состояниях `preparing/uploading/retrying`, обновляет счётчик. CONTEXT D-16/D-24 уже резервирует отдельный план правки PhotoBlock до плана страницы — **включить `sync` в него**.
- Хук на телефоне: тот же `sync`, опрос того же списка по `GET /api/upload/photos`, чтобы телефон видел фото, добавленные с компьютера (лимит «N из 5» общий).
- Дублирование: фото с компьютера и телефона — один слот, лимит 5 общий; идемпотентность по `photoId` защищает от повторов.

## 7. DEBT-02

- Картинка 404: `app/web/public/img/not-found.svg`, в `not-found.tsx` `src="/img/not-found.svg"`, `next/image` остаётся (SVG автоматически `unoptimized`, см. State of the Art). Файл `assets/not-found.svg` (11 688 байт) проверен grep: нет `script`, `foreignObject`, `font-family`, внешних ссылок кроме `xmlns`. Проверка e2e: `naturalWidth > 0` и `complete` для элемента картинки на странице 404.
- `Toaster`: `[VERIFIED: app/web/app/layout.tsx:50]` `<Toaster />` — единственный, в корневом layout; `AppLayout` второго не содержит. Критерий 5 по D-21: e2e вызывает одно действие, дающее тост, и проверяет `[data-sonner-toaster]` ровно 1 и один `[data-sonner-toast]` на одно сообщение (образец — `e2e/tests/editor-validation.spec.ts:46`). `visibleToasts` не менять.

## 8. E2E двух контекстов

- Конфигурация `[VERIFIED: e2e/playwright.config.ts:50,56]` проекты `name: 'chromium-desktop'` и `name: 'chromium-mobile'` (плюс `setup`); страница телефона проверяется на 375 px. Сценарий «компьютер ↔ телефон» выполняется один раз: `test.skip(testInfo.project.name !== 'chromium-desktop')`.
- Контекст телефона: `browser.newContext()` без `storageState`, `isMobile`/`hasTouch` по необходимости; ссылка берётся из DOM (текст панели QR), открывается в втором контексте, фото грузится `setInputFiles`; на компьютере ждём `expect.poll`/`toBeVisible`, не `waitForTimeout`.
- Быстрые пути состояний без ожидания: `photoUploadWindowMinutes: 0` + сдача → `UPLOAD_WINDOW_NONE` (детерминированно); отзыв назначения — существующий `DELETE /api/users/:userId/test-assignments/:testId` из админ-контекста → «ссылка недействительна». `createOwnTest` `photoUploadWindowMinutes` не передаёт, `seed.json` передаёт (фаза 11: API сохранения принимает всегда). `UPLOAD_WINDOW_CLOSED` по времени проверять серверными тестами со `shiftStartedAt`, не e2e.
- Мобильный проект получает ссылку API-запросом выдачи (D-19) и открывает страницу.
- Запуск e2e (`yarn e2e`) выполняет исполнитель плана; в этой фазе исследования ничего не запускалось.

## 9. План спайка на устройствах

**Цель:** снять неопределённость A1, A4–A6 до UI-SPEC. Результаты владельца оформляются в `13-SPIKE.md`.

**Стенд** (первый план фазы): одиночный `spike.html` без зависимостей, по образцу 12-01; сервится так, чтобы телефон мог его открыть.
- Режим HTTPS: `mkcert` + простой TLS-прокси (`[ASSUMED]` mkcert есть у владельца), либо
- режим HTTP по LAN (`python3 -m http.server`; Python 3.9.6 есть на машине). В нём `crypto.randomUUID` и `navigator.clipboard.writeText` недоступны (secure context): страница использует `crypto.getRandomValues` для id и `textarea.select(); document.execCommand('copy')` как запасной путь; в чек-листе результат «не работает по http» помечать как артефакт защищённого контекста, а не как отказ устройства.
- Страница показывает: `navigator.userAgent`, `location.hash` (длина и первые 6 символов токена-пустышки), round-trip `sessionStorage`, `pageshow.persisted`, `online`/`offline`; для каждого выбранного файла — имя, тип, размер, размеры бит-карты для `imageOrientation: 'from-image'` и `'none'`.
- QR для стенда генерируется скриптом на Node (`renderToStaticMarkup` + `QRCodeSVG`), токен-пустышка во фрагменте: `https://<хост>/spike.html#AAAA…` (43 символа).

**Матрица (минимум):**

| Устройство / среда | Открытие из QR | Фрагмент цел | `capture` камера | Галерея `multiple` | HEIC→JPEG | Копирование | Возврат из камеры |
|---|---|---|---|---|---|---|---|
| iPhone, Safari (камера iOS) | | | | | | | |
| iPhone, Chrome | | | | | | | |
| Android, Chrome (камера Google/производителя) | | | | | | | |
| Android, Samsung Internet | | | | | | | |
| Яндекс.Браузер (Android) | | | | | | | |
| Ссылка из Telegram (встроенный просмотрщик) | | | | | | | |
| Ссылка из VK (`away.php`) | | | | | | | |
| Ссылка из WhatsApp / сканер QR стороннего приложения | | | | | | | |

**Проверки на каждую строку:** 1) QR открывается; 2) `#` на месте после загрузки (длина hash 44 с символом `#`); 3) после «Сделать фото» страница не потеряла токен (`sessionStorage`); 4) «Выбрать из галереи» отдаёт несколько файлов; 5) HEIC превращается в JPEG; 6) EXIF-поворот корректен; 7) «Скопировать» работает (в HTTPS-режиме); 8) переход в офлайн и обратно виден; 9) QR с монитора читается при размере 192, 208, 224 px и коэффициентах яркости экрана.

**Критерии:**
- **Фрагмент принят**, если во всех строках, где ученики реально открывают ссылку (системная камера, Chrome/Safari и один мессенджер), `#` цел; при потере в одной строке — решение владельца: расширить `sessionStorage`-подход или переходить на путь.
- **Переход на путь**, если `#` теряется в системной камере или основном браузере ученика.
- **D-17**: в строках, где нет выбора файла или камеры, фиксируется текст подсказки и условие показа.
- **A4**: QR читается с первой попытки в 3 из 3 строк.

**Решения по итогам:** (1) фрагмент или путь; (2) условие и текст D-17; (3) размер QR; (4) нужен ли явный HEIC-путь (иначе остаётся отложенным).

## 10. Шаги владельца для Caddy

Агенты на серверах не работают; команды выполняет владелец (профиль `~/.claude/servers/bio-exam.md`). Правило pipefail профиля: `grep -n … файл`, не `cmd | grep -q`. По одной команде в блоке.

Есть ли директива журнала в Caddyfile:
```bash
grep -n '^\s*log' /opt/bio-exam/deploy/caddy/Caddyfile
```
Если вывод пуст, журнала доступа нет и маскировать нечего. Если директива `log` есть — владелец дописывает в её блок фильтр заголовка (синтаксис `[CITED: caddyserver.com/docs/caddyfile/directives/log, 2026-10-16]`; проверить `validate` до `reload`):
```
log {
	format filter {
		request>headers>X-Upload-Token delete
	}
}
```
Если у существующей `log` уже есть `format` или `output`, фильтр вкладывается в тот же блок, а не создаёт второй `log`. Проверка и применение конфига:
```bash
docker compose -f /opt/bio-exam/deploy/compose.yaml exec caddy caddy validate --config /etc/caddy/Caddyfile
```
```bash
docker compose -f /opt/bio-exam/deploy/compose.yaml exec caddy caddy reload --config /etc/caddy/Caddyfile
```
Тело запроса не меньше лимита фото (`request_body max_size`, при превышении Caddy отвечает 413 `[CITED: caddyserver.com/docs/caddyfile/directives/request_body, 2026-10-16]`; сейчас 20 МБ при лимите фото 10 МБ — достаточно, менять не требуется).

Проверки после выкатки:
```bash
curl -sI https://bio-exam.ru/photo-upload
```
Ожидать `Referrer-Policy` и `X-Robots-Tag` в заголовках ответа.
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://bio-exam.ru/api/upload/context
```
Ожидать JSON-ответ API с кодом 404 (не страницу обслуживания): это подтверждает, что `/api/upload/*` проксируется на `api:4000`.
```bash
grep -n 'photo-upload' /opt/bio-exam/deploy/caddy/Caddyfile
```
Если в Caddyfile есть отдельный путь `/photo-upload*` — убедиться, что он не перехватывается обработчиком обслуживания.
```bash
docker compose -f /opt/bio-exam/deploy/compose.yaml logs --since 10m web
```
Поиск `photo-upload` в выводе — глазами, без токена; в варианте «фрагмент» токена в журнале быть не может (A2).

## Поправки к CONTEXT

1. **Четвёртое место публичного пути:** `lib/navigation/sections.test.ts:22` (`NOT_LISTED`) — не названо в D-14/D-25. Добавить в план D-25.
2. **`sync` очереди для опроса:** D-16/D-24 говорят про транспорт и «режим повторной сверки»; сделать явным требованием — команда `sync` в очереди 12-06 (раздел 6).
3. **D-09 против `photoUploadWindow`:** `session_closed` в окне возвращает 422 `NONE`; D-09 требует 404. Сервис живости различает до вызова `uploadWindowRefusal`.
4. **`uploaded_via`:** сервис 12-07 значение не передаёт; D-23 должен добавить параметр источника в функцию «слот принимает фото» (иначе строка получит умолчание `'session'` даже при загрузке по ссылке).
5. **`test-support/auth-app.ts` `call()` не принимает заголовки:** первый серверный план расширяет тест-инфраструктуру.
6. **Secure context в спайке и на dev:** `crypto.randomUUID`/`clipboard` и QR с `localhost` (раздел 9, Pitfall 9).
7. **Caddy `log`:** шаг владельца 1 вместо предположения, что журнал есть (раздел 10).

## Где риски (по убыванию)

1. Потеря фрагмента в реальных сканерах/просмотрщиках (A1) — закрывается спайком; запасной путь описан.
2. Очередь без `sync` (опрос не видит удалений; рассинхрон «N из 5»).
3. Тонкие расхождения D-08/D-09 (закрытая сессия 404 против 422; staff без назначения).
4. Утечка токена через журналы (Caddy `log` / `redact` забыт / путь в запасном варианте).
5. `sections.test.ts` и четыре списка путей — падение в первый день.
6. Лимиты за школьным NAT (числа A3).
7. Встроенные просмотрщики без выбора файла (D-17).
8. Контрактная зависимость от кода фазы 12, который ещё не в `dev` (D-24 стартует после её слияния).

## Открытые вопросы владельцу

1. Какие телефоны и браузеры у учеников обязательны для спайка (матрица раздела 9)?
2. Приемлемо ли, что четвёртая выдача ссылки гасит самую старую и открытая страница телефона переходит в «ссылка недействительна»?
3. Выполнить ли шаг Caddy 1 сейчас (есть ли `log`) — от ответа зависит, нужна ли маскировка?
4. Нужен ли отдельный текст для `UPLOAD_WINDOW_NONE` после сдачи без окна?

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | сборка, скрипт QR-замера | ✓ | 24 (`.nvmrc`) | — |
| Yarn 4.12 (Corepack) | установка `qrcode.react` | ✓ | 4.12 | — |
| PostgreSQL 17 | серверные тесты миграции 0032 | через `yarn verify` (свой временный) | 17 | — |
| Python 3 | стенд спайка по HTTP | ✓ | 3.9.6 | `npx http-server` |
| `mkcert` | HTTPS-режим стенда | `[ASSUMED]` не проверялся | — | HTTP-режим с запасными путями |
| Физические телефоны | спайк | у владельца | — | эмулятор не заменяет (камера, просмотрщики) |

Missing dependencies with no fallback: физические устройства для спайка (владелец).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (серверные и веб-тесты), Playwright (e2e), `node:test` для `scripts/*.test.mjs` |
| Config file | per-workspace `vitest.config.*`, `e2e/playwright.config.ts` |
| Quick run command | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- upload` |
| Full suite command | `yarn verify` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QR-02 | токен читает только свой слот; чужой слот и маршруты вне `/api/upload/*` закрыты | server integration + guards | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` | Wave 0 |
| QR-02/D-09 | 404 единое тело; 422 окно закрыто; отозван/заблокирован/назначение снято/сессия закрыта | server integration | то же | Wave 0 |
| QR-04 | `x-upload-token` redacted | unit | `yarn workspace @bio-exam/server test -- logger` | расширить `logger.test.ts` |
| QR-04/D-12 | лимит по токену, неизвестный токен — IP | unit | серверный тест | Wave 0 |
| QR-01 | публичные пути закрыты/открыты | unit | `yarn workspace @bio-exam/web test -- proxy` | расширить `proxy.test.ts` |
| QR-01 | `/photo-upload` не в меню | unit | `sections.test.ts` | расширить |
| QR-03/05 | телефон ↔ компьютер, удаление, 5 из 5 | e2e двух контекстов | `yarn e2e` | Wave 0 |
| DEBT-02 | `naturalWidth > 0` на 404; один `Toaster`, один тост | e2e | `yarn e2e` | Wave 0 |
| QR-05 | `sync` очереди (добавляет, убирает, не трогает активные) | unit | веб-тесты очереди | Wave 0 |
| миграция 0032 | цепочка из пустой БД, `uploaded_via` CHECK, каскады | `yarn verify` migrations | `yarn verify` | Wave 0 |

### Sampling Rate
- **Per task commit:** релевантный quick-run тест.
- **Per wave merge:** `yarn verify`.
- **Phase gate:** `yarn verify` зелёный; `yarn e2e` отдельно (не входит в verify); ручной спайк на устройствах.

### Wave 0 Gaps
- [ ] серверные интеграционные тесты `upload-links` и охранный тест инвентаря
- [ ] расширение `auth-app.ts` `call()` заголовками
- [ ] тесты очереди `sync`
- [ ] e2e двух контекстов, DEBT-02
- [ ] спайк-стенд (`spike.html`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | частично | ссылка-способность вместо входа: непрозрачный токен 256 бит, хеш в БД |
| V3 Session Management | нет (токен не сессия); `sessionStorage` на телефоне — копия токена | замена адреса через `history.replaceState` |
| V4 Access Control | да | скоуп только из строки ссылки, живость по БД на каждый запрос, ADR-0001 |
| V5 Input Validation | да | multer-обёртка фазы 12, лимит 5, тип по сигнатуре (`image-intake`) |
| V6 Cryptography | да | `crypto.randomBytes`, `sha256`; не изобретать |
| V7 Logging | да | redact `x-upload-token`, маскировка в Caddy |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Утечка токена в Referer/журнал/индекс | Information Disclosure | фрагмент, заголовок, redact, `no-referrer`, noindex |
| Перебор токенов | Spoofing | 256 бит, 404 единым ответом, широкий лимит IP |
| Чужой слот по ссылке | Elevation of Privilege | скоуп из строки ссылки, идентификаторы из пути/тела не читаются |
| Фото ссылки соседом/репетитором | Spoofing | `uploaded_via='link'` (фаза 15 показывает), короткая жизнь ссылки |
| Бот мессенджера «сжигает» ссылку | DoS | GET без побочных эффектов (D-11) |
| Загрузка после закрытия окна | Tampering | повторная проверка под `FOR UPDATE` сессии |
| SVG-вставка в 404 | Tampering | статический SVG без скриптов, `next/image` без `dangerouslyAllowSVG` |

## Sources

### Primary (HIGH confidence)
- Код проекта: `app/web/proxy.ts`, `AppLayout.tsx`, `client.ts`, `sections.test.ts`, `request.ts`, `app/layout.tsx`; `app/server/src/{middleware/rateLimiter.ts, lib/logger.ts, services/attempt-sessions/upload-window.ts, routes/auth/invites.ts}`; `docs/adr/0001,0004,0007`; `node_modules/next/dist/{shared/lib/get-img-props.js, lib/metadata/types/metadata-types.d.ts, server/config-shared.d.ts}`.
- npm registry: `qrcode.react` 4.2.0, ISC (2026-10-16).

### Secondary (MEDIUM confidence)
- w3c.github.io/webappsec-referrer-policy §8.4; RFC 9110 §7.1, §17.11; caddyserver.com/docs (log, log_skip, request_body); swr.vercel.app/docs/api; developer.mozilla.org (capture, Crypto.randomUUID, Clipboard.writeText); ui.shadcn.com/r (404) — все прочитаны 2026-10-16.

### Tertiary (LOW confidence)
- Поведение VK `away.php` и Telegram Mini Apps с фрагментом — по найденным в поиске формулировкам, не подтверждено на устройствах.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — пакет проверен реестром и замером.
- Architecture: HIGH для сервера и веб-оболочки (по коду); MEDIUM для клиентской части (код фазы 12 не в `dev`).
- Pitfalls: HIGH для найденных по коду; LOW для поведения сканеров и просмотрщиков.

**Research date:** 2026-10-16
**Valid until:** 2026-11-15 (код фазы 12 меняется; пересмотреть после её слияния)
