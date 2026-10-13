# Phase 2: Dependency security - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 2-Dependency security
**Areas discussed:** Версии и порядок апгрейда, Удалять или обновлять, MDX: что не должно исполняться, Тесты и учёт остатка

---

## Версии и порядок апгрейда

### Целевая версия

| Option | Description | Selected |
|--------|-------------|----------|
| Свежайшая стабильная | Последняя стабильная версия линии, закрывающая все advisory (Next 16.3.8, Sharp 0.35.5, Multer 2.4.0, express 4.22.3) | ✓ |
| Минимально достаточная | Next 16.3.6, Sharp 0.35.4, Multer 2.3.0: старше, дольше в обращении, но без последних патчей линии | |
| Свежайшая, но возрастом от 7 дней | Самая новая версия, вышедшая не позже недели назад | |

**User's choice:** Свежайшая стабильная.
**Notes:** DEP-01 называет «Next ≥16.2.11», но 3 critical RCE закрыты только в 16.3.x; Next 16.3.8 требует sharp ^0.35.4 и тянет postcss 8.5.23.

### Форма пина

| Option | Description | Selected |
|--------|-------------|----------|
| ^ с поднятым полом | next ^16.3.8, multer ^2.4.0, sharp ^0.35.5 | ✓ |
| Точные пины без ^ | Всё поднятое пишется точно | |

**User's choice:** ^ с поднятым полом.

### Supply-chain checkpoint

| Option | Description | Selected |
|--------|-------------|----------|
| Один checkpoint перед install | Таблица пакет, версии, дата публикации, ссылка на advisory; одобрение один раз | ✓ |
| Без checkpoint | Исполнитель сверяет с advisory, пользователь смотрит diff lockfile при коммите | |

**User's choice:** Один checkpoint перед install.

### Порядок по планам

| Option | Description | Selected |
|--------|-------------|----------|
| Группами по риску | Удаления и низкорисковые бампы, Next 16.3, Multer и Sharp, next-mdx-remote 6; verify и сборка после каждой | ✓ |
| Одним проходом | Один yarn up, один verify, один коммит | |

**User's choice:** Группами по риску.

### Проверка на Vercel

| Option | Description | Selected |
|--------|-------------|----------|
| Локальная репродукция + preview-деплой | Агент воспроизводит оба buildCommand; пользователь запускает preview-деплой для групп Next и Multer/Sharp | ✓ |
| Только локальная репродукция | Без взаимодействия с Vercel | |

**User's choice:** Локальная репродукция + preview-деплой.

---

## Удалять или обновлять

### Неиспользуемые пакеты

| Option | Description | Selected |
|--------|-------------|----------|
| Удалить всё неиспользуемое | tinymce, pm2, gray-matter, postcss-cli, autoprefixer, sass, @tiptap/* в web и rbac; DEP-01 для TinyMCE становится «удалён» | ✓ |
| Только TinyMCE и tiptap в rbac | Остальное остаётся, advisory записываются как транзитивные | |
| Обновить TinyMCE как в DEP-01 | tinymce до 8.9.x, tiptap в rbac до 3.31.x, ничего не удалять | |

**User's choice:** Удалить всё неиспользуемое.
**Notes:** по поиску по репозиторию пакеты упоминаются только в package.json; редактор на Lexical.

### lodash

| Option | Description | Selected |
|--------|-------------|----------|
| Поднять до 4.18.1 | Только бамп, use-debounce.ts не трогаем | ✓ |
| Заменить на свой debounce | Свой debounce с maxWait и тестами, убрать lodash и @types/lodash из web | |

**User's choice:** Поднять до 4.18.1.
**Notes:** lodash тянут также recharts, archiver-utils, async; use-debounce.ts переписывается в Phase 8.

---

## MDX: что не должно исполняться

### Что должно работать без изменений

| Option | Description | Selected |
|--------|-------------|----------|
| Разметка и style да, выражения нет | Markdown, таблицы, inline style, картинки остаются; {выражения}, import/export, скрипты перестают исполняться; при потере style адаптируем плагины | ✓ |
| Стили можно потерять | Если безопасный режим вырежет inline style, принимаем | |
| Выражения в контенте есть | Нужны blockJS: false + blockDangerousJS, скан настоящих текстов | |

**User's choice:** Разметка и style да, выражения нет.

### Где доказываем

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest: матрица пейлоадов | buildMdxOptions + serialize + рендер MDXRemote в Node, пейлоады и эталоны, в yarn verify | ✓ |
| Vitest + один e2e в браузере | Плюс Playwright-случай с вредоносным текстом в seed | |

**User's choice:** Vitest: матрица пейлоадов.

### Проверка реальных текстов

| Option | Description | Selected |
|--------|-------------|----------|
| Эталоны + глазами на preview | Эталоны на фикстурах и пункт в preview-checkpoint: пользователь сравнивает несколько оформленных реальных тестов с продом | ✓ |
| Скан всех файлов скриптом, запускает пользователь | Read-only скрипт по prompt.md/explanation.md в Storage, сравнение старого и нового рендера | |

**User's choice:** Эталоны + глазами на preview.
**Notes:** тексты вопросов лежат файлами в Storage, SQL их не сканирует; агенты к проду не ходят.

---

## Тесты и учёт остатка

### Порядок тестов

| Option | Description | Selected |
|--------|-------------|----------|
| Сначала тесты, потом апгрейд | Первый план — тесты на старых версиях: загрузки и proxy зелёные, MDX-тест красный на next-mdx-remote 5 | ✓ |
| Тесты после апгрейда | Как в plans/002: сначала бампы | |

**User's choice:** Сначала тесты, потом апгрейд.

### Уровень тестов

| Option | Description | Selected |
|--------|-------------|----------|
| Разный уровень по природе | Загрузки, Sharp, MDX — Vitest в verify; proxy-обходы — Playwright API-запросы в yarn e2e | ✓ |
| Всё в e2e | Все новые проверки как Playwright API-тесты | |
| Только Vitest | proxy.ts проверяется вызовом proxy(NextRequest) | |

**User's choice:** Разный уровень по природе.

### Глубина по транзитивам

| Option | Description | Selected |
|--------|-------------|----------|
| Лок-рефреш + resolutions для прода | yarn up -R для патчей в диапазоне; resolutions только для production-достижимых high/critical; dev- и build-инструменты записываются | ✓ |
| Только лок-рефреш, без resolutions | Всё остальное записывается | |
| Закрыть максимум, включая dev | Обнулить аудит, включая замену типов @vercel/node | |

**User's choice:** Лок-рефреш + resolutions для прода.

### Запись остатка

| Option | Description | Selected |
|--------|-------------|----------|
| docs/security, без CI-аудита | docs/security/dependency-audit.md в git, без аудита в CI и verify | ✓ |
| docs/security + информационный audit в CI | Тот же документ плюс неблокирующий CI-job | |
| Только в .planning | Запись в артефактах фазы, не коммитится | |

**User's choice:** docs/security, без CI-аудита.
**Notes:** `.planning` в `.gitignore`, запись там не попала бы в git.

---

## Claude's Discretion

- Как разделить Группы 2 и 3 при общем Sharp.
- Механизм ожидаемо падающего MDX-теста и состав фикстур-эталонов.
- Какие транзитивы закрывать `yarn up -R`, какие `resolutions`.
- Убирать ли устаревший `@types/sharp`.
- Насколько глубоко тесты загрузок идут внутрь обработчика (изолированный режим WR-04).
- Формат таблицы в `docs/security/dependency-audit.md`.

## Deferred Ideas

- Периодический информационный audit-шаг в CI.
- Перенос компиляции MDX с клиента на сервер.
- Замена lodash-debounce своей реализацией — Phase 8.
- Замена типа `@vercel/node` — Milestone 2.
