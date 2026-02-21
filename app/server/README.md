# Bio-Exam Server

Express.js сервер для платформы тестирования Bio-Exam.

## Структура проекта

```
src/
├── app.ts                    # Express приложение
├── index.ts                  # Точка входа
├── config/                   # Конфигурация
│   ├── auth.ts               # JWT и сессии
│   └── env.ts                # Загрузка переменных окружения
├── db/                       # База данных
│   ├── index.ts              # Drizzle ORM
│   ├── schema.ts             # Схемы таблиц
│   └── seed.ts               # Инициализация БД
├── lib/                      # Утилиты
│   ├── constants.ts          # HTTP статусы, сообщения ошибок
│   ├── errors.ts             # Класс ApiError
│   ├── fs-safe.ts            # Безопасная работа с путями
│   └── transliterate.ts      # Транслитерация
├── middleware/               # Middleware
│   ├── auth/
│   │   ├── session.ts        # JWT сессии
│   │   ├── requirePerm.ts    # Проверка прав (RBAC)
│   │   └── basic-admin.ts    # Basic Auth для админа
│   ├── rateLimiter.ts        # Rate limiting
│   └── validateParams.ts     # Валидация UUID
├── routes/                   # API маршруты
│   ├── auth/                 # Аутентификация
│   ├── users/                # Управление пользователями
│   ├── tests/                # Тесты и темы
│   ├── rbac/                 # Права доступа
│   ├── sidebar/              # Меню сайдбара
│   └── db/                   # Health checks
├── schemas/                  # Zod валидации
│   ├── users.ts
│   ├── tests.ts
│   └── rbac.ts
├── services/                 # Бизнес-логика
│   ├── rbac/                 # RBAC система
│   └── storage/              # Supabase Storage
└── types/                    # TypeScript типы
    ├── api.ts
    └── db/
```

## API Endpoints

### Аутентификация (`/api/auth`)

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| POST | `/login` | Вход в систему | Public (rate limited) |
| POST | `/logout` | Выход | Public |
| GET | `/me` | Текущий пользователь | Optional session |
| POST | `/invites` | Создать приглашение | `users.invite` |
| GET | `/invites/validate/:token` | Проверить токен | Public |
| POST | `/invites/accept` | Активировать аккаунт | Public |

### Пользователи (`/api/users`)

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/` | Список пользователей | `users.read` |
| PATCH | `/:id` | Обновить пользователя | `users.edit` |
| DELETE | `/:id` | Удалить пользователя | `users.edit` |
| PATCH | `/profile` | Обновить свой профиль | Session |
| POST | `/profile/password` | Сменить пароль | Session |
| POST | `/avatar` | Загрузить аватар | Session |
| DELETE | `/avatar` | Удалить аватар | Session |

### Тесты (`/api/tests`)

**Административные маршруты:**

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/topics` | Список тем | `tests.write` |
| POST | `/topics` | Создать тему | `tests.write` |
| PATCH | `/topics/:id` | Редактировать тему | `tests.write` |
| DELETE | `/topics/:id` | Удалить тему | `tests.write` |
| GET | `/` | Список тестов | `tests.write` |
| GET | `/:id` | Тест для редактирования | `tests.write` |
| POST | `/save` | Создать тест | `tests.write` |
| PATCH | `/:id/settings` | Обновить настройки теста | `tests.write` |
| POST | `/:id/questions` | Создать вопрос | `tests.write` |
| PATCH | `/:id/questions/:questionId` | Обновить вопрос | `tests.write` |
| PUT | `/:id/questions/reorder` | Изменить порядок вопросов | `tests.write` |
| DELETE | `/:id/questions/:questionId` | Удалить вопрос | `tests.write` |
| POST | `/:id/questions/:questionId/move` | Перенести вопрос | `tests.write` |
| DELETE | `/:id` | Удалить тест | `tests.write` |
| GET | `/:id/export` | Экспорт теста (ZIP) | `tests.write` |
| GET | `/topics/:slug/export` | Экспорт темы (ZIP) | `tests.write` |

**Публичные маршруты (`/api/tests/public`):**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/topics` | Активные темы |
| GET | `/topics/:slug/tests` | Опубликованные тесты темы |
| GET | `/tests/:slug` | Тест без ответов |
| POST | `/tests/:id/submit` | Отправить ответы |

### RBAC (`/api/rbac`)

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/roles` | Список ролей | `rbac.read` |
| POST | `/grant` | Добавить grant роли | `rbac.write` |
| DELETE | `/grant` | Удалить grant роли | `rbac.write` |
| GET | `/user/:id/grants` | Права пользователя | `rbac.read` |
| POST | `/user/grant` | User override | `rbac.write` |
| DELETE | `/user/grant` | Удалить override | `rbac.write` |
| GET | `/pages` | Page rules | `rbac.read` |
| POST | `/pages` | Создать page rule | `rbac.write` |
| PATCH | `/pages/:id` | Обновить page rule | `rbac.write` |
| DELETE | `/pages/:id` | Удалить page rule | `rbac.write` |

### Сайдбар (`/api/sidebar`)

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/` | Активные пункты меню | Public |
| GET | `/all` | Все пункты меню | `settings.manage` |
| POST | `/` | Создать пункт | `settings.manage` |
| PUT | `/:id` | Обновить пункт | `settings.manage` |
| PATCH | `/reorder` | Изменить порядок | `settings.manage` |
| DELETE | `/:id` | Удалить пункт | `settings.manage` |

### Health Checks

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/healthz` | Базовая проверка |
| GET | `/healthz/db` | Проверка БД с версией |

## Middleware

### Session (`session.ts`)

- **`sessionOptional()`** - читает JWT из cookie, не блокирует запрос
- **`sessionRequired()`** - требует авторизацию, возвращает 401

Cookie параметры:
- `HttpOnly` - защита от XSS
- `SameSite=Lax` - защита от CSRF
- `Secure` - только HTTPS в production
- `Max-Age` - 30 дней по умолчанию

### Rate Limiter (`rateLimiter.ts`)

- In-memory хранилище
- По умолчанию: 5 попыток / 60 секунд на IP
- Автоочистка каждые 5 минут
- Поддержка `X-Forwarded-For`
- Заголовки: `Retry-After`, `X-RateLimit-*`

### RBAC (`requirePerm.ts`)

- **`requirePerm(domain, action)`** - проверка права
- **`requirePermKey(key)`** - проверка по ключу

### UUID Validation (`validateParams.ts`)

- Regex валидация UUID v4
- Middleware для автопроверки параметров

## Сервисы

### RBAC Service

Иерархия прав:
1. Дефолтные права ролей
2. Role-level grants (allow/deny)
3. User-level grants (высший приоритет)

Формат: `domain.action` (например: `tests.write`, `users.read`)

Функции:
- `buildPermissionSet(roles)` - права для ролей
- `buildPermissionSetForUser(userId)` - эффективные права пользователя
- `invalidateRBACCache()` - очистка кэша

### Storage Service

Интеграция с Supabase Storage.

Функции:
- `readFile(path)` / `writeFile(path, content)`
- `readJson<T>(path)` / `writeJson(path, data)`
- `deleteFiles(paths)` / `deleteDirectory(prefix)`
- `listFiles(prefix)` / `listFilesRecursive(prefix)`
- `createZip(basePath, includeAnswers)`
- `exists(path)`

Retry: экспоненциальная задержка, 3 попытки.

## Типы вопросов в тестах

- **`radio`** - одиночный выбор
- **`checkbox`** - множественный выбор
- **`matching`** - соответствие пар

## Конфигурация

### Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DATABASE_URL` | PostgreSQL DSN | - |
| `AUTH_JWT_SECRET` | JWT секрет | `dev-secret-change-me` |
| `SESSION_COOKIE_NAME` | Имя cookie | `bio_exam_session` |
| `SESSION_MAX_AGE_DAYS` | Время жизни сессии | `30` |
| `ALLOWED_ORIGIN` | CORS origins (через запятую) | - |
| `NODE_ENV` | Окружение | `development` |
| `LOG_LEVEL` | Уровень логов | `info` |
| `PORT` | Порт сервера | `3000` |
| `SUPABASE_URL` | Supabase URL | - |
| `SUPABASE_SERVICE_KEY` | Supabase ключ | - |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket | - |
| `ADMIN_LOGIN` | Логин админа (Basic Auth) | - |
| `ADMIN_PASSWORD_HASH` | Хеш пароля админа | - |

### Приоритет загрузки .env

1. `app/server/.env` (высший)
2. `cwd/.env`
3. `app/.env`
4. `repo/.env`

## Безопасность

- JWT в HttpOnly cookie с SameSite=Lax
- Rate limiting на `/login`
- Защита от timing-атак (dummy bcrypt hash)
- Многоуровневая RBAC система
- Helmet.js security headers
- UUID валидация параметров
- Bcrypt хеширование (12 rounds)
- Safe path resolution
- CORS контроль

## Обработка ошибок

Класс `ApiError` с методами:
- `ApiError.badRequest(msg)` - 400
- `ApiError.unauthorized(msg)` - 401
- `ApiError.forbidden(msg)` - 403
- `ApiError.notFound(msg)` - 404
- `ApiError.conflict(msg)` - 409
- `ApiError.tooManyRequests(msg)` - 429
- `ApiError.internal(msg)` - 500

## Технологии

- **Runtime:** Node.js
- **Framework:** Express.js
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL
- **Validation:** Zod
- **Auth:** JWT + bcrypt
- **Storage:** Supabase Storage
- **Logging:** Pino
- **Security:** Helmet.js

## Запуск

```bash
# Установка зависимостей
yarn install

# Разработка
yarn dev

# Production build
yarn build
yarn start
```
