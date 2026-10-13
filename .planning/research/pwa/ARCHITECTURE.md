# Architecture Research: PWA и Web Push (milestone v5.0)

**Домен:** установка веб-приложения и доставка push как нового канала общего журнала уведомлений (bio-exam, Next.js 16 + Express 4 + PostgreSQL 17, один Beget VPS).
**Дата исследования:** 2026-10-06
**Общая уверенность:** MEDIUM. Точки интеграции в коде прочитаны напрямую (H). Поведение push-служб, iOS и Declarative Web Push подтверждено первоисточниками частично (M); доставка из России и поведение реальных устройств не проверяются без устройств и VPS (L до спайка).

Уровни: **H** — код репозитория или спецификация прочитаны напрямую; **M** — два независимых источника или первоисточник плюс прежнее исследование (`.planning/research/chat/FEATURES-PWA.md`); **L** — один источник, вендорный блог или оценка.

Про шов исследования: уровни по `gsd_run query classify-confidence` для провайдеров `webfetch` и `websearch` выданы кодом (`webfetch` без перекрёстной проверки = LOW, `websearch` с `--verified` = MEDIUM). Факты из Next.js-гайда и WebKit-блога я перекрёстно сверил с `chat/FEATURES-PWA.md` и поднял до M только там, где они совпали. Вызов `research-plan` не использовался: вопросы закрывались чтением кода и точечными WebFetch/WebSearch.

## 0. Главное (решения, а не варианты)

| # | Решение | Почему |
|---|---------|--------|
| 1 | **Первый шаг milestone: проверка исходящей доступности push-служб с VPS** (`fcm.googleapis.com`, `web.push.apple.com`, `updates.push.services.mozilla.com`). Выполняет пользователь | В списке сетевых проверок 2026-10-05 (`~/.claude/servers/bio-exam.md`) этих хостов нет. Если FCM и APNs недоступны с VPS, канал `webpush` мёртв, остальная архитектура бессмысленна. Запасной ход: исходящий прокси (`PUSH_HTTPS_PROXY`, `web-push` поддерживает опцию `proxy`) |
| 2 | Отправляет push **Express** (модуль `services/push`), а не server actions Next, как в гайде Next.js | ADR-0001: база, подписки и права живут только в `app/server` |
| 3 | **Воркер доставки живёт внутри процесса API**, запускается из `app/server/src/index.ts` под флагом, не из `app.ts`. `FOR UPDATE SKIP LOCKED`, аренда строки (`lease_until`), опрос раз в 5 с | Один процесс API, ~30 учеников, единицы событий в час; Compose сейчас содержит `api`, `web`, `migrate`. Отдельный контейнер нужен только при втором процессе API. Модуль пишется как `runOnce()` плюс тонкий цикл, поэтому вынос в `dist/scripts/push-worker.js` стоит один файл |
| 4 | **Одна строка `notification_delivery(channel='webpush')` на событие.** Раскладка по устройствам делается при отправке по живым подпискам; успехи по устройствам записываются в `delivered_to uuid[]` на строке доставки, сбои и 404/410 — на `push_subscription` | v3.0 не обязан писать строки по устройствам. Повтор после частичного сбоя пропускает уже доставленные устройства |
| 5 | **Подписка привязана к `auth_sessions.id` и удаляется внутри `revokeSession` и `revokeUserSessions`** (`app/server/src/services/session/index.ts`), плюс проверка живой сессии при отправке | Любой путь отзыва (выход, replay refresh, отзыв администратором, блокировка, смена пароля) останавливает push на устройство. `sessionId` стабилен при ротации refresh (`rotateRefreshToken` сохраняет `sessionId`) |
| 6 | **Сервис-воркер минимальный:** `push`, `notificationclick`, `message`, `fetch` только для навигаций с запасной страницей `/offline.html`. Никакого кэша страниц, RSC, `/api/*` и `_next/static` | Все страницы `force-dynamic` за `getServerMe()`, содержимое персональное. Прекэш оболочки невозможен без утечки на общем устройстве. `fetch`-обработчик нужен ради автоматического запроса установки в Chrome |
| 7 | **Свой `public/sw.js` + `web-push` в Express.** Serwist не берём | Нет прекэша, значит нет задачи для Serwist; ноль зависимостей в сервис-воркере |
| 8 | **Открытый ключ VAPID отдаётся API (`GET /api/push/config`), нулевое число новых env-ключей в web** | `NEXT_PUBLIC_*` вшивается при сборке на сервере (`~/.claude/servers/bio-exam.md`); `scripts/lib/e2e-web-env.mjs` требует явно задавать каждый ключ `app/web/.env*`; ADR-0001 оставляет web без серверной конфигурации. Ротация ключа не требует пересборки образа |
| 9 | **Payload Declarative Web Push без текста сообщения**, один JSON для Safari 18.4+ и для обработчика `push` в сервис-воркере | Страховка от отзыва подписки iOS после трёх непоказанных уведомлений и бесплатный бейдж (`app_badge`) |
| 10 | **Клик ведёт на обычный маршрут (`deep_link` из журнала) с параметром `?n=<eventId>`**; новой проверки доступа не нужно | Цепочка `proxy.ts` → `/login?callbackUrl=` (`safeCallbackPath`) → гейты маршрутов → обработчик Express уже перепроверяет доступ по текущему состоянию БД. Страница-посредник `/n/[id]` отвергнута: лишний переход и второе место с маппингом «вид → маршрут» |
| 11 | **Один счётчик непрочитанного: `count(notification_event WHERE recipient=me AND read_at IS NULL)`**; чтение чата в v4.0 обязано ставить `read_at` событиям этого чата в той же транзакции, что и `last_read_seq` | Иначе шапка, вкладка, `app_badge` и `setAppBadge` расходятся |
| 12 | Подавление дублей по присутствию (SSE) **не делаем**. Только дросселирование и схлопывание на сервере, плюс короткая задержка перед отправкой с пропуском, если событие уже прочитано | Свёрнутое iOS-PWA не держит SSE, «онлайн» по потоку ненадёжен. Задержка с проверкой `read_at` опирается на факт чтения, а не на присутствие |

## 1. Верхнеуровневая схема

```
Браузер / установленное PWA                         VPS (Docker Compose)                              Внешние
┌───────────────────────────────┐        ┌─────────────────────────────────────────────┐        ┌──────────────────┐
│ Страница (Next client)        │  HTTPS │ Caddy                                       │        │ FCM / APNs /     │
│  PwaRegistrar, PushOptIn,     ├───────►│  /api/* → api:4000   остальное → web:3000   │        │ Mozilla autopush │
│  InstallPrompt, badge-sync    │        └───────┬─────────────────────────┬───────────┘        └────────▲─────────┘
│            │ postMessage      │                │                         │                             │
│ ┌──────────▼────────────────┐ │        ┌───────▼─────────┐       ┌───────▼─────────────────────────────┴───┐
│ │ public/sw.js              │ │        │ web (next start)│       │ api (Express, один процесс)             │
│ │  push → showNotification  │ │        │ app/manifest.ts │       │  routes/push, routes/notifications      │
│ │  notificationclick        │◄┼────────┤ public/sw.js    │       │  services/push: subscriptions,          │
│ │  fetch(navigate)→offline  │ │  push  │ headers()       │       │   endpoint-policy, planner, worker,     │
│ └───────────────────────────┘ │ (шифр.)│ proxy.ts        │       │   sender-port(web-push | fake), janitor │
└───────────────────────────────┘        └─────────────────┘       │  services/session (revoke → удалить     │
                                                                   │   подписки сессии)                      │
                                                                   └───────────────┬─────────────────────────┘
                                                                                   │
                                                                   ┌───────────────▼─────────────────────────┐
                                                                   │ PostgreSQL 17                           │
                                                                   │ notification_event / _delivery (v3.0)   │
                                                                   │ push_subscription, notification_*pref   │
                                                                   └─────────────────────────────────────────┘
```

Журнал событий пишется в транзакции производителя (v3.0 «работа проверена», v4.0 сообщение чата). Планировщик канала `webpush` вызывается из того же места и в той же транзакции. Воркер забирает готовые строки, шифрует payload и отправляет. Страница получает счётчик по HTTP (и по SSE из v4.0) независимо от push.

## 2. Что уже есть в репозитории и затрагивается (H)

| Файл | Факт | Следствие для v5.0 |
|------|------|--------------------|
| `app/web/proxy.ts` | Matcher `/((?!api\|_next/static\|_next/image\|favicon.ico\|robots.txt\|sitemap.xml\|uploads).*)`; без cookie отдаёт редирект на `/login` | `/sw.js`, `/manifest.webmanifest`, `/icons/*`, `/offline.html` в matcher не исключены. Обновление сервис-воркера и загрузка манифеста идут без cookie или без refresh и получат 307 на `/login`: регистрация SW падает («script resource is behind a redirect»), манифест не читается. **Обязательное изменение** matcher и `proxy.test.ts` |
| `app/web/next.config.ts` | Нет `headers()`, rewrites `/api/:path*` только при заданном `API_ORIGIN`, `output: 'standalone'` не включён | Заголовки `/sw.js` задаём в `headers()` (работает под `next start` и в e2e) |
| `app/web/app/layout.tsx` | `viewport` содержит только `themeColor`; `icons: { icon: '/favicon.svg' }`; `html style overflow:hidden`; `force-dynamic` | Добавить `viewportFit: 'cover'` (его же просит `chat/UI.md`), `appleWebApp`, `icons.apple`. Манифест подхватится из `app/manifest.ts` |
| `app/web/public` | Только `img/` | Иконки PNG, `offline.html`, `sw.js` — новые файлы |
| `app/web/components/providers/AuthProvider.tsx` | `logout`: `sessionClient.logout()` → `setMe(null)` → `localStorage 'logout'` → `window.location.assign(LOGGED_OUT_PATH)`. Принудительный отзыв (401) идёт по другой ветке: `redirectToLogin` в `app/web/lib/session/client.ts` | Очистка на клиенте обязана выполняться до `assign` и ещё раз при заходе на `/login` (покрывает ветку 401) |
| `app/web/lib/session/redirect.ts` | `buildLoginRedirect(path+search)`, `safeCallbackPath` отбрасывает внешние адреса | Глубокая ссылка с `?n=` переживает вход |
| `app/server/src/services/session/index.ts` | `revokeSession(sessionId, reason, tx?)` вызывается из `endSession` (выход) и `classifyRepeat` (replay). `revokeUserSessions(userId, {exceptSessionId, reason}, tx?)` — отдельная функция со своим `UPDATE` | Точек отзыва **две**, обе в одном модуле. Удаление подписок кладётся в обе внутри `tx` |
| `app/server/src/routes/auth/logout.ts` | Читает cookie, вызывает `endSession`, чистит cookie | Не меняется: `endSession` → `revokeSession` |
| `app/server/src/index.ts` | `app.listen`, `gracefulShutdown`: `pgPool.end()` стартует сразу, выход через 5 с | Воркер стартует здесь; `stop()` до `pgPool.end()` |
| `app/server/src/app.ts` | Импортируется без прослушивания порта; helmet CSP касается только ответов API | Воркер не стартует из `app.ts`: тесты и контейнер `migrate` его не получат |
| `app/server/src/services/access-policy` | `canReviewAttempt`, `canManageStudent`, `groupScope` и др. | Новых проверок для клика не нужно; push-маршруты используют `sessionRequired()` |
| `app/server/route-inventory.txt`, `route-inventory.snapshot.test.ts`, `scripts/teacher-zone-guards.test.mjs` | Инвентарь маршрутов проверяется в `yarn verify` | Новые маршруты `/api/push/*` и `/api/notifications/*` обновляют снимок |
| `scripts/check-env-contract.mjs`, `scripts/env-contract.config.json` | Каждый `process.env.X` в `app/server/src` и `app/web` должен быть в `.env.example` | Новые серверные ключи — в `app/server/.env.example`. В web новых ключей нет |
| `app/web/lib/http/request.ts`, `scripts/web-requests-guards.test.mjs` | Вызовы API идут через типизированный слой запросов | Новые вызовы `/api/push/*` — функции в этом слое, не голый `fetch` |
| `app/web/components/tests/attempt-lifecycle/storage-keys.ts` | Черновики попытки лежат в **`localStorage`** (ключи по `testId` и `userId`), не в IndexedDB | Очистка при выходе не должна стирать журнал ответов попытки (ядро продукта). Исходящая очередь чата v4.0 в IndexedDB должна быть ключована по `userId` и чиститься при выходе |
| `e2e/playwright.config.ts` | `workers: 1`, проекты `setup`, `chromium-desktop`, `chromium-mobile`, web на `http://127.0.0.1` | `127.0.0.1` — защищённый контекст, сервис-воркер регистрируется. WebKit и Firefox в проекте нет |
| Сервер (вне Git, `~/.claude/servers/bio-exam.md`) | Caddy: `/api/*` → `api:4000`, остальное → `web:3000`; Caddyfile, compose, `api.env`, `web.env` лежат в каталоге выкатки на сервере вне Git; HTTP/3 выключен; выкатка `deploy.sh` пересоздаёт `api web`, не выкатывает при незавершённых попытках; фоновых задач и cron нет | Файлы сервера агент не меняет: правки Caddy и `api.env` — инструкции пользователю через `server-deploy`. Воркер будет первой фоновой задачей API |

## 3. Новые и изменяемые компоненты

### 3.1. Новые

| Компонент | Путь | Ответственность |
|-----------|------|-----------------|
| Хранилище подписок | `app/server/src/services/push/subscriptions.ts` | upsert по `endpoint`, перепривязка пользователя и сессии, лимит 10 на пользователя, удаление по сессии, список для настроек |
| Политика адресов | `app/server/src/services/push/endpoint-policy.ts` | Проверка `https`, суффикса хоста из белого списка, длины, формата ключей |
| Порт отправки | `app/server/src/services/push/sender.ts` (+ `sender.web-push.ts`, `sender.fake.ts`) | `send(subscription, payload, {ttl, urgency, topic}) → {status, retryAfterSec?}`; шаблон «порт и адаптеры» из ADR-0004 |
| Сборщик payload | `app/server/src/services/push/payload.ts` | JSON Declarative Web Push из вида события и настроек получателя |
| Планировщик канала | `app/server/src/services/push/planner.ts` | В транзакции производителя решает, создавать ли строку доставки `webpush`: подписки, предпочтения, дросселирование, часы тишины |
| Воркер | `app/server/src/services/push/worker.ts` | `runOnce()` и цикл: захват, раскладка по подпискам, исходы, повтор; `start()/stop()` |
| Уборщик | `app/server/src/services/push/janitor.ts` | Удаление подписок с мёртвой сессией, истёкших, давно неуспешных; старых доставок |
| Конфигурация | `app/server/src/config/push.ts` | VAPID, флаги, быстрая ошибка в production при `PUSH_ENABLED=1` без ключей (как `config/auth.ts`) |
| Маршруты push | `app/server/src/routes/push/index.ts` | `GET /config`, `PUT /subscription`, `DELETE /subscription`, `GET /subscriptions`, `POST /test` |
| Скрипт ключей | `app/server/src/scripts/generate-vapid-keys.ts` | Печать пары VAPID в stdout; команда `yarn workspace @bio-exam/server …` (должна существовать для `check-docs-commands`) |
| Миграция | `app/server/drizzle/00NN_push.sql` | Таблицы раздела 4; номер выдаётся после миграций v3.0 и v4.0 |
| Манифест | `app/web/app/manifest.ts` | `/manifest.webmanifest` |
| Сервис-воркер | `app/web/public/sw.js`, `app/web/public/offline.html` | Раздел 8 |
| Иконки | `app/web/public/icons/` | 192, 512, maskable 512 (PNG), `apple-touch-icon` 180 |
| Клиентский слой PWA | `app/web/lib/pwa/` | `register.ts`, `push-client.ts` (подписка, сверка, отписка), `install.ts` (`beforeinstallprompt`, определение iOS/standalone), `badge.ts`, `session-end.ts` (реестр очистки при завершении сессии) |
| Компоненты | `app/web/components/pwa/` | `PwaRegistrar`, `PushOptIn`, `InstallPrompt`, `DevicesList` |
| Запросы | `app/web/lib/push/requests.ts` | Типизированные вызовы `/api/push/*` |
| ADR | `docs/adr/0006-push-delivery.md` | Фиксирует решения 3, 4, 5, 6 (воркер в процессе API; сервис-воркер не кэширует персональное содержимое) |

### 3.2. Изменяемые

| Компонент | Что меняется |
|-----------|--------------|
| `app/web/proxy.ts` и `proxy.test.ts` | Исключить из matcher `sw.js`, `manifest.webmanifest`, `icons/`, `offline.html`; строка в таблице теста |
| `app/web/next.config.ts` | `headers()` для `/sw.js` (раздел 8) |
| `app/web/app/layout.tsx` | `viewportFit: 'cover'`, `appleWebApp`, `icons.apple` |
| `app/web/components/AppLayout/AppLayout.tsx` | Смонтировать `PwaRegistrar` внутри `AuthProvider` |
| `app/web/components/providers/AuthProvider.tsx` | `logout` вызывает очистку (`runSessionEndCleanup`) до `assign` |
| Страница `/login` (`app/web/app/(internal)/…/login`) | При монтировании вызывает ту же очистку (покрывает принудительный отзыв) |
| Колокольчик и центр уведомлений v3.0 | Источник бейджа, `?n=` помечает прочитанным, CTA включения push |
| `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx` | Раздел «Уведомления и приложение»: устройства, тест, установка |
| `app/server/src/services/session/index.ts` | Удаление подписок в `revokeSession` и `revokeUserSessions` в той же транзакции |
| Модуль журнала v3.0 (`services/notifications`) | Точка регистрации планировщиков каналов; значения политики push по видам событий (раздел 5.4) |
| `app/server/src/index.ts` | Старт и остановка воркера |
| `app/server/src/routes/index.ts`, `route-inventory.txt`, снимок | Монтирование и инвентарь |
| `app/server/.env.example` | Ключи раздела 6 |
| Модуль чата v4.0 | Чтение диалога ставит `read_at` событиям `collapse_key = chat:{id}`; очистка IndexedDB-очереди при выходе |

## 4. Модель данных (набросок, не миграция)

### 4.1. Что должен содержать журнал v3.0, чтобы v5.0 был чисто аддитивным

Если v3.0 столбцов не создаст, v5.0 начнёт с миграции `ALTER TABLE ... ADD COLUMN`; блокирующей зависимости нет, это снижение стоимости.

```
notification_event
  id uuid pk, recipient_user_id uuid fk, kind text,
  subject_type text, subject_id uuid,
  deep_link text,                      -- относительный путь, например /tests/...; формирует производитель
  collapse_key text null,              -- chat:{chatId}, review:{attemptId}
  params jsonb null,                   -- только несекретные параметры отрисовки
  created_at timestamptz, read_at timestamptz null, expires_at timestamptz null
  idx (recipient_user_id, created_at desc)
  idx (recipient_user_id) WHERE read_at IS NULL

notification_delivery
  id uuid pk, event_id uuid fk ON DELETE CASCADE,
  channel text,                        -- 'inbox' | 'webpush'
  status text,                         -- pending | retry | sent | skipped | failed | expired
  attempts int default 0, next_attempt_at timestamptz, lease_until timestamptz null,
  last_error text null, sent_at timestamptz null, created_at timestamptz,
  UNIQUE (event_id, channel)
```

### 4.2. Добавляет v5.0

```
notification_delivery  (аддитивно)
  recipient_user_id uuid null,         -- заполняется только для webpush; нужен частичному индексу
  collapse_key text null,
  delivered_to uuid[] not null default '{}',   -- push_subscription.id, куда уже доставлено
  UNIQUE (recipient_user_id, collapse_key) WHERE channel='webpush' AND status IN ('pending','retry')
  idx (next_attempt_at) WHERE channel='webpush' AND status IN ('pending','retry')

push_subscription
  id uuid pk default gen_random_uuid(),
  user_id uuid not null REFERENCES users ON DELETE CASCADE,
  session_id uuid not null REFERENCES auth_sessions(id) ON DELETE CASCADE,
  endpoint text not null, endpoint_hash char(64) not null UNIQUE,   -- sha256(endpoint)
  p256dh text not null, auth text not null,
  expiration_time timestamptz null,
  vapid_key_id text not null,          -- первые 16 символов sha256 открытого ключа
  platform text not null,              -- ios_pwa | android | desktop | other, по User-Agent при регистрации
  device_label text not null,          -- «Safari, iPhone», без отпечатка браузера
  created_at, last_registered_at, last_success_at null, last_failure_at null,
  failure_streak int not null default 0
  idx (user_id)

notification_settings               -- если v4.0 её не создала
  user_id uuid pk, timezone text not null default 'Europe/Moscow',
  quiet_enabled boolean default true, quiet_from time default '21:00', quiet_to time default '09:00',
  push_preview boolean default false, sound boolean default false

notification_preference             -- хранятся только отклонения от умолчаний вида
  user_id uuid, channel text, kind text, enabled boolean, PRIMARY KEY (user_id, channel, kind)
```

Принадлежность настроек: `chat/FEATURES-PWA.md` §7.5 относит часы тишины, звук и превью к MVP v4.0. Если v4.0 их выпустит, v5.0 только читает; иначе первая фаза v5.0 создаёт `notification_settings`. **Источник часового пояса:** `Intl.DateTimeFormat().resolvedOptions().timeZone` с клиента при первом сохранении, умолчание `Europe/Moscow`; решение для клиента не нужно.

Умолчания по видам живут в коде (`services/notifications/kinds.ts`), не в БД: `{ push: boolean, graceSec, ttlSec, urgency, throttleMin }`. Пример: `review.graded` — `{ push: true, graceSec: 20, ttlSec: 86400, urgency: 'normal', throttleMin: 0 }`; `chat.message` — `{ push: true, graceSec: 20, ttlSec: 3600, urgency: 'normal', throttleMin: 30 }`.

## 5. Модель подписок и конвейер доставки

### 5.1. Жизненный цикл подписки

1. **Включение (жест пользователя).** `PushOptIn` объясняет смысл, затем по нажатию: `Notification.requestPermission()` → `registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey})`. Ключ берётся из `GET /api/push/config`. На iOS вне установленного PWA кнопка заменяется инструкцией по установке.
2. **Регистрация.** `PUT /api/push/subscription {endpoint, keys, expirationTime}` под `sessionRequired()`. Сервер определяет `platform` и `device_label` по User-Agent, проверяет политику адреса (5.2) и делает `INSERT ... ON CONFLICT (endpoint_hash) DO UPDATE SET user_id, session_id, p256dh, auth, vapid_key_id, last_registered_at`. **Перепривязка по конфликту гарантирует, что физический профиль браузера привязан ровно к одному пользователю.** Лимит 10 устройств на пользователя: старейшее по `last_registered_at` вытесняется.
3. **Сверка при каждом старте приложения** (`push-client.ts`), если разрешение выдано и пользователь включал push на этом устройстве (флаг `push-optin:<userId>` в `localStorage`): сравнить `getSubscription()` с сервером; другой `endpoint` или другой `applicationServerKey` (смена VAPID) → отписаться и подписаться заново, `PUT`. Автоподписка без флага запрещена: на общем устройстве разрешение, выданное пользователем А, не означает согласия пользователя Б; Б видит кнопку «Включить» без повторного системного запроса.
4. **Несколько устройств.** Строка на устройство и сессию. Установленное iOS-PWA и вкладка Safari — разные устройства с разными сессиями и `endpoint`; push работает только у PWA.
5. **Отключение пользователем.** `DELETE /api/push/subscription {endpoint}` (владелец) плюс `subscription.unsubscribe()` в браузере. Чужой `endpoint` → 204 без действия.
6. **Выход и отзыв сессии.** Серверная гарантия: `revokeSession` и `revokeUserSessions` удаляют подписки этой сессии в той же транзакции. Клиентская очистка (раздел 9) — best-effort. Проверка живой сессии при отправке — страховка для случаев без отзыва (истёк refresh-токен): `EXISTS auth_sessions.revoked_at IS NULL`, `EXISTS refresh_tokens (revoked_at IS NULL AND expires_at > now())`, `users.is_active`.
7. **Очистка по исходам push-службы.** 404 и 410 → строка удаляется сразу. Истёкший `expiration_time` и `failure_streak ≥ 10` без успеха 7 дней → удаляет уборщик.
8. **`pushsubscriptionchange`.** В v5.0 не обрабатывается в сервис-воркере: сверка при старте (п. 3) покрывает ротацию, а у SW нет надёжной сессии для `PUT`. Опциональное улучшение позже.

### 5.2. Политика адреса (защита от SSRF)

`endpoint` присылает клиент, а сервер делает по нему исходящий POST из сети Docker. Без проверки аутентифицированный пользователь превращает API в прокси к внутренним хостам (`db`, `web`, `uptime-kuma`). Правило: схема `https`, нет userinfo, порт 443, длина ≤ 2048, хост оканчивается на один из суффиксов `fcm.googleapis.com`, `.push.apple.com`, `.push.services.mozilla.com`, `.notify.windows.com` (M; список проверить в планировании, Яндекс Браузер и Samsung Internet идут через FCM). Ключи: `p256dh` — 65 байт (87 символов base64url), `auth` — 16 байт (22 символа). В изолированном e2e (`BIO_EXAM_ISOLATED_ENV=1`) дополнительно допускается хост `127.0.0.1` через отдельный флаг; в production флаг игнорируется.

### 5.3. Конвейер

```
производитель (v3.0/v4.0) ─ tx ─► INSERT notification_event
                                  inbox-планировщик  → INSERT delivery(channel='inbox')
                                  webpush-планировщик → INSERT delivery(channel='webpush') | UPDATE | ничего
COMMIT
                         (каждые 5 с) воркер push:
claim:  UPDATE ... SET lease_until = now()+60s, attempts = attempts+1
        WHERE id IN (SELECT id ... WHERE channel='webpush' AND status IN ('pending','retry')
                     AND next_attempt_at <= now() AND (lease_until IS NULL OR lease_until < now())
                     ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED)
для каждой строки:
  1. событие уже прочитано (read_at) или истекло → status='skipped'|'expired'
  2. получатель: живые подписки (сессия жива, пользователь активен, vapid_key_id совпадает), минус delivered_to
  3. нет подписок → 'skipped'
  4. payload = buildPayload(kind, event, settings, unreadCount)
  5. sender.send() по каждой подписке (параллелизм 5, таймаут 10 с)
  6. исход по устройству: 201/202 → delivered_to += id, last_success_at
                          404/410 → DELETE push_subscription
                          400/401/403 → ошибка конфигурации: лог error, строка 'failed', без повтора
                          413 → 'failed' (ошибка payload)
                          429 → повтор с Retry-After (потолок 6 ч)
                          5xx/сеть/таймаут → повтор с откатом
  7. все живые устройства доставлены → 'sent'; остались недоставленные → 'retry', next_attempt_at по откату
```

**Откат:** 30 с → 2 мин → 10 мин → 1 ч → 6 ч, ±20 % джиттера; после шестой попытки или по `expires_at` вида — `failed`/`expired`. Заголовок `TTL` = остаток до `expires_at` (не больше `ttlSec` вида). `Urgency: normal`.

**Идемпотентность.** Уникальность `(event_id, channel)` защищает от повторной вставки при повторе производителя. Гарантия доставки «минимум один раз»: падение между ответом push-службы и записью `sent` даст редкий дубль. Смягчение: `Topic` и `tag` одного ключа схлопывают дубль в Chromium; на iOS `tag` не работает, дубль допустим. Перезапуск контейнера при выкатке (`up -d --wait`) рвёт отправку в полёте: аренда истекает за 60 с, строка отправляется повторно с учётом `delivered_to`.

**Устойчивость воркера.** Цикл ловит все исключения, при ошибке БД ждёт с откатом, на `stop()` дожидается текущей отправки не дольше 3 с. Учесть известную нестабильность (`flaky-answer-keys-jsonb`: необработанная ошибка PG `57P01` при закрытии базы): воркер стартует только из `index.ts` и никогда при импорте; тесты вызывают `runOnce()` напрямую.

### 5.4. Схлопывание, дросселирование, задержка, часы тишины, предпочтения

- **`Topic`** ≤ 32 символов base64url: `base64url(sha256(collapse_key)).slice(0, 32)`. Он схлопывает только недоставленные сообщения в очереди push-службы, показанное уведомление не заменяет.
- **`tag`** в payload = `collapse_key` (Chromium и Firefox заменяют уведомление; iOS игнорирует).
- **Дросселирование (реальный механизм на iOS).** Планировщик не создаёт новую доставку, если по `(recipient, collapse_key)` уже есть `pending`/`retry` (тогда `ON CONFLICT DO UPDATE SET event_id = новое`, побеждает последнее), либо есть `sent`-доставка моложе `throttleMin` минут, чьё событие всё ещё не прочитано. Ограничение по времени нужно, чтобы не замолчать навсегда, если прежний push не дошёл (доставка в РФ «по возможности»).
- **Задержка `graceSec`** (по умолчанию 20 с, env `PUSH_GRACE_SEC`, 0 отключает): `next_attempt_at = now() + graceSec`; перед отправкой проверка `read_at`. Если пользователь читает диалог прямо сейчас, push не уходит. Это не присутствие по SSE.
- **Часы тишины:** `next_attempt_at = max(now()+graceSec, конец окна в часовом поясе получателя) + 0–120 с`. Накопленные события одного `collapse_key` уходят одним push.
- **Предпочтения:** `notification_preference` с отклонениями от умолчания вида; канал `inbox` не отключается. Превью текста (`push_preview`) для учеников по умолчанию выключено; фото и имена файлов в payload не кладутся никогда.
- **Не создаём строк для вида, у которого `push: false`, и для пользователя без живых подписок.** События, созданные до включения push, не досылаются.
- **Открытый продуктовый вопрос:** откладывать ли push, пока у получателя идёт попытка теста (`test_sessions` без завершения), чтобы уведомление не отвлекало на экзамене. Дёшево реализуется в планировщике; решение за клиентом.

## 6. VAPID и контракт окружения

| Ключ | Где | Значение |
|------|-----|----------|
| `PUSH_ENABLED` | `app/server/.env.example` | `0` по умолчанию: выкатка «тёмным», включение отдельным шагом |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `app/server/.env.example` (плейсхолдеры) | Пара P-256. Закрытый ключ только в `api.env` на сервере (600, вне Git), как остальные секреты |
| `VAPID_SUBJECT` | `app/server/.env.example` | `mailto:` или `https:` URL; Apple отклоняет токен с недопустимым `sub`. Нужен контактный адрес (вопрос к пользователю) |
| `APP_ORIGIN` | `app/server/.env.example` | Для абсолютных `navigate` в payload; в web-окружении уже есть `APP_ORIGIN` и `NEXT_PUBLIC_APP_ORIGIN`, серверу ключ нужен отдельно |
| `PUSH_GRACE_SEC`, `PUSH_POLL_MS` | `app/server/.env.example` | Задержка и период опроса; в e2e уменьшаются |
| `PUSH_HTTPS_PROXY` | `app/server/.env.example` (необязательный) | Запасной выход при недоступности push-служб напрямую |

- Генерация: `generate-vapid-keys.ts` (или `npx web-push generate-vapid-keys` на стороне пользователя). Открытый ключ клиент получает из `GET /api/push/config`; никаких `NEXT_PUBLIC_VAPID_*`.
- **Смена VAPID-ключа обнуляет все подписки** (привязка к `applicationServerKey`). Поэтому `vapid_key_id` хранится в строке, воркер отправляет только на совпадающие, клиент при старте переподписывается (5.1 п. 3).
- `config/push.ts` падает при старте в production, если `PUSH_ENABLED=1` и ключи пусты или не пара.
- Версия `web-push` 3.6.7, последнее изменение 2024-01-16, зависимости `http_ece`, `jws`, `asn1.js`, `https-proxy-agent` (`npm view`, H). Опции `TTL`, `urgency`, `topic` (≤ 32 символов), `timeout`, `proxy`, `contentEncoding`. Поля ошибки по README: `statusCode`, `headers`, `body`; **`Retry-After` разбираем сами из `err.headers`**. Совместимость с Node 24 проверить при установке (H для версии, L для совместимости).

## 7. Сервис-воркер: сборка, раздача, обновление

- **Файл:** рукописный `app/web/public/sw.js` на обычном JS, без бандлера. Область `/` (файл в корне). Регистрация: `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })` из `PwaRegistrar` после `load`.
- **Заголовки.** Основной источник — `app/web/next.config.ts` `headers()` для `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type: application/javascript; charset=utf-8`, `Content-Security-Policy: default-src 'self'; script-src 'self'` (так в гайде Next.js 16.3.8, M). Это в репозитории, проверяется e2e под `next start`. Страховка на сервере — строка Caddyfile, которую применяет пользователь (агент файлы сервера не трогает, Caddyfile в каталоге выкатки на сервере, перечитать `caddy reload`):

  ```
  @sw path /sw.js
  header @sw Cache-Control "no-cache, no-store, must-revalidate"
  ```

  Проверка после выкатки: `curl -sI https://bio-exam.ru/sw.js`. Манифест и иконки: умолчания Next.
- **Исключение из `proxy.ts`** (раздел 2) — часть этой же работы; без него на устройстве без cookie обновление SW получит 307.
- **Обновление после автовыкатки.** Браузер перепроверяет `sw.js` при навигации (`updateViaCache: 'none'` и `no-cache` дают байтовое сравнение каждый раз); долгоживущему окну PWA страница вызывает `registration.update()` на `visibilitychange`, если проверка была больше часа назад. Новая версия вызывает `self.skipWaiting()` и `clients.claim()`: сервис-воркер без кэшей и без состояния, протокол со страницей — два типа сообщений, неизвестные игнорируются, поэтому окно «ждущего» воркера не нужно и баннер «обновите страницу» не нужен. `deploy.sh` не выкатывает при незавершённых попытках, и SW в попытке состояния не держит.
- **Версионирование.** Прекэша нет, поэтому версия сводится к байтам файла. Единственный кэш `static-v1` (`offline.html`, иконки); имя меняется вручную при изменении этих файлов, `activate` удаляет остальные кэши. Отдельных охранных тестов на файл не заводим (`test-hygiene`).
- **Сопутствующая неприятность, не вызванная SW:** после выкатки открытая вкладка просит старые `_next/static/chunks/*`, которых нет в новом образе. Прекэшем и `skipWaiting` проблема не усиливается, потому что SW эти запросы не обрабатывает.

## 8. Что кэширует сервис-воркер и как он живёт с авторизованными страницами

| Запрос | Поведение |
|--------|-----------|
| Навигация (`request.mode === 'navigate'`) | `event.respondWith(event.preloadResponse ?? fetch(event.request))`; при сетевой ошибке — `caches.match('/offline.html')`. **Ответ навигации не кэшируется никогда.** Включена `navigationPreload`, чтобы пустой запуск SW не добавлял задержку |
| `/api/*`, RSC-запросы (заголовок `rsc`, `?_rsc=`), не-GET, чужие origin | Обработчик не вызывает `respondWith`: браузер ходит как без SW. Никаких кэшей, cookie SW не видит и не трогает |
| `/_next/static/*`, `/img/*` | Не перехватываются: HTTP-кэш браузера (immutable) достаточен |
| `/offline.html`, `/icons/*` | Предкэш в `static-v1`; страница общая, данных пользователя нет |

Эффект: Cache Storage не содержит ничего персонального ни при каких сценариях, утечка на общем устройстве невозможна по построению. Офлайн-оболочка авторизованных страниц не поддерживается намеренно (все страницы `force-dynamic` за `getServerMe()`); черновики попытки уже живут в `localStorage` и от SW не зависят. Требование Chrome к `fetch`-обработчику для автоматического запроса установки (меню-установка без него возможна с Chrome 108 на мобильных и 112 на настольных, M) выполняется законным обработчиком навигаций.

## 9. Выход, отзыв и общее устройство

**Реестр очистки.** `app/web/lib/pwa/session-end.ts`: `registerSessionEndCleanup(fn)` и `runSessionEndCleanup()` (идемпотентна). Регистрируют: push-клиент, PWA, чат v4.0 (очистка IndexedDB-очереди пользователя).

Порядок `AuthProvider.logout`:
1. `sessionClient.logout()`. При неудаче (нет связи) пользователь остаётся вошедшим, очистка не запускается.
2. После успеха `runSessionEndCleanup()` до `window.location.assign`: `pushManager.getSubscription()?.unsubscribe()`; `registration.getNotifications()` → `close()`; `caches.keys()` → удалить все, кроме `static-v1`; `navigator.clearAppBadge()`; удалить флаг `push-optin:<userId>`.
3. Серверная строка подписки к этому моменту уже удалена внутри `revokeSession`.

Тот же вызов при монтировании `/login`: покрывает принудительный отзыв (администратор, replay, блокировка), где клиент узнаёт о конце сессии через 401 и `redirectToLogin`, а серверная очистка уже произошла. Журнал ответов попытки (`test-answers-wal-*` в `localStorage`) очисткой не затрагивается. `Clear-Site-Data: "storage"` отвергнут: он стёр бы журнал ответов, нарушая ядро продукта.

**Сценарий общего устройства.** А выходит; подписка удалена на сервере и в браузере, уведомления закрыты, бейдж снят. Б входит в тот же браузер: `PUT` перепривязывает `endpoint` по конфликту, если подписка осталась; флага `push-optin:<Б>` нет, значит автоподписки нет. Старое уведомление А в трее (если не закрылось) при клике Б ведёт на маршрут: Express вернёт 403/404 по текущему состоянию БД, а `POST /api/notifications/:id/read` с чужим `?n=` отвечает 404 и игнорируется. Payload не содержит текста сообщений и персональных данных.

**iOS.** Установленное PWA имеет отдельный контейнер cookie и хранилища: вход выполняется внутри PWA, его сессия и подписка независимы от вкладки Safari (M).

## 10. Клик по уведомлению, глубокая ссылка и синхронизация бейджа

**Клик.** Payload (Declarative Web Push):

```json
{"web_push":8030,"notification":{"title":"Работа проверена","body":"Откройте, чтобы увидеть результат",
 "navigate":"https://<APP_ORIGIN>/<deep_link>?n=<eventId>","tag":"review:<attemptId>","app_badge":"3","lang":"ru","silent":false}}
```

- Safari 18.4+ показывает его сам и открывает `navigate`; Chromium и Firefox доставляют в `push`-обработчик SW, который разбирает ту же структуру и вызывает `showNotification(title, {body, tag, data:{navigate}})` и `setAppBadge`. Safari 16.4–18.3 идут по пути SW. Если SW успел показать замену, она вытесняет декларативное уведомление (WebKit, M).
- `notificationclick`: `clients.matchAll({type:'window', includeUncontrolled:true})` → окно того же origin → `focus()` и `navigate(url)`; иначе `clients.openWindow(url)`. SW принимает только URL своего origin, иначе открывает `/`.
- **Перепроверка доступа:** маршрут `deep_link` проходит обычную цепочку: нет cookie → `proxy.ts` ведёт на `/login?callbackUrl=<путь+?n=>` (`safeCallbackPath` сохраняет путь и параметры) → после входа возвращает; страница и Express проверяют право по текущему состоянию БД (`canReviewAttempt` и др.). Отсутствие права — стандартные 403/404. Новых проверок нет.
- `?n=<eventId>`: клиентский хук `useMarkNotificationRead` один раз вызывает `POST /api/notifications/:id/read` (проверка получателя на сервере, не получатель → 404) и убирает параметр из адреса.
- Неподтверждённые детали (разобрать в планировании): допустимы ли `tag` и произвольные поля в `notification` декларативного формата; место поля `mutable` (WebKit и черновик W3C расходятся, M); тип `app_badge` (строка в блоге WebKit).

**Бейдж.** Единственный источник — `GET /api/notifications/unread` (v3.0). Потребители:
1. Шапка, сайдбар, заголовок вкладки «(N) bio-exam»: SWR, обновление при фокусе и `visibilitychange`, при событии SSE v4.0 (`notification`), запасной опрос раз в 30–60 с.
2. Push: `app_badge` и `setAppBadge(N)` в SW; N считает воркер при отправке (включая это событие).
3. Страница: после загрузки счётчика `setAppBadge(N)` или `clearAppBadge()`; после прочтения закрывает уведомления с тем же `tag` (`registration.getNotifications({tag})`).
4. Вкладки между собой: `BroadcastChannel('bio-exam-notifications')`.
5. SW при получении push шлёт открытым окнам `postMessage({type:'notification-arrived'})`, чтобы колокольчик обновился и при деградировавшем SSE.

Свёрнутое приложение на iOS уменьшить бейдж само не может; счётчик корректируется при открытии. Принимаем.

**SSE v4.0.** Поток живёт в странице, не в SW. Событие `notification` лишь будит клиента для запроса счётчика. v5.0 не зависит от SSE: без него работают push и опрос.

## 11. Манифест и интерфейс установки

- `app/web/app/manifest.ts`: `id: '/'`, `name`, `short_name`, `lang: 'ru'`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `background_color` и `theme_color` как в `viewport.themeColor` (светлая тема), `categories: ['education']`, иконки 192/512 `any` и 512 `maskable`. Для iOS `apple-touch-icon` 180 через `metadata.icons.apple`.
- **Запрос системного разрешения никогда не показывается при входе и никогда во время попытки теста.** Диалог разрешения или блюр страницы фиксируется телеметрией жизненного цикла попытки как «вкладка скрыта». Баннеры скрыты на маршрутах раннера теста.
- **Размещение:**
  1. «Профиль» → «Уведомления и приложение» (`ProfileClient.tsx`): состояние, список устройств (`DevicesList`), кнопка «Отправить тест», установка. Основная точка.
  2. Колокольчик и центр уведомлений (v3.0): нижняя строка «Получать уведомления на этом устройстве» — естественное место, где пользователь узнаёт о событиях.
  3. Контекстный разовый баннер (закрываемый, повторно не показывается) после первого значимого события: ученику после «работа проверена», учителю после первого сообщения чата (v4.0).
  4. Пункт «Установить приложение» в меню `nav-user` (`app/web/components/nav-user.tsx`), только когда сохранён `beforeinstallprompt` или это iOS вне standalone.
- iOS: `beforeinstallprompt` нет, поэтому инструкция «Поделиться → На экран Домой» (гайд Next.js рекомендует не полагаться на `beforeinstallprompt`). Определение: `navigator.standalone` или `matchMedia('(display-mode: standalone)')`.
- Установка без SW возможна через меню браузера, поэтому шаг «манифест, иконки, `proxy.ts`, `viewportFit`, инструкция» не зависит от остального.

## 12. Тестирование

Два слоя без внешних сервисов.

**Сервер (Vitest, `node scripts/with-test-db.mjs`).**
- Порт `PushSender` с адаптерами `web-push` и `fake` (программируемые 201/410/429/503/403), как адаптеры хранилища (ADR-0004).
- Воркер: 410 удаляет подписку и не повторяет; 429 ставит `next_attempt_at` по `Retry-After`; 5xx откатывается по расписанию; частичный сбой не пересылает на `delivered_to`; истёкшая аренда перехватывается; два параллельных `runOnce()` берут разные строки (`SKIP LOCKED`); `graceSec` и пропуск при `read_at`; часы тишины по часовому поясу; дросселирование и `ON CONFLICT`; сессия отозвана или пользователь неактивен — отправки нет.
- Подписки: матрица политики адреса (чужие хосты, `http`, userinfo, порты, длина); перепривязка `endpoint` другому пользователю; лимит 10; `revokeSession` и `revokeUserSessions` удаляют подписки сессии, `exceptSessionId` оставляет.
- Маршруты `/api/push/*`: 401 без сессии, DELETE чужого `endpoint` — 204 без эффекта; снимок инвентаря маршрутов.

**Браузер (Playwright, проект `chromium-desktop`; `workers: 1`).**
- Настройки: `serviceWorkers: 'allow'` (по умолчанию), `permissions: ['notifications']`, `127.0.0.1` — защищённый контекст.
- **Реальный `pushManager.subscribe` в headless Chromium недоступен** (требует службу FCM). Тест подменяет `PushManager.prototype.subscribe` через `page.addInitScript`, возвращая подписку с `endpoint` на локальный фиктивный push-сервер (HTTP-сервер фикстуры) и настоящими ключами P-256, сгенерированными `node:crypto`.
- Серверный путь: API e2e с адаптером `web-push` шлёт на этот фиктивный сервер (флаг 127.0.0.1 только при `BIO_EXAM_ISOLATED_ENV=1`, короткие `PUSH_GRACE_SEC` и `PUSH_POLL_MS`); тест принимает запрос, проверяет `Authorization: vapid`, `TTL`, `Topic`, `Content-Encoding: aes128gcm` и расшифровывает тело (`http_ece`, уже зависимость `web-push`): нет текста сообщения, верный `navigate`.
- Путь SW: через CDP `ServiceWorker.deliverPushMessage` (сессия `context.newCDPSession`, `ServiceWorker.enable`, `registrationId` из `workerRegistrationUpdated`) доставить payload; утверждение через `registration.getNotifications()`. Клик: синтетический `NotificationEvent('notificationclick')` в контексте SW (`worker.evaluate`); **проверить в спайке**, что `waitUntil` работает на синтетическом событии (M, по практике сообществ).
- Инварианты: `/sw.js`, `/manifest.webmanifest`, `/offline.html` отдаются без cookie (не 307) с `no-cache` для `sw.js`; после входа и серии навигаций `caches.keys()` содержит только `static-v1`, а в нём только статические URL; после выхода `getSubscription()` пуст, уведомления закрыты, строка подписки в БД удалена; сценарий общего устройства А → Б.
- Запрос обновления SW после изменения файла: один сценарий «`registration.update()` подхватывает новые байты».
- Не автоматизируется: реальные FCM, APNs, iOS PWA, Яндекс Браузер. Ручной чек-лист UAT на устройствах (iOS ≥ 18.4 с домашнего экрана и 16.4–18.3, Android Chrome, настольные Chrome и Safari), а также кнопка «Отправить тест» в продакшене.
- Тесты остаются лёгкими (`test-hygiene`): без структурных охранников, юниты только для логики с вариантами (откат, часы тишины, политика адреса).

## 13. Потоки данных

**Подписка:** `PushOptIn` (жест) → `requestPermission` → `pushManager.subscribe` → `PUT /api/push/subscription` → политика адреса → upsert с перепривязкой → `push_subscription`.

**Событие → push:** производитель (tx) → `notification_event` + `inbox`-доставка + `webpush`-планировщик → COMMIT → воркер (через ≥ `graceSec`) → проверки (`read_at`, сессия, пользователь) → payload → `web-push` → FCM/APNs/Mozilla → браузер → (Safari: декларативно; остальные: `push` в SW) → уведомление и бейдж.

**Клик:** уведомление → `navigate` (`deep_link?n=id`) → `proxy.ts` (вход при необходимости) → маршрут + Express (доступ) → `POST /api/notifications/:id/read` → бейдж.

**Выход:** `logout()` → `endSession` → `revokeSession` (удаляет подписки сессии) → клиентская очистка → `/login`.

## 14. Порядок сборки и зависимости

| Шаг | Содержание | Зависит от |
|-----|-----------|------------|
| **0. Ворота (пользователь, до планирования)** | Проверить с VPS исходящий доступ к `fcm.googleapis.com`, `web.push.apple.com`, `updates.push.services.mozilla.com` (curl); при отказе решить про `PUSH_HTTPS_PROXY`. Короткий спайк на устройствах: определение декларативной поддержки (`window.pushManager`), поведение `tag`/`app_badge`, установка на iOS. Строка Caddy для `/sw.js` | Ничего. **Если доступа нет, остальные шаги не начинать** |
| **1. Оболочка PWA** | `app/manifest.ts`, иконки, `viewportFit`, `appleWebApp`, исключения `proxy.ts` (+ тест), интерфейс установки (инструкция iOS, `beforeinstallprompt`) | Ничего; можно вынести раньше v3.0/v4.0 |
| **2. Сервис-воркер** | `public/sw.js` (`push`, `notificationclick`, `message`, навигация с `offline.html`), `headers()` для `/sw.js`, `PwaRegistrar`, реестр очистки при выходе и вызов в `AuthProvider.logout` и `/login`, e2e на заголовки и кэш | Шаг 1. Нужен до шага 3: `pushManager.subscribe` требует регистрацию |
| **3. Подписки и тестовый push** | Миграция `push_subscription`, `config/push.ts`, VAPID, маршруты, политика адреса, `services/session` (удаление в `revokeSession` и `revokeUserSessions`), `PushOptIn`, `DevicesList`, порт `PushSender` с `fake`, `POST /api/push/test` (прямая отправка без журнала). Проверка доставки на реальных устройствах уже здесь | Шаги 0, 2. От журнала v3.0 **не зависит** |
| **4. Конвейер по журналу** | Планировщик, строки `webpush`, воркер (захват, откат, 404/410, дросселирование, часы тишины, предпочтения), `notification_settings` и `notification_preference` (если v4.0 их не создал), запуск из `index.ts`, ADR-0006 | Жёстко: журнал и точка регистрации каналов v3.0. Вид `chat.message` и часы тишины подключаются, когда есть v4.0 |
| **5. Клик, бейдж, SSE** | `?n=` и `POST /api/notifications/:id/read`, `app_badge`, `setAppBadge`, `BroadcastChannel`, заголовок вкладки; хук в SSE v4.0; пометка `read_at` при чтении чата | Шаг 4; мягко v4.0 (SSE, чтение чата) |
| **6. Закрепление** | Полная матрица e2e (раздел 12), ручной UAT, инструкции для сервера (`api.env`, Caddy, проверка `curl`), мониторинг (лог исходов по статусам; ошибка 401/403 от push-службы громко) | Шаги 3–5 |

Порядок объясняется зависимостями данных: шаги 1–3 не требуют журнала и дают самую рискованную проверку (доставка в РФ, iOS) рано; шаг 4 привязан к v3.0; шаг 5 использует v4.0. Если roadmap оставляет v5.0 последним, шаги 0–3 всё равно стоит вытащить вперёд как спайк риска.

## 15. Масштабирование

| Масштаб | Подход |
|---------|--------|
| ~30–100 пользователей (сейчас) | Воркер в процессе API, опрос 5 с, до 20 строк за цикл |
| ~1–10 тыс. пользователей | Тот же воркер; параллелизм отправки 5→20, индекс по `next_attempt_at` уже есть; уборщик чистит старые доставки |
| Второй процесс API или заметная нагрузка на цикл событий | Вынос в `dist/scripts/push-worker.js` отдельным сервисом Compose (захват уже безопасен через `SKIP LOCKED`); при необходимости `LISTEN/NOTIFY` вместо опроса |

Первый предел — задержка отправки внутри процесса API (таймаут 10 с на устройство); второй — память контейнера API (768 МБ). Redis и очередь сообщений не нужны.

## 16. Анти-паттерны

- **Server actions Next для отправки (как в гайде).** Нарушает ADR-0001; подписки и права живут в Express.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`.** Вшивается при сборке образа на сервере, ломает ротацию и правило «один образ».
- **Кэш страниц, RSC и `/api/*` в сервис-воркере, прекэш оболочки.** Страницы персональные и `force-dynamic`; на общем устройстве это утечка.
- **Принимать `endpoint` без политики адреса.** SSRF из сети Docker.
- **Текст сообщения, имена файлов и оценки в payload.** Экран блокировки и общее устройство.
- **Подписка только в браузере или привязана лишь к пользователю.** Отозванная сессия продолжает получать уведомления; привязка к `session_id` решает.
- **Тихие push на iOS.** Три непоказанных уведомления отзывают подписку; каждый push показывает уведомление, декларативный формат — страховка.
- **Исключение присутствия по SSE.** Свёрнутое iOS-PWA без потока; дубль лучше потери.
- **Старт воркера из `app.ts`.** Его получат тесты и контейнер `migrate`.
- **`Clear-Site-Data: "storage"` при выходе.** Стирает журнал ответов попытки.
- **Страница-посредник `/n/[id]` с копией маппинга и проверок.** Второй источник правды о маршрутах.

## 17. Точки интеграции

### Внешние службы

| Служба | Способ | Замечания |
|--------|--------|-----------|
| FCM (Chrome, Edge, Яндекс Браузер, Samsung) | `web-push` по HTTPS с VAPID | Доступность с VPS и у учеников на мобильном интернете «по возможности» (L); шаг 0 |
| APNs (Safari, iOS PWA) | То же | Только установленное PWA на iOS; `sub` в VAPID обязателен и должен быть валидным |
| Mozilla autopush | То же | Хост `updates.push.services.mozilla.com` |

### Внутренние границы

| Граница | Связь | Замечания |
|---------|-------|-----------|
| `services/session` ↔ `services/push` | Прямой вызов `deleteForSessions(tx, ids)` в транзакции отзыва | Единственная связь модуля сессий с push; проверка живой сессии при отправке остаётся страховкой |
| Журнал v3.0 ↔ планировщик | Регистрация планировщика канала, вызов в транзакции производителя | Требование к v3.0: точка расширения каналов |
| Чат v4.0 ↔ журнал | Событие в транзакции сообщения; `read_at` при чтении чата | Требование к v4.0, иначе счётчик расходится |
| Страница ↔ SW | `postMessage` (`session-ended`, `notification-arrived`) | Неизвестные сообщения игнорируются |
| Web ↔ Express | Типизированный слой запросов `lib/http/request.ts` | Охранник `web-requests-guards.test.mjs` |
| Репозиторий ↔ сервер | Файлы сервера вне Git | Caddy, `api.env`, проверка исходящей сети выполняет пользователь |

## 18. Пробелы и вопросы

- Доставка push из РФ с VPS и у учеников, Яндекс Браузер, «белые списки» — только после шага 0 и UAT (L).
- Декларативный формат: `tag`, `mutable`, тип `app_badge`, детектирование поддержки; даты поддержки Chrome и Firefox (вендорный блог, L). Safari 18.4+ и macOS 15.5 — M.
- Синтетический `NotificationEvent` и `deliverPushMessage` в нашей версии Playwright — проверить в спайке.
- Совместимость `web-push` 3.6.7 с Node 24 и актуальность белого списка хостов — проверить при установке.
- Контактный адрес для `VAPID_SUBJECT` (SMTP в проекте нет, нужен только идентификатор).
- Продуктовые решения: часы тишины по умолчанию для учеников (рекомендация: включены 21:00–09:00 только для push); откладывать ли push во время попытки; имя отправителя в заголовке push по умолчанию (ранее принято: «Сообщение от учителя …», текст не показывается).
- Владелец `notification_settings` (v4.0 или v5.0 шаг 4).

## Источники

- Код репозитория (H): `app/web/proxy.ts`, `app/web/next.config.ts`, `app/web/app/layout.tsx`, `app/web/components/providers/AuthProvider.tsx`, `app/web/lib/session/client.ts`, `app/web/lib/session/redirect.ts`, `app/web/components/tests/attempt-lifecycle/storage-keys.ts`, `app/server/src/services/session/index.ts`, `app/server/src/routes/auth/logout.ts`, `app/server/src/index.ts`, `app/server/src/app.ts`, `app/server/src/config/auth.ts`, `app/server/route-inventory.txt`, `scripts/env-contract.config.json`, `scripts/lib/e2e-web-env.mjs`, `e2e/playwright.config.ts`.
- ADR-0001…0005 (`docs/adr/`), `.planning/PROJECT.md`, `.planning/ROADMAP.md` (описание v5.0).
- `.planning/research/chat/SUMMARY.md` (разделы 2 и 6), `TRANSPORT-STORAGE.md` (§4, §8), `FEATURES-PWA.md` (§6–§7).
- Профиль сервера `~/.claude/servers/bio-exam.md` (compose, Caddy, выкатка).
- Next.js 16.3.8, гайд PWA (обновлён 2026-07-30): https://nextjs.org/docs/app/guides/progressive-web-apps (M)
- WebKit, Declarative Web Push: https://webkit.org/blog/16535/meet-declarative-web-push/ (M)
- W3C Push API, Declarative Web Push (черновик): https://github.com/w3c/push-api/pull/385 (L–M)
- Критерии установки Chrome: https://developer.chrome.com/blog/update-install-criteria (M)
- `web-push` README и `npm view web-push` (H для версии и опций): https://github.com/web-push-libs/web-push
- Тестирование push в Playwright (CDP `ServiceWorker.deliverPushMessage`, `grantPermissions`): https://github.com/microsoft/playwright/issues/23954, https://github.com/microsoft/playwright/issues/5631 (L)

---
*Architecture research for: PWA и Web Push поверх журнала уведомлений bio-exam*
*Researched: 2026-10-06*
