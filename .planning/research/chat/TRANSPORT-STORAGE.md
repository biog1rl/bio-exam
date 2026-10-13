# Чаты учителя и ученика: транспорт, хранение, вложения

**Дата:** 2026-10-05
**Окружение:** этап после переезда на Beget VPS (4 vCPU / 6 ГБ / 80 ГБ NVMe, Docker Compose, внешний прокси с TLS, PostgreSQL 17, один процесс Express, без Redis).
**Общая уверенность:** HIGH по транспорту и PostgreSQL (первоисточники), MEDIUM по готовым чат-серверам и чужой архитектуре (вторичные источники).
**Уровни уверенности:** HIGH — официальная документация или спецификация; MEDIUM — вторичный источник или поисковая сводка; LOW — оценка без проверки.

## 1. Главный вывод

Чат строим сами внутри существующего API, а не берём готовый сервер. Все изменения (отправка, правка, удаление, отметка о прочтении) идут обычными HTTP-запросами через существующие middleware, шов доступа и идемпотентность по `client_message_id`. Канал реального времени работает только от сервера к клиенту и несёт короткие уведомления. Для такого канала подходит **SSE** (`text/event-stream`) на том же домене: cookie уходят сами, `Last-Event-ID` встроен в протокол, нет обработки Upgrade, поток проходит через Next rewrites в разработке. Рассылка событий идёт через шину в памяти процесса за интерфейсом. Адаптер `LISTEN/NOTIFY` подключаем, только когда API запустится больше чем в одном процессе. Отдельная служба realtime в Compose и Redis не нужны.

`ws`/Socket.IO нужен, только если по каналу пойдут кадры от клиента к серверу (индикатор «печатает», присутствие с частыми обновлениями). Это развилка Р1 в разделе 10.

### 1.1. Схема потоков

```
Браузер (вкладка)                     Внешний прокси (TLS, HTTP/2)            Express (один процесс)                PostgreSQL 17
  EventSource /api/chat/stream  ───────► proxy_buffering off ─────────► auth по cookie → реестр потоков
  POST /api/chat/:id/messages   ───────► /api/* ───────────────────────► шов доступа → транзакция:      ────► UPDATE chats last_seq+1 (блокировка)
       {clientMessageId, body,                                            seq, INSERT сообщения,                INSERT chat_messages
        attachmentIds}                                                    привязка вложений, outbox             INSERT notification_outbox
                                                                          COMMIT → ChatEventBus.publish
  ◄── event: message {chatId, seq} ◄─────────────────────────────────── реестр потоков (фильтр по членству)
  GET /api/chat/:id/changes?since ──────────────────────────────────────► WHERE version_seq > since ───────────► индекс (chat_id, version_seq)
  POST /api/chat/:id/attachments  ──────────────────────────────────────► multer → file-type → sharp ─────────► порт хранилища (локальный том)
  GET /api/chat/attachments/:id   ──────────────────────────────────────► проверка участника → storage.read
                                                                          воркер outbox (SKIP LOCKED) → в кабинете / push / email
```

## 2. Что уже есть в репозитории (проверено)

- Cookie сессии: `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` в production (`app/server/src/services/session/cookies.ts`). Access JWT несёт `sub` и `sid`, TTL настраивается от 60 до 3600 с, по умолчанию 900 с (`app/server/src/config/auth.ts`). Соединение на том же origin получает cookie без доработок.
- Web ходит в API через `/api/*`: в разработке через Next rewrites (`app/web/next.config.ts`), в production `/api/*` направляет внешний прокси (`plans/beget-migration.md`, раздел про proxy). Маршрут realtime ставим под `/api/`, и прокси отдаёт его API напрямую.
- `multer`, `file-type` 22, `sharp` 0.35 уже в `app/server/package.json` и используются в `services/assets/images.ts`, `services/assets/avatars.ts`. Новых зависимостей для вложений не нужно.
- Порт хранилища `services/storage/port.ts`: `write/read/exists/remove/copy/list`, адаптеры `supabase | local | memory`. Presigned URL в порте нет и для локального тома не нужен.
- Первичные ключи в схеме: `uuid('id').primaryKey().defaultRandom()` (16 таблиц).

## 3. Транспорт реального времени

| Вариант | Версия, лицензия | Cookie-авторизация и отзыв | За nginx | Плюсы | Минусы | Вывод |
|---|---|---|---|---|---|---|
| **SSE + HTTP POST** | стандарт браузера | Свои заголовки `EventSource` задать не может, `Authorization: Bearer` невозможен, остаются только cookie, а это наш случай. Cookie same-origin уходят сами. При ответе не 200 браузер закрывает соединение без повтора [1], значит клиент сам делает refresh и переподключение | `proxy_buffering off`, heartbeat-комментарий раз в 15–25 с [1][2] | `Last-Event-ID` из коробки [1], обычный HTTP: логи, rate limit, middleware Express | Только сервер→клиент. На HTTP/1.1 лимит 6 соединений на браузер и домен на все вкладки [3] | **Рекомендован** |
| `ws` | 8.22.0, MIT [4] | Проверка cookie в `upgrade` до `handleUpgrade`. Отзыв делаем сами | `Upgrade`/`Connection` + `map`, таймаут 60 с [2] | Двусторонний, минимальный, самый распространённый | Переподключение, ping, буферы и протокол сообщений пишем сами. Через Next rewrites в разработке Upgrade не проходит надёжно (LOW) | Запасной вариант при развилке Р1 |
| Socket.IO 4 | 4.8.x, MIT [5] | Middleware `io.use` читает cookie. Отзыв делаем сами | Как у `ws`, плюс long-polling как запасной путь | Комнаты, ack, авто-reconnect, Connection State Recovery (2 мин по умолчанию) [6] | CSR работает с адаптером в памяти, но не с `@socket.io/postgres-adapter` 0.5.0 [6][7]. Свой протокол поверх WS, клиент ~десятки КБ | Не нужен: комнаты и ack заменяются HTTP POST и шиной |
| uWebSockets.js | Apache-2.0, ставится с GitHub, не из npm [8] | Отдельный HTTP-стек, вне Express | Как у `ws` | Максимальная производительность | Вне middleware Express, нативный модуль, нестандартная поставка | Не нужен на нашем масштабе |
| Long-polling | — | Обычный HTTP | Без особенностей | Работает везде | Задержка и лишние запросы | Только как деградация: SSE недоступен → опрос `GET /sync` раз в 20–30 с |
| Centrifugo v6 | 6.9.7, Apache-2.0 [9][10] | Connect/refresh/subscribe proxy в наш API. Заголовки `Cookie` пробрасываются только явно через `http_headers` [11] | Свой сервис за прокси | История каналов, recovery, PostgreSQL-брокер (экспериментальный) и outbox-consumer (опрос раз в 300 мс или NOTIFY) [12][13] | Ещё один сервис и конфиг. Двойная модель доступа (каналы плюс наш шов). Экспериментальный PG-брокер | Вариант на будущее, если понадобятся тысячи онлайн-соединений |
| Mercure | AGPL-3.0 (хаб), есть коммерческая [14] | JWT подписчика в cookie | SSE | Протокол на SSE | AGPL, Go-хаб отдельно, ещё один сервис | Не нужен: SSE пишем сами в 100–200 строк |
| Soketi | Pusher-совместимый | — | — | — | Поддержка под вопросом: последний релиз 2025-03-25, в issue «проект заброшен» [15] | Исключить |

**Почему SSE, а не WS.** Канал только вниз, поэтому двусторонний протокол ничего не даёт. SSE переиспользует cookie, `Last-Event-ID` и HTTP-инфраструктуру. Условие: на внешнем прокси включён **HTTP/2** до браузера, иначе пользователь с 6+ вкладками исчерпает лимит HTTP/1.1 [3]. До upstream (Express) прокси ходит по HTTP/1.1, это нормально. Дополнительно можно держать одно соединение на браузер через `BroadcastChannel` и выбор ведущей вкладки. Это развилка Р2.

### 3.1. Жизненный цикл авторизации канала (обязательно)

1. **Подключение:** `GET /api/chat/stream` проходит существующий auth-middleware: access cookie → `sid` → сессия активна в БД → пользователь не заблокирован. Ответ не 200 → `EventSource` закрывается навсегда [1], и клиент переходит к шагу 4.
2. **Срок токена:** при подключении сервер ставит таймер на `exp` access-токена. В момент `exp` отправляет `event: reauth` и закрывает поток. Так соединение не живёт дольше, чем живёт обычный HTTP-запрос с тем же токеном. При TTL по умолчанию 900 с это одно переподключение в 15 минут на вкладку, нагрузка незаметная.
3. **Отзыв:** выход, блокировка, смена пароля и отзыв сессий администратором публикуют в шину событие `session.revoked {sid}` / `user.blocked {userId}`. Модуль потока сразу закрывает соответствующие соединения. Ремень безопасности на случай пропущенного события: раз в 60 с перечитывать строку сессии.
4. **Клиент:** при `reauth`, ошибке или закрытии вызывает существующий `/api/auth/refresh`. Успех → новое соединение с `Last-Event-ID` → дельта-синхронизация (раздел 6). Отказ refresh → экран входа. Между попытками экспоненциальная пауза с джиттером (1 → 30 с).
5. **Членство:** список чатов пользователя загружается при подключении и инвалидируется событиями `member.added/removed`. Исключённый из чата перестаёт получать его события сразу. Каждое событие перед отправкой фильтруется по актуальному членству.
6. **Heartbeat:** комментарий `: ping` каждые 20 с. Иначе nginx закроет простаивающее соединение через 60 с [2], а браузерный прокси ещё раньше [1].

Конфигурация прокси для `location /api/chat/stream`: `proxy_http_version 1.1; proxy_buffering off; proxy_read_timeout 1h;` (или ответ с заголовком `X-Accel-Buffering: no`), сжатие gzip на этом маршруте выключить. Express 4: `res.flushHeaders()`, `req.on('close')` для очистки, `compression` на маршрут не вешать.

## 4. Рассылка событий без Redis

- **Один процесс Node:** шина в памяти (`EventEmitter` за интерфейсом `ChatEventBus.publish/subscribe`). Публикуем **после COMMIT** транзакции, иначе подписчик прочитает ещё не закоммиченные данные. Событие несёт только идентификаторы: `{type, chatId, seq}`.
- **Несколько процессов** (два контейнера API при выкатке без простоя или отдельный воркер уведомлений): адаптер `LISTEN/NOTIFY`. Факты [16]: полезная нагрузка до 8000 байт, доставка только после COMMIT и в порядке коммитов, одинаковые payload в одной транзакции схлопываются, очередь 8 ГБ, долгая транзакция слушателя мешает её очистке. Слушатель держит **одно выделенное** соединение `pg.Client`, не из пула. `pg-listen` не обязателен: хватит `client.on('notification')` и переподключения. Пропуски при обрыве соединения закрывает дельта-синхронизация, потому что NOTIFY только будит, а источник правды остаётся в таблицах.
- **Глобальная блокировка NOTIFY при COMMIT:** сериализует коммиты с NOTIFY и проявилась у Recall.ai на десятках тысяч одновременных писателей [17]. Исправление вошло в PostgreSQL 19 (MEDIUM, вторичный источник [18]). На тысячах сообщений в день это не заметно.
- **`@socket.io/postgres-adapter`** делает то же самое (NOTIFY, крупные пакеты через вспомогательную таблицу) [7], но привязывает нас к Socket.IO.
- **Outbox нужен не для realtime, а для уведомлений** (раздел 8): строки `notification_outbox` пишутся в той же транзакции, что и сообщение. Воркер внутри API забирает их через `FOR UPDATE SKIP LOCKED`.

## 5. Свой чат против готовых серверов

| Решение | Лицензия, ограничения | Ресурсы на 6 ГБ VPS | Интеграция с нашими пользователями и зоной учителя | Вывод |
|---|---|---|---|---|
| **Свой модуль в API** | наш код | +десятки МБ к процессу API (MEDIUM [19][20]) | Нативно: шов `access-policy`, `canManageStudent`, `groupScope`, текущие сессии | **Рекомендован** |
| Matrix: Synapse | AGPL-3.0 или коммерческая Element [21] | 1–2+ ГБ ОЗУ на сам Synapse и отдельная БД (MEDIUM [22]) | Свои пользователи и комнаты, SSO через OIDC (нужен OIDC-провайдер, которого у нас нет), синхронизация зоны учителя скриптами через Admin API, E2EE усложняет модерацию переписки несовершеннолетних | Избыточен: федерация не нужна |
| Matrix: Tuwunel (наследник conduwuit) | Apache-2.0, встроенный RocksDB [23] | Легче Synapse | Те же проблемы интеграции, ещё одна БД вне бэкапов PostgreSQL | Нет |
| Rocket.Chat | Community MIT. Starter бесплатно до 50 пользователей, Community до 100 одновременных [24] | Обязательна MongoDB replica set. Node 1–1,5 ГБ, плюс WiredTiger, 4 ГБ+ рекомендуется [25] | Свой UI, встраивание через iframe/SDK, свои права | Нет: MongoDB и лимиты |
| Mattermost | Team Edition до 250 пользователей без SSO с v11 (октябрь 2025). Entry ограничивает видимую историю 10 000 сообщений [26][27] | Go и PostgreSQL, умеренно | Модель команд и каналов для сотрудников, не для учебных групп | Нет: лимиты меняются в сторону ужесточения |
| Zulip | Apache-2.0 | 2 ГБ+, при 100+ пользователях 2 CPU / 4 ГБ. Ставит PostgreSQL, Redis, RabbitMQ, memcached [28] | Модель тем-тредов, свои пользователи | Нет: по ресурсам почти весь VPS |
| Tinode | GPL-3.0 (сервер), поддерживает PostgreSQL [29] | Go, лёгкий | Своя модель пользователей и топиков, доступ через плагины | Ближе всех, но всё равно второй источник правды о пользователях |

Общая цена любого готового сервера: второй источник правды о пользователях и правах, синхронизация зоны учителя, отдельные бэкапы, отдельный UI или SDK, отдельные обновления безопасности. Выгода (готовый клиент, E2EE, федерация) нам не нужна.

**Как делают крупные (MEDIUM, вторичные источники).** Discord перешёл с Cassandra на ScyllaDB из-за горячих партиций и GC: 177 → 72 узлов, ключ партиции — канал плюс временное окно [30]. Slack держит сообщения в MySQL за Vitess, шардирует по каналу, чтобы история канала читалась с одного шарда [31]. Telegram: `pts` — общая последовательность событий для личных чатов и обычных групп пользователя, отдельная `pts` у каждого канала, разрыв ловится по `local_pts + pts_count < pts`, восстановление через `getDifference` / `getChannelDifference`, слишком старая дельта даёт `differenceTooLong`, и клиент перезапрашивает состояние [32]. Что берём на нашем масштабе: ключ доступа «чат + монотонный номер в чате» (как у Slack и Discord) и протокол Telegram «номер последовательности + дельта + полный сброс при большом разрыве». Шардирование и NoSQL не нужны: тысячи сообщений в день — это сотни тысяч строк в год.

## 6. Модель данных и протокол синхронизации

### 6.1. Черновик схемы (набросок, не миграция)

```sql
CREATE TABLE chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('direct','group')),
  group_id uuid NULL,
  direct_key text NULL UNIQUE,
  title text NULL,
  created_by uuid NOT NULL,
  last_seq bigint NOT NULL DEFAULT 0,
  last_message_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chat_members (
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','member','observer')),
  last_read_seq bigint NOT NULL DEFAULT 0,
  muted_until timestamptz NULL,
  joined_seq bigint NOT NULL DEFAULT 0,
  left_at timestamptz NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX chat_members_user_idx ON chat_members (user_id) WHERE left_at IS NULL;

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  version_seq bigint NOT NULL,
  sender_id uuid NULL,
  client_message_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','photo','attempt_ref','system')),
  body text NULL,
  payload jsonb NULL,
  reply_to_id uuid NULL REFERENCES chat_messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  search tsvector GENERATED ALWAYS AS (to_tsvector('russian', coalesce(body,''))) STORED,
  UNIQUE (chat_id, seq),
  UNIQUE (sender_id, client_message_id)
);
CREATE INDEX chat_messages_version_idx ON chat_messages (chat_id, version_seq);
CREATE INDEX chat_messages_search_idx ON chat_messages USING gin (search);

CREATE TABLE chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  thumb_key text NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  width integer NULL,
  height integer NULL,
  thumbhash text NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);
CREATE INDEX chat_attachments_pending_idx ON chat_attachments (created_at) WHERE message_id IS NULL;
```

Решения и причины:
- **`id uuid` + `seq` в чате.** `id` — внешний идентификатор, как у остальных таблиц. UUIDv7 генерирует приложение (в PG 17 нет `uuidv7()`, функция появилась в PG 18 [33]). `seq` задаёт порядок, keyset-пагинацию (`WHERE chat_id=$1 AND seq < $before ORDER BY seq DESC LIMIT 50` по уникальному индексу `(chat_id, seq)`) и синхронизацию. Глобальный `bigserial` как курсор не используем (см. 6.3).
- **`version_seq`** — номер последнего изменения строки внутри чата. Новое сообщение получает `version_seq = seq`, правка или удаление — следующий номер из того же счётчика `chats.last_seq`. Дельта одним запросом `WHERE chat_id=$1 AND version_seq > $since` возвращает и новые, и изменённые, и удалённые сообщения (tombstone: `deleted_at` заполнен, `body` обнулён). Отдельная таблица событий не нужна.
- **Идемпотентность:** `UNIQUE (sender_id, client_message_id)`. Повтор POST возвращает уже созданное сообщение со статусом 200, как `clientAttemptId` у попыток.
- **`direct_key`** = отсортированная пара `user_id`: один личный чат на пару пользователей без гонки при создании.
- **Непрочитанные:** вычисляем, не храним. `count(*) WHERE chat_id=$1 AND seq > last_read_seq AND sender_id <> me AND deleted_at IS NULL` по индексу `(chat_id, seq)` с ограничением «99+». Свои сообщения сразу двигают `last_read_seq` отправителя. Счётчик в БД появится, только если список чатов станет медленным.
- **`attempt_ref`:** в `payload` лежит `{attemptId}`. Сервер при чтении проверяет право видеть попытку через шов доступа и не копирует данные попытки в сообщение.
- **Правка и удаление:** только автор, в окне (например 15 мин на правку). Удалить можно в любое время. Учитель или админ в своей зоне могут скрыть сообщение (модерация, `deleted_by`). Окно — развилка Р5.
- **Поиск:** `tsvector('russian')` со стеммингом Snowball находит «клетка/клетки/клеток». `pg_trgm` нужен только для поиска по подстроке и опечаткам: GIN на триграммах тяжелее и для чата необязателен. На сотнях тысяч строк годится любой вариант. Поиск ограничиваем чатами, где пользователь — участник.

### 6.2. Запись сообщения (одна транзакция)

1. Проверка шва доступа: пользователь — участник чата и может писать (учитель ↔ свой ученик, группа учителя).
2. `UPDATE chats SET last_seq = last_seq + 1, last_message_at = now() WHERE id=$1 RETURNING last_seq`. Блокировка строки чата сериализует запись в этот чат, поэтому порядок `seq` совпадает с порядком коммитов.
3. `INSERT chat_messages ... ON CONFLICT (sender_id, client_message_id) DO NOTHING`. При конфликте откатываем и возвращаем существующее сообщение.
4. Привязка вложений: `UPDATE chat_attachments SET message_id=$id WHERE id = ANY($ids) AND uploader_id=$me AND chat_id=$chat AND message_id IS NULL`. Число обновлённых строк должно совпасть с числом идентификаторов.
5. Вставка строк `notification_outbox` для получателей.
6. COMMIT → `bus.publish({type:'message', chatId, seq})`.

### 6.3. Протокол синхронизации

- **Гонка глобального курсора.** Значение `bigserial` выдаётся до коммита. Читатель может увидеть строку 105 раньше, чем закоммитится 104, сдвинуть курсор на 105 и навсегда пропустить 104. Это главный источник «пропавших сообщений после переподключения». Защита: номер выдаётся под блокировкой строки чата (6.2, шаг 2), поэтому внутри чата он монотонен в порядке коммитов. Курсор клиента — пары `chatId → seq`, а не одно глобальное число.
- **Правило порядка: сначала открыть поток, потом вызвать `sync`.** События, пришедшие во время `sync`, складываются в буфер и применяются после него. Иначе сообщение, закоммиченное между `sync` и открытием потока, теряется до следующего переподключения.
- **Состояние клиента:** для каждого чата `known_seq` — максимальный `version_seq`, который клиент видел.
- **Переподключение:** `GET /api/chat/sync` возвращает список чатов пользователя с `last_seq`, `last_read_seq` участников и превью. Это дёшево: у пользователя десятки чатов. Для чатов, где `last_seq > known_seq`, клиент запрашивает `GET /api/chat/:id/changes?since=known_seq&limit=200`. Если разрыв больше лимита или чата нет в кэше, клиент сбрасывает кэш этого чата и грузит последнюю страницу (аналог `differenceTooLong` [32]).
- **SSE `id:`** можно задавать как `chatId:seq`, но источник правды всё равно `sync`. `Last-Event-ID` нужен для быстрого пути, а не для гарантии.
- **Живое событие** `{chatId, seq}`: если `seq == known_seq + 1`, клиент дозапрашивает это сообщение (или берёт тело из события, если оно небольшое). Иначе запускает `changes?since`.
- **Прочтение:** `POST /api/chat/:id/read {seq}` сдвигает `last_read_seq` только вперёд (`GREATEST`). Событие `read` уходит другим участникам: так учитель видит «прочитано».
- **Членство:** добавление и исключение — события `member.*` в личный поток пользователя. После переподключения список чатов в `sync` их покрывает.

### 6.4. Хранение и экспорт

Сроки хранения не определены, это развилка Р4. Технически: `archived_at` для чатов ушедших учеников, плановое задание удаляет вложения после `expires_at` (по аналогии с фото ответов: год), тексты — по решению пользователя. Экспорт чата в JSON или HTML для администратора идёт по тому же шву доступа и попадает в журнал аудита.

## 7. Вложения

- **Загрузка через API, не presigned.** На локальном томе presigned URL не существует. `multer` в память (лимит 10 МБ на файл, до 5 файлов на сообщение, как в фото ответов v3.0) → `file-type` по сигнатуре, белый список `image/jpeg|png|webp|heic`. Расширение и `Content-Type` клиента не учитываются.
- **Обработка на сервере через `sharp`:** `rotate()` (автоповорот по EXIF до удаления метаданных) → ресайз до 2048 px → WebP или JPEG. Миниатюра 320 px. `thumbhash` (~25 байт) для плейсхолдера считается на сервере из миниатюры. sharp по умолчанию удаляет все метаданные, включая EXIF с GPS [34]. Для фото несовершеннолетних это обязательное свойство, `keepMetadata()`/`withMetadata()` не вызывать. Перекодирование заодно обезвреживает большинство вредоносных полезных нагрузок в изображениях.
- **Двухшаговый поток:** `POST /api/chat/:id/attachments` создаёт строку с `message_id NULL` и возвращает `attachmentId` и `thumbhash`. Затем сообщение ссылается на `attachmentIds`. Задание раз в сутки удаляет неприкреплённые вложения старше 24 ч из БД и хранилища. Ключ хранилища `chat/<chatId>/<attachmentId>/{full,thumb}.webp` через `services/storage/keys.ts`.
- **Раздача:** `GET /api/chat/attachments/:id/{full|thumb}` проверяет, что пользователь — участник чата и сообщение не удалено, затем `storage.read`. Заголовки: `Cache-Control: private, max-age=31536000, immutable` (ключ неизменяем), `ETag` = `sha256`, `X-Content-Type-Options: nosniff`. Ускорение `X-Accel-Redirect` (Express проверяет права, nginx отдаёт файл) обходит порт хранилища и работает только с локальным адаптером. Включать его стоит, только если профилирование покажет нагрузку.
- **Антивирус:** ClamAV — это ~1 ГБ+ ОЗУ на 6 ГБ VPS (LOW, оценка). Для одних изображений после перекодирования он не нужен. Понадобится, если разрешить PDF и документы (развилка Р3).
- **Квота:** лимит байт на пользователя в сутки и rate limit на загрузку. Иначе 80 ГБ NVMe заполнит один клиент.

## 8. Готовность к PWA и уведомлениям

- **Исходящая очередь в IndexedDB**, а не в localStorage: туда нужно класть `Blob` фото. Запись `{clientMessageId, chatId, body, attachments: Blob[], createdAt, status}`. Логика повторов как в `app/web/lib/drafts/save-queue`: экспоненциальная пауза, повтор по `online` и `visibilitychange`. Background Sync API есть только в Chromium, поэтому он лишь ускорение. Сначала загружаются вложения, потом POST сообщения с тем же `clientMessageId`. Повтор безопасен благодаря уникальному ключу.
- **Порядок:** неотправленные показываем в конце чата по локальному времени с пометкой «отправляется». После подтверждения сообщение встаёт на место по серверному `seq`. Каждая очередь на чат уходит строго последовательно, чтобы `seq` совпал с порядком набора.
- **Сервис-воркер** кэширует оболочку приложения и, по желанию, последние страницы чатов (stale-while-revalidate). Поток SSE живёт в странице, не в воркере. Push-событие в воркере только показывает уведомление и при клике открывает чат, а свежие данные страница берёт через `sync`.
- **Outbox уведомлений** (закладываем в этапе чатов, используем в PWA): `notification_outbox(id, user_id, kind, ref, channels text[], created_at, sent_at, attempts)`. Воркер решает канал так: пользователь онлайн (есть живой поток) — только «в кабинете»; офлайн N минут — push; не прочитано за сутки — email-дайджест (если появится почта). Строки вставляются в транзакции сообщения, обработка через `SKIP LOCKED`.
- **Web Push идёт через push-службы браузеров (Google, Apple, Mozilla).** Это внешняя зависимость в рантайме вопреки правилу «ноль сторонних SaaS». Полезная нагрузка шифруется, но адресат — иностранный сервис. Рекомендация — push без содержимого («Новое сообщение»), текст подтягивается после открытия. Окончательное решение за пользователем (развилка Р6).

## 9. Нагрузка

Сотни учеников и десятки учителей дают до нескольких сотен одновременных потоков. Оценки памяти на соединение: 2–10 КБ на простаивающее соединение [19], 50–80 КБ для `ws` под нагрузкой [20] (обе MEDIUM). Итог — единицы или десятки МБ, на фоне процесса Node в 150–300 МБ это незаметно. Тысячи сообщений в день — меньше 0,1 записи в секунду в среднем. **Отдельный сервис realtime в Compose не нужен.** Модуль `chat/realtime` держим изолированным (шина и реестр соединений за интерфейсом), чтобы его можно было вынести без переписывания. Условие выноса — больше ~5 тыс. одновременных соединений или второй процесс API. Тогда сначала включаем адаптер NOTIFY, Centrifugo рассматриваем следующим шагом.

## 10. Риски, открытые вопросы, развилки

**Риски:**
- Мобильный Safari и фоновые вкладки рвут любые долгие соединения. Корректность обеспечивает только `sync` при `visibilitychange` и `online`. Тестировать именно этот сценарий.
- Буферизация или gzip на прокси ломает SSE: события приходят пачкой. В e2e нужна проверка «событие пришло меньше чем за 2 с через прокси».
- Выкатка через пересоздание контейнера рвёт все потоки. Клиенты переподключаются с джиттером, иначе получится лавина refresh.
- Публикация в шину до COMMIT или NOTIFY вне транзакции даёт фантомные события. Правило: только после COMMIT.
- Утечка через вложения: каждый маршрут раздачи проверяет членство. Нужен охранный тест (как инвентарь маршрутов зоны учителя в 07.1).

**Развилки для пользователя:**
- **Р1.** Нужен ли индикатор «печатает» и «в сети»? Нет → SSE (рекомендация). Да → `ws` с тем же протоколом синхронизации. Socket.IO не нужен ни в одном случае.
- **Р2.** Одно соединение на браузер (`BroadcastChannel`, ведущая вкладка) или одно на вкладку при включённом HTTP/2. Рекомендация: на вкладку плюс HTTP/2, оптимизировать позже.
- **Р3.** Только фото или ещё PDF и документы (тогда ClamAV и ~1 ГБ ОЗУ).
- **Р4.** Срок хранения переписки и вложений, право на экспорт и удаление по запросу (152-ФЗ, несовершеннолетние), видит ли администратор чужие чаты и пишется ли это в аудит.
- **Р5.** Окно правки и удаления, кто модерирует, нужна ли кнопка «пожаловаться».
- **Р6.** Web Push через внешние push-службы допустим или только уведомления в кабинете и email.
- **Р7.** Кто с кем может переписываться: по умолчанию предлагается учитель ↔ свой ученик и групповой чат учебной группы. Личная переписка ученик ↔ ученик выключена (несовершеннолетние). Решение продуктовое, здесь оно не принимается.

**Открытые вопросы для исследования на этапе:** e2e-проверка SSE через Next rewrites в `yarn dev` и через прокси в production-подобном Compose; HEIC с iPhone в сборке `sharp` (libheif есть не во всех бинарниках); точная величина HTTP/2-лимита потоков на выбранном прокси.

## 11. Источники

1. WHATWG HTML, Server-sent events: ответ не 200 закрывает соединение без повтора, `Last-Event-ID`, комментарий каждые ~15 с — https://html.spec.whatwg.org/multipage/server-sent-events.html (HIGH)
2. nginx, WebSocket proxying: `Upgrade`/`Connection`, `map`, таймаут 60 с — https://nginx.org/en/docs/http/websocket.html (HIGH)
3. MDN, EventSource: 6 соединений на браузер и домен в HTTP/1.1, 100 потоков в HTTP/2 — https://developer.mozilla.org/en-US/docs/Web/API/EventSource (HIGH)
4. ws на npm и GitHub releases, 8.22.0 — https://www.npmjs.com/package/ws , https://github.com/websockets/ws/releases (MEDIUM: версия из поисковой сводки)
5. socket.io на npm, 4.8.x — https://www.npmjs.com/package/socket.io , https://libraries.io/npm/socket.io (MEDIUM)
6. Socket.IO, Connection State Recovery: таблица адаптеров, 2 мин — https://socket.io/docs/v4/connection-state-recovery (HIGH)
7. Socket.IO Postgres adapter 0.5.0: NOTIFY и вспомогательная таблица, CSR не поддерживается — https://socket.io/docs/v4/postgres-adapter/ (HIGH)
8. uWebSockets.js, Apache-2.0, установка с GitHub — https://github.com/uNetworking/uWebSockets.js/ (MEDIUM)
9. Centrifugo releases, v6.9.7 от 2026-09-29 — https://github.com/centrifugal/centrifugo/releases (HIGH)
10. Centrifugo, лицензия Apache-2.0 — https://github.com/centrifugal/centrifugo (HIGH)
11. Centrifugo proxy: connect/refresh/subscribe, `http_headers` — https://centrifugal.dev/docs/server/proxy (HIGH)
12. Centrifugo engines: PostgreSQL broker (экспериментальный) — https://centrifugal.dev/docs/server/engines (HIGH)
13. Centrifugo consumers, PostgreSQL outbox — https://centrifugal.dev/docs/server/consumers (HIGH)
14. Mercure, лицензия AGPL-3.0 — https://mercure.rocks/docs/reference/license (HIGH)
15. Soketi: issues #1114, #1305 — https://github.com/soketi/soketi/issues/1305 (MEDIUM)
16. PostgreSQL 17, NOTIFY — https://www.postgresql.org/docs/17/sql-notify.html (HIGH)
17. Recall.ai, «Postgres LISTEN/NOTIFY does not scale» — https://www.recall.ai/blog/postgres-listen-notify-does-not-scale (MEDIUM)
18. Commitfest «Optimize LISTEN/NOTIFY» (PG 19) — https://commitfest.postgresql.org/patch/5912 (MEDIUM)
19. websocket.org, Connection limits — https://websocket.org/guides/connection-limits/ (MEDIUM)
20. AnyCable, сравнение Node WebSocket-серверов — https://anycable.io/compare/nodejs-websocket/ (MEDIUM)
21. Element, переход Synapse на AGPL — https://element.io/blog/element-to-adopt-agplv3/ (HIGH)
22. Оценки ОЗУ Synapse — https://matrixdocs.github.io/docs/servers/synapse , https://github.com/matrix-org/synapse/issues/8428 (MEDIUM)
23. Tuwunel — https://github.com/matrix-construct/tuwunel (MEDIUM)
24. Rocket.Chat plans — https://docs.rocket.chat/docs/our-plans (MEDIUM)
25. Rocket.Chat system requirements, MongoDB replica set — https://docs.rocket.chat/docs/system-requirements (MEDIUM)
26. Mattermost, Editions and Offerings; v11 changes — https://docs.mattermost.com/product-overview/editions-and-offerings , https://forum.mattermost.com/t/mattermost-v11-changes-in-free-offerings/25126 (MEDIUM)
27. GIGAZINE о лимите в 10 000 сообщений — https://gigazine.net/gsc_news/en/20251226-mattermost-message-limit/ (MEDIUM)
28. Zulip, требования к серверу — https://zulip.readthedocs.io/en/latest/production/requirements.html (HIGH)
29. Tinode — https://github.com/tinode/chat (MEDIUM)
30. Discord и ScyllaDB — https://www.infoq.com/news/2023/06/discord-cassandra-scylladb/ (MEDIUM)
31. Slack и Vitess — https://simonwillison.net/2020/Dec/1/scaling-datastores-slack-vitess/ (MEDIUM)
32. Telegram API, Working with updates — https://core.telegram.org/api/updates (HIGH)
33. PostgreSQL 18 release notes, `uuidv7()` — https://www.postgresql.org/docs/release/18.0/ (HIGH)
34. sharp, Output options: по умолчанию все метаданные удаляются — https://sharp.pixelplumbing.com/api-output (HIGH)

Свои факты о репозитории проверены по файлам: `app/server/src/services/session/cookies.ts`, `app/server/src/config/auth.ts`, `app/web/next.config.ts`, `app/server/src/services/storage/port.ts`, `app/server/package.json`, `plans/beget-migration.md`.
