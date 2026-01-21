# its-doc server

Сервис, который управляет файловым деревом Markdown/MDX‑документов, отдает контент по HTTP и поддерживает полнотекстовый поиск с «умной» транслитерацией.

## Содержание
- [Краткое описание](#краткое-описание)
- [Быстрый старт](#быстрый-старт)
- [Скрипты npm](#скрипты-npm)
- [Переменные окружения](#переменные-окружения)
- [Технологический стек](#технологический-стек)
- [Архитектура и файлы](#архитектура-и-файлы)
- [API](#api)
- [Почему импорты оканчиваются на-js](#почему-импорты-оканчиваются-на-js)
- [Работа с Markdown-контентом](#работа-с-markdown-контентом)

## Краткое описание
- HTTP-сервер на Express (`src/index.ts`) поднимает API на `/api/docs`, обрабатывает CORS и выполняет healthcheck на `/healthz`.
- Любые операции с контентом ведутся относительно каталога `DOCS_ROOT` (по умолчанию `../../md`, см. `.env`).
- `docs.service.ts` отвечает за обход дерева, чтение/запись Markdown, генерацию slug’ов и безопасность путей.
- `search.service.ts` строит индекс MiniSearch, следит за изменениями через chokidar и поддерживает tolerant-поиск (ASCII fold, транслитерация).
- Утилиты `fs-safe` и `transliterate` гарантируют безопасную работу с файловой системой и генерацию URL-дружественных путей.

## Быстрый старт
1. Установите зависимости: `yarn` или `npm install`.
2. Проверьте переменные в `.env` (минимум `DOCS_ROOT`, `PORT`, `ALLOWED_ORIGIN`).
3. Запустите dev-режим: `yarn dev` (использует `tsx watch`).
4. Сборка: `yarn build`, запуск production-сборки: `yarn start`.
5. Убедитесь, что каталог `DOCS_ROOT` содержит нужную структуру Markdown/MDX (каждый документ хранится без расширения в запросах, но физически лежит как `.md`/`.mdx`).

## Скрипты npm
- `yarn dev` — живой сервер через `tsx watch`, пересобирает TypeScript налету.
- `yarn build` — компиляция в `dist/` (`tsc` с `moduleResolution: NodeNext`).
- `yarn start` — запуск готовой сборки `node dist/index.js` с sourcemap.
- `yarn typecheck` — статический анализ TypeScript без эмита.

## Переменные окружения
- `DOCS_ROOT` — абсолютный или относительный путь к каталогу с документацией (по умолчанию `../../md`).
- `PORT` — порт HTTP-сервера (по умолчанию `4000`).
- `ALLOWED_ORIGIN` — список доменов, которым разрешён CORS (через запятую).

## Технологический стек
- **Node.js 18.17+ / Express 4** — web-сервер и маршрутизация.
- **TypeScript 5 (ESM, `module: "NodeNext"`)** — строгая типизация и современный импорт.
- **tsx** — запуск TypeScript без ручной компиляции в dev-режиме.
- **gray-matter** — работа с frontmatter в Markdown/MDX.
- **chokidar** — наблюдение за изменениями файлов для поиска.
- **MiniSearch** — полнотекстовый индекс с fuzziness и кастомной токенизацией.
- **cyrillic-to-translit-js** — транслитерация для slug’ов и поиска.
- **remove-markdown** — очистка Markdown до plain text для индекса.
- **dotenv / cors** — конфигурация окружения и контроль доступа.

## Архитектура и файлы

### Точка входа
- `src/index.ts` — инициализация Express, настройка CORS, регистрация JSON-парсера и роутов. Здесь же рассчитывается `DOCS_ROOT` и запускается сервер.

### Конфигурация
- `src/config/docs.ts` — экспортирует `DOCS_ROOT` (из `.env` или дефолт) и хелпер `toPosix`, выравнивающий пути.

### Утилиты
- `src/lib/fs-safe.ts` — `resolveSafe` не позволяет выйти за пределы `DOCS_ROOT`, `isAllowedFile` фильтрует расширения.
- `src/lib/transliterate.ts` — преобразует кириллицу в латиницу для URL-слуг; дополнительно предоставляет обратную транслитерацию.
- `src/types/cyrillic-to-translit-js.d.ts` — локальная декларация типов для сторонней библиотеки.

### Сервисы
- `src/services/docs.service.ts`
  - `readDir(rel, deep)` — возвращает `DocNode[]` каталога: фильтрует скрытые элементы, читает `index.mdx`, кэширует наличие вложенных файлов.
  - `getFile(rel)` — ищет `.mdx`/`.md`, считает frontmatter+контент через `gray-matter`.
  - `saveFile({ rel, body, frontmatter })` — валидирует путь, сливает frontmatter и сохраняет документ.
  - `createDraftSlug({ title, parent })` — генерирует уникальный slug с трансформацией `transliterate` и проверкой на коллизии.
  - `createFolder` / `deleteEntry` — CRUD для каталогов/файлов, используют `resolveSafe`.
  - Дополнительно: матчит элементы по slug/case-insensitive, определяет «видимость» узлов, читает метаданные директории.
- `src/services/search.service.ts`
  - `buildSearchIndex()` — строит MiniSearch по всему дереву (`readDir('', true)` ➜ `flattenFiles`), настраивает токенизацию (`tokenizeUnicode`) и процессинг терминов (ASCII fold + транслитерация).
  - Подписывается на изменения в `DOCS_ROOT` (chokidar) и при `add/change/unlink` обновляет индекс в памяти.
  - `searchInIndex(query, limit, offset)` — расширяет запрос (транслит + ASCII), ищет с fuzziness, ранжирует по score и готовит HTML-сниппеты через `highlight`.

### Маршруты
- `src/routes/index.ts` — группирует все роуты (пока только `/docs`).
- `src/routes/docs/*.ts` — отдельные сегменты API:
  - `tree.ts` — `GET /api/docs/tree?path=&full=`: дерево каталога (опция `full` рекурсивно подгружает `children`).
  - `entries.ts` — `GET /api/docs/entries?path=&deep=`: список узлов + `DirInfo` (название, флаг `hasIndex`, наличие дочерних документов).
  - `files.ts` — `GET /api/docs/files?path=` читает документ; `PUT /api/docs/files` сохраняет тело и frontmatter.
  - `folders.ts` — `POST /api/docs/folders` создаёт каталог.
  - `drafts.ts` — `POST /api/docs/drafts` возвращает безопасный slug по title и опциональному parent.
  - `search.ts` — `GET /api/docs/search?q=&limit=&offset=` ищет по индексу (lazy-построение `buildSearchIndex`).

## API
- `GET /healthz` — простой healthcheck `{ ok: true }`.
- `GET /api/docs/tree` — дерево разделов.
- `GET /api/docs/entries` — содержимое каталога + метаданные.
- `GET /api/docs/files` — Markdown/MDX документ (frontmatter + body).
- `PUT /api/docs/files` — сохранение документа.
- `POST /api/docs/folders` — создание папки.
- `POST /api/docs/drafts` — генерация slug’а для черновика.
- `GET /api/docs/search` — полнотекстовый поиск по индексу.

Ответы используют POSIX-пути (`/`), чтобы совпадать с URL-фронтенда. Исключения и ошибки возвращаются в виде `{ error: string }` с корректными HTTP-кодами (`400`, `404`, `500`).

## Почему импорты оканчиваются на `.js`
Проект работает в ESM-режиме (`"type": "module"` в `package.json` и `moduleResolution: "NodeNext"` в `tsconfig.json`). TypeScript компилирует `.ts` в `.js`, и Node.js в ESM требует точные расширения при `import`. Поэтому в исходниках `import x from './file.js'` — так рантайм без бандлера корректно найдёт скомпилированный `file.js` в `dist/`. Это также устраняет расхождения между dev-режимом (`tsx`) и production-запуском (`node dist/...`).

## Работа с Markdown-контентом
- В Git сохраняются файлы `.md`/`.mdx`, но API оперирует путями без расширений (удобно для URL и slug’ов).
- `gray-matter` автоматически парсит frontmatter и сохраняет его обратно при записи.
- `DocNode.hasIndex` сигнализирует, есть ли `index.mdx` внутри раздела, а `hasChildren` показывает, содержатся ли вложенные документы.
- Поиск и генерация slug’ов учитывают кириллицу: `transliterate` приводит названия к латинице, `asciiFold` убирает диакритику, а MiniSearch ищет по нескольким вариантам слова.
- Chokidar в dev/prod следит за файлами в `DOCS_ROOT`, поэтому индексация поиска не требует ручных перезапусков.

---

Если понадобятся новые эндпоинты, удобнее добавить их в `src/routes/docs/` и использовать уже готовые сервисы (`docs.service.ts`, `search.service.ts`), чтобы сохранить единые правила трансформации путей и доступ к файловой системе.
