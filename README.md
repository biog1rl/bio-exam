# bio-exam

Платформа тестирования по биологии: администраторы и преподаватели составляют тесты из вопросов пяти шаблонов,
назначают их группам и пользователям, а ученики проходят попытки и смотрят разбор. Монорепозиторий на Yarn 4:
веб-клиент на Next.js (`app/web`), API на Express с PostgreSQL и Drizzle (`app/server`), общий пакет прав (`packages/rbac`), общий пакет доменной логики экзамена (`packages/exam-core`).

## Что нужно установить

- Node 24: версия записана в `.nvmrc`, например `nvm install` в корне репозитория.
- Corepack и Yarn 4.12: `corepack enable`, дальше Yarn нужной версии подтянется сам из поля `packageManager`.
- PostgreSQL 17: `brew install postgresql@17`. Нужен для разработки, для `yarn verify` и для `yarn e2e`.

## Установка

```bash
corepack enable
yarn install
```

В репозитории один lock-файл, корневой `yarn.lock`. Второй (`package-lock.json` и подобные) не создавайте:
`yarn verify` такое отклонит.

## Настройка окружения

Для каждого приложения есть пример с пояснениями на русском:

1. Скопируйте `app/server/.env.example` в `app/server/.env` и `app/web/.env.example` в `app/web/.env`.
2. Заполните значения локально. Реальные значения в репозиторий не коммитятся: `.env` в `.gitignore`.
3. `AUTH_JWT_SECRET` в обоих файлах должен совпадать (случайная строка не короче 32 символов).

`DATABASE_URL` для разработки указывает только на локальную базу. Адрес боевой базы (пулер Supabase с живыми
данными) нельзя использовать ни для разработки, ни для миграций, ни для тестов: миграция или тест против боевой базы
меняет настоящие данные. Тесты и e2e сами поднимают одноразовую базу и никогда не читают `.env`.

Ключ `NEXT_IGNORE_INCORRECT_LOCKFILE` в `app/web/.env` устарел после перехода на один `yarn.lock`: его можно удалить.

Проверка соответствия примеров коду входит в `yarn verify` (шаг `env-contract`).

## Запуск для разработки

Создайте локальную базу и впишите её адрес в `DATABASE_URL` обоих `.env`, затем примените миграции и заполните роли:

```bash
yarn workspace @bio-exam/server drizzle:migrate
yarn workspace @bio-exam/server seed
yarn workspace @bio-exam/server bootstrap:admin
```

`bootstrap:admin` создаёт первого администратора по ключам `ADMIN_BOOTSTRAP_*` из `app/server/.env`.
Запуск обоих приложений:

```bash
yarn dev
```

Web открывается на `http://localhost:3000`, API на `http://localhost:4000`.

## Проверка: `yarn verify`

```bash
yarn verify
```

Единый вход в проверку репозитория, локально и в CI. Команда сама поднимает временный PostgreSQL 17 и одноразовую
базу `test_*`, а по окончании удаляет их. Шаги идут по порядку и останавливаются на первом провале:

1. `lockfile`: в репозитории только `yarn.lock`;
2. `env-contract`: примеры `.env.example` совпадают с ключами, которые читает код, и не содержат секретов;
3. `docs-commands`: команды `yarn ...` в README и `AGENTS.md` существуют;
4. `ci-workflow`: CI только читает репозиторий: без записи, секретов и публикации;
5. `format-check`: `oxfmt --check .`, форматирование репозитория;
6. `lint-typecheck-test`: `turbo run lint typecheck test` по `packages/rbac`, `packages/exam-core`, `app/server` и `app/web`;
7. `migrations`: цепочка миграций Drizzle с нуля совпадает со схемой;
8. `script-tests`: тесты корневых скриптов.

Успешный прогон заканчивается строкой `yarn verify: OK`, неуспешный строкой `yarn verify: FAILED at <шаг>`.
Если PostgreSQL 17 не найден и `TEST_DATABASE_URL` не задан, команда падает с подсказкой, шаги с базой не пропускаются.

Отдельная команда против временной базы:

```bash
node scripts/with-test-db.mjs yarn workspace @bio-exam/server drizzle:migrate
```

Она поднимает защищённую базу `test_*`, выставляет `BIO_EXAM_ISOLATED_ENV=1` и `TEST_DATABASE_URL`, выполняет
команду и удаляет базу. Миграции боевой базы это отдельная осознанная операция, не часть разработки и не часть тестов.

## Сквозные тесты: `yarn e2e`

```bash
yarn playwright install chromium
yarn e2e
```

Браузер ставится один раз. Дальше `yarn e2e` собирает `packages/rbac` и `packages/exam-core`, поднимает одноразовую базу, применяет
миграции, заполняет её детерминированными данными, собирает web и запускает Playwright на настольном и мобильном
профилях. `yarn e2e --grep @flow1` передаёт аргументы в Playwright, `yarn e2e --seed-only` останавливается после
заполнения базы. `yarn e2e` не входит в `yarn verify`.

## Структура репозитория

- `app/web`: веб-клиент на Next.js 16 и React 19;
- `app/server`: Express API, схема и миграции Drizzle (`drizzle/`), сервисы, тесты;
- `packages/rbac`: роли, домены и права, общие для web и сервера;
- `packages/exam-core`: доменная логика экзамена, общая для web и сервера (ADR-0002);
- `e2e`: сценарии Playwright и фикстуры;
- `scripts`: `yarn verify`, `yarn e2e`, проверки репозитория и обёртка `with-test-db.mjs`;
- `docs/adr`: архитектурные решения, читайте нужное перед правкой авторизации, домена экзаменов, хранилища и модулей;
- `plans`: планы работ и их порядок (`plans/README.md`).

## Соглашения

- Форматирование и линтинг: oxfmt и oxlint. `yarn format` форматирует репозиторий, `yarn lint` запускает линтеры.
- Хеш разового коммита, который только переформатировал дерево, попадёт в `.git-blame-ignore-revs`,
  чтобы `git blame` его пропускал (`git config blame.ignoreRevsFile .git-blame-ignore-revs`).
- Изменения со схемой базы идут через миграции Drizzle; применённые миграции не редактируются.
- Описание API и правил доступа сервера: `app/server/README.md`. Агентам и ассистентам: `AGENTS.md`.
