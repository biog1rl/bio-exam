# Bio-Exam Server

Express API платформы тестирования Bio-Exam: данные, авторизация и правила доступа живут здесь
(ADR-0001, `docs/adr/0001-express-owns-data-and-access-policy.md`). Web только показывает то, что решил сервер.

Это краткий обзор. Точные маршруты и их параметры не перечислены, потому что они живут в коде и меняются:
смотрите `src/routes/index.ts` и используйте `codegraph explore "<маршрут или символ>"`.

## Области API

Все маршруты, кроме проверки здоровья, лежат под префиксом `/api`.

| Область         | Префикс                           | Назначение                                               |
| --------------- | --------------------------------- | -------------------------------------------------------- |
| Авторизация     | `/api/auth`, `/api/auth/refresh`  | вход, выход, текущий пользователь, приглашения           |
| Пользователи    | `/api/users`                      | профили, роли пользователей, аватары                     |
| Группы          | `/api/groups`                     | учебные группы и их состав                               |
| Права           | `/api/rbac`                       | роли, выдача и снятие прав поверх реестра ролей          |
| Тесты и попытки | `/api/tests`, `/api/tests/public` | банк вопросов, тесты, назначения, попытки и разбор       |
| Поиск           | `/api/search`                     | поиск по вопросам и тестам                               |
| Настройки       | `/api/settings`                   | настройки платформы                                      |
| Сайдбар         | `/api/sidebar`                    | пункты меню                                              |
| Документы       | `/api/docs/assets`                | файлы и вложения (хранилище Supabase или локальный диск) |
| Здоровье        | `/healthz/db`                     | проверка соединения с базой                              |

## Правила доступа

- Вход выдаёт cookie сессии с JWT (`SESSION_COOKIE_NAME`, срок `SESSION_MAX_AGE_DAYS`); токены обновляются через
  `/api/auth/refresh`.
- Маршруты, которым нужен пользователь, закрыты `sessionRequired()`, остальные видят сессию через `sessionOptional()`.
- Права считаются из ролей (`admin`, `user` в `packages/rbac`) и переопределений в базе. Маршрут требует право
  `домен.действие` через `requirePerm('домен', 'действие')`, например `tests.write` или `rbac.read`.
- Правила доступа решает только Express (ADR-0001). Проверок прав в web на замену серверным нет.

## Шаблоны вопросов

Тип вопроса задаётся одним из пяти шаблонов интерфейса (`src/lib/tests/question-types.ts`), у каждого своя метрика ошибок:

- `single_choice`: один правильный вариант из списка;
- `multi_choice`: несколько правильных вариантов, ошибка считается по расстоянию между наборами;
- `matching`: сопоставление пар, ошибка считается по числу неверных пар;
- `short_text`: короткий текстовый ответ, сравнение без учёта пробелов, допускается набор верных ответов;
- `sequence_digits`: последовательность цифр, ошибка считается по расстоянию Хэмминга.

## Запуск и миграции

Команды выполняются из корня репозитория, окружение берётся из `app/server/.env` (пример: `app/server/.env.example`).

```bash
yarn workspace @bio-exam/server dev
yarn workspace @bio-exam/server build
yarn workspace @bio-exam/server start
yarn workspace @bio-exam/server drizzle:generate
yarn workspace @bio-exam/server drizzle:migrate
yarn workspace @bio-exam/server seed
yarn workspace @bio-exam/server bootstrap:admin
```

- `dev` запускает сервер с перезагрузкой, `build` и `start` собирают и запускают `dist`.
- `drizzle:generate` создаёт новую миграцию из `src/db/schema.ts`, `drizzle:migrate` применяет `drizzle/` к базе из
  `DATABASE_URL`. Применённые миграции не редактируются.
- `seed` создаёт роли из `packages/rbac`, `bootstrap:admin` создаёт первого администратора по `ADMIN_BOOTSTRAP_*`.
- Против боевой базы миграции не запускают из разработки: это отдельная осознанная операция.

## Тесты

```bash
yarn workspace @bio-exam/server test
node scripts/with-test-db.mjs yarn workspace @bio-exam/server test
```

Первая команда запускает Vitest. Тестам, которым нужна база, требуется `TEST_DATABASE_URL`: одноразовую базу `test_*`
с ним даёт вторая команда или `yarn verify`. Тесты изолированы (`BIO_EXAM_ISOLATED_ENV=1`): они не читают `.env`, а адрес базы берут только
из `TEST_DATABASE_URL` и принимают лишь локальные базы с именем `test_*`.
