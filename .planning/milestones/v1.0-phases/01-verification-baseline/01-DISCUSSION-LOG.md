# Phase 1: Verification baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 01-verification-baseline
**Areas discussed:** Временная БД для тестов, Строгость yarn verify, CI, Доки и проектные скиллы, Тесты (Vitest/Playwright)

---

## Временная БД для тестов

| Option | Description | Selected |
|--------|-------------|----------|
| Homebrew pg_ctl | Чистый кластер PG 17 во временной папке; в CI postgres:17 | ✓ |
| Docker / OrbStack | postgres:17 в контейнере, нужна установка Docker | |
| Домашний сервер | Временная база на kirill@192.168.1.2 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Отдельная переменная + проверка хоста | TEST_DATABASE_URL, только localhost и `test_*` | ✓ |
| Только отдельная переменная | Без проверки хоста | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| verify сам поднимает БД | Поднять, прогнать, погасить; без PG — понятная ошибка | ✓ |
| Отдельная команда verify:db | | |
| Пропускать без БД | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Только актуальный снапшот | | ✓ (free text) |
| Всю цепочку | | |
| You decide | | |

**User's choice:** «актуальный, и нам ещё надо перевести проект на обновлённый drizzle v1».

| Option | Description | Selected |
|--------|-------------|----------|
| v1 в фазе 1, вместе со снапшотом | Сразу формат v1, без двойной работы | ✓ |
| v1 в фазе 2 | С остальными зависимостями | |
| Отдельная фаза | | |

**Notes:** Пользователь спросил, не переписать ли слой БД целиком («может там вообще запросы неправильные»). Ответ: около 24 файлов и 76 relational-запросов; известные дефекты запросов локальны и лежат в модулях ADR-0005 (фазы 4/5/7/8); переписывать без тестов рискованно.

| Option | Description | Selected |
|--------|-------------|----------|
| Механический переход | Пакеты 1.x, формат миграций v1, совместимость db.query | ✓ |
| Переход + сразу новый API везде | | |
| Аудит запросов отдельно | | |

**Notes:** «С Supabase мы тоже съезжаем, всё будет своё на своём сервере». Цепочка миграций переносима на чистый PG 17 (0018 сама создаёт схему `extensions`).

---

## Строгость yarn verify

**User's choice (free text):** «нужен переход на ox экосистему». Уточнение: «А что лучше? Нам нужен tsdown?» → объяснено: tsup не развивается, tsdown почти прямая замена, exam-core в фазе 3 стартует на нём.

| Option | Description | Selected |
|--------|-------------|----------|
| oxlint + oxfmt + tsdown | ESLint/Prettier удаляются, rbac на tsdown | ✓ |
| oxlint + oxfmt, tsup остаётся | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Всё равно oxfmt | Даже без паритета сортировки Tailwind/импортов | ✓ |
| Prettier только для недостающего | | |
| Отложить oxfmt | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Один отдельный коммит переформатирования | + .git-blame-ignore-revs | ✓ |
| Только тронутые файлы | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Чиним ошибки, массовое — в warn | | ✓ |
| Чиним всё | | |
| You decide | | |

---

## CI

| Option | Description | Selected |
|--------|-------------|----------|
| PR + push в master | | ✓ |
| Только PR | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Build в CI да, в verify нет | | ✓ |
| И в CI, и в verify | | |
| Без build | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Рекомендательно, без блокировки | Прямые пуши в master работают | ✓ |
| Обязательная для PR | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Сверка со схемой прода однократно | read-only pg_dump --schema-only | ✓ |
| Не сверяем | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Кеш Yarn + Turbo в actions/cache | | ✓ |
| Turbo remote cache (Vercel) | | |
| You decide | | |

---

## Доки и проектные скиллы

| Option | Description | Selected |
|--------|-------------|----------|
| Отложить скиллы после фаз 3–5 | | ✓ |
| Делать сейчас тонкими | | |
| Не делать совсем | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Русский | | ✓ |
| Английский | | |

| Option | Description | Selected |
|--------|-------------|----------|
| server/README — короткий обзор | | ✓ |
| Полный список маршрутов | | |

---

## Тесты (Vitest / Playwright)

**User's request:** «давай вместо vitest сделаем playwright e2e». Объяснено, что это разные уровни и ADR-0002/0004/0005 опираются на модульные тесты.

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + Playwright e2e | Playwright уже в фазе 1 как внешняя страховка | ✓ |
| Только Playwright | Нужен новый ADR вместо 0003 | |
| Vitest сейчас, Playwright позже | | |

**E2E flows selected:** Вход и выход, Прохождение теста, Разбор попытки, Авторинг вопроса.

| Option | Description | Selected |
|--------|-------------|----------|
| Отдельный yarn e2e, в CI обязательно | | ✓ |
| Внутри yarn verify | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chromium: десктоп + телефон | | ✓ |
| Только Chromium десктоп | | |
| Chromium + WebKit + Firefox | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Мини-драйвер локального диска в фазе 1 | StorageService без Supabase: запись бросает, чтение возвращает '' | ✓ |
| Сценарии с файлами — fixme до фазы 7 | | |
| Весь шов хранилища в фазу 1 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| getServerMe.test.ts на vi.mock | | ✓ |
| Перенести как есть (vm) | | |
| You decide | | |

---

## Claude's Discretion

Конфиг oxfmt, раскладка Vitest (workspace/projects), сид для e2e, механизм env-контракта, имена конфигурации локального драйвера хранилища.

## Deferred Ideas

- VER-08 проектные скиллы — после фаз 3–5.
- Перевод всех relational-запросов на новый API Drizzle v1 — по модулям в фазах 4/5/7/8.
- Полный шов хранилища ADR-0004 — фаза 7.
- Branch protection (обязательный CI) — когда работа перейдёт на PR-ветки.
