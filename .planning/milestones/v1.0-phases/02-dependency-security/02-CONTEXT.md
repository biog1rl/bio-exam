# Phase 2: Dependency security - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

В production-графе зависимостей нет прямого high/critical advisory, и ничего заметно не сломалось. Фаза меняет манифесты, `yarn.lock` и ровно те правки кода, которых требуют апгрейды, плюс тесты, которые фиксируют поведение до и после.

Требования: DEP-01 … DEP-05 (`.planning/REQUIREMENTS.md`). Источник: `plans/002-dependency-security.md`.

Что НЕ входит:
- Drizzle ORM и drizzle-kit: уже на 0.45.3 / 0.31.11 из фазы 1 (Phase 1 D-05), в фазе 2 не планируются заново. Регрессия по Drizzle-запросам (DEP-05) закрывается существующими DB-тестами и e2e.
- Единый lockfile: сделан в фазе 1, `package-lock.json` удалён, гард на второй lockfile работает.
- Любые миграции фреймворков и фичи вне апгрейдов.

Видимое поведение меняется в одном месте: `{выражения}`, `import`/`export` и скрипты в MDX-текстах перестают исполняться (D-08).

</domain>

<decisions>
## Implementation Decisions

Перенесено из предыдущих фаз (не переспрашивалось):
- **ADR-0003.** Проверка до изменений. `yarn verify` зелёный локально и в CI перед закрытием фазы; нулевой прогон тестов считается провалом.
- **Phase 1 D-29 / D-02.** БД-работа только через `TEST_DATABASE_URL` (localhost/127.0.0.1, `test_*`) с `BIO_EXAM_ISOLATED_ENV=1`. Агенты к проду не ходят.
- **Phase 1 plan 01-02.** Образец блокирующего human-checkpoint «легитимность пакетов» перед любой установкой.
- **Phase 1 D-14 / D-13.** Vitest остаётся юнит/модульным раннером, Playwright e2e (`yarn e2e`, не входит в `yarn verify`) остаётся внешней сетью.
- **Агенты не коммитят.** Границы планов — это границы коммитов пользователя.

### Версии и порядок апгрейда
- **D-01:** Цель — свежайшая стабильная версия линии, закрывающая все advisory, на момент выполнения. На 2026-10-03: Next 16.3.8, Sharp 0.35.5, Multer 2.4.0, express 4.22.3, next-mdx-remote 6.0.0, lodash 4.18.1, PostCSS 8.5.28 (Next 16.3.8 тянет свой 8.5.23). Исполнитель заново сверяет версии с первичными advisory в начале (plan 002 step 1).
  - Порог из DEP-01 («Next ≥16.2.11») устарел: свежий аудит показывает 3 critical RCE в Next (GHSA-p293-qw3h-jr36 и GHSA-2xp9-vwfh-vxw4 закрыты с 16.3.3, GHSA-vcvr-r3jv-pc5j с 16.3.6). Переход 16.2 → 16.3 — минорный. Формулировку DEP-01 обновить при закрытии фазы.
  - Next 16.3.8 требует `sharp ^0.35.4` как optional-зависимость, поэтому Sharp у Next и у сервера идёт на одной версии 0.35.x.
- **D-02:** Новые версии пишутся как `^` с поднятым полом (`next ^16.3.8`, `multer ^2.4.0`, `sharp ^0.35.5`). Точные пины остаются только у тулчейна из фазы 1. `@next/mdx` связан с версией Next (сейчас `^16.2.1`) и поднимается вместе с ним.
- **D-03:** Один блокирующий human-checkpoint перед первым `yarn add`/`yarn up`: таблица пакет, старая → новая версия, дата публикации, ссылка на advisory. Даты на момент обсуждения: Next 16.3.8 — 2026-09-30, 16.3.7 — 2026-09-29, Sharp 0.35.5 — 2026-09-27, Multer 2.4.0 и express 4.22.3 — 2026-09-14.
- **D-04:** Апгрейд идёт группами по риску, после каждой группы `yarn install --immutable`, `yarn verify` и production-сборка web:
  1. Тесты на старых версиях (D-11) — первый план.
  2. Группа 1: удаления (D-06) и низкорисковые бампы lockfile (lodash, express, postcss, транзитивы в пределах диапазона).
  3. Группа 2: Next 16.3 вместе с `@next/mdx`, sharp и postcss по Next.
  4. Группа 3: Multer 2.4 и Sharp на сервере (`app/server`).
  5. Группа 4: next-mdx-remote 6.
  Планировщик сам решает, как поделить Группы 2 и 3 с учётом того, что Sharp общий (D-01).
- **D-05:** Проверка на Vercel: для каждой группы локальная репродукция `buildCommand` обоих `vercel.json` (как в плане 01-06). Дополнительно human-checkpoint с preview-деплоем ветки: после Групп 2 и 3 (сборка, загрузка аватара через Sharp), после Группы 4 (D-10).

### Удалять или обновлять
- **D-06:** Удаляются неиспользуемые пакеты: `tinymce`, `pm2`, `gray-matter`, `postcss-cli`, `autoprefixer`, `sass`, `@tiptap/core|pm|react` в `app/web`; `@tiptap/core|pm` в `packages/rbac`. Поиск по репозиторию (без `yarn.lock`) находит их только в `package.json`; PostCSS-конфиг `app/web` содержит один плагин `@tailwindcss/postcss`; scss-файлов нет. Доказательство отсутствия вызовов: CodeGraph, typecheck, сборка web, e2e. Если найдётся реальное использование, этот пакет обновляется, а не удаляется. Для TinyMCE DEP-01 («upgrade») выполняется удалением.
  - `@tiptap/core` в `packages/rbac` — прямое high (GHSA-j95f-988m-3j2f); `@bio-exam/rbac` — workspace, поэтому DEP-04 его тоже затрагивает.
- **D-07:** lodash поднимается до 4.18.1 (патч есть). `app/web/components/editor/editor-hooks/use-debounce.ts` не меняется: хук всё равно переписывается в Phase 8 (RT-01…RT-04). lodash транзитивно нужен recharts, archiver-utils и async, поэтому lockfile обновляется в любом случае.

### MDX: что не должно исполняться
- **D-08:** Остаётся без изменений: Markdown, таблицы, HTML с inline `style`, картинки, существующие стили. `{выражения}`, `import`/`export` и скрипты не нужны и перестают исполняться (`blockJS: true` по умолчанию в next-mdx-remote 6). Если `blockJS` вырежет style-атрибуты, которые строит `remarkMdxStyleToEstree` (JSX-атрибут-выражение с ESTree), адаптируются плагины в `app/web/lib/mdx`, стили не теряются. STOP из plan 002: MDX-безопасность нельзя доказать регрессионным тестом.
- **D-09:** Доказательство DEP-03 — Vitest в `app/web`, внутри `yarn verify`. Реальный `buildMdxOptions()` + `serialize` + рендер `MDXRemote` в Node (без jsdom; `new Function` выполняется там же). Матрица пейлоадов: `{expr}` с побочным эффектом на `globalThis`, `import`/`export`, `<script>`, `on*`-атрибуты, `javascript:` в ссылках. Плюс эталоны легитимного контента: style, таблицы, картинки. Дыра, найденная матрицей, закрывается в `app/web/lib/mdx` в рамках DEP-03; отдельный sanitizer-фреймворк не добавляется.
- **D-10:** Реальные тексты (`prompt.md`, `explanation.md` лежат файлами в Storage, в БД только путь) проверяются так: эталоны на фикстурах плюс глазами на preview-checkpoint — пользователь открывает несколько самых оформленных реальных тестов (таблицы, формулы, цвета, картинки) и сравнивает с продом. Скрипт-скан всех файлов отклонён.
- Компиляция остаётся на клиенте (`MdxRenderer.tsx` — `'use client'`, `serialize` в браузере). Перенос на сервер отложен.

### Тесты и учёт остатка
- **D-11:** Сначала тесты, потом апгрейд. Первый план пишет характеризационные тесты на текущих версиях: загрузки и proxy зелёные, MDX-тест на недоверенный контент красный на next-mdx-remote 5 (доказывает, что тест ловит дыру). До Группы 4 он оформляется как ожидаемо падающий (механизм — на усмотрение планировщика, например `test.fails`, как D1/D2/D5 в фазе 1), в Группе 4 переключается в обычный.
- **D-12:** Уровни тестов DEP-05:
  - Vitest в `yarn verify`: три multer-роута (`app/server/src/routes/tests/index.ts` `POST /:id/assets`, `app/server/src/routes/users/avatar.ts`, `app/server/src/routes/docs/assets.ts`) — лимит 5 МБ, форматы (MIME-фильтр), обрыв запроса; Sharp на Node 24 (resize/rotate/webp на крошечной картинке); MDX (D-09). Express-приложение — default export `app/server/src/app.ts`, база через `scripts/with-test-db.mjs` и `app/server/src/test-support/test-database.ts`.
  - Playwright API-запросы без браузера в `yarn e2e` (нужен собранный `next start`): защищённые пути без сессии редиректят на `/login`, включая запросы с заголовками RSC/prefetch/segment-prefetch и с подстановкой динамических параметров (темы advisory про обход Middleware/Proxy в Next 16.0–16.2.x).
  - Редактор и Drizzle-запросы: существующие e2e (`e2e/tests/authoring.spec.ts`, `take-test.spec.ts`, `review.spec.ts`) и DB-тесты; новых тестов на них не пишется.
- **D-13:** Транзитивные advisory: `yarn up -R` там, где патч в пределах диапазона (express → path-to-regexp, @supabase/realtime-js → ws и т.п.). `resolutions` — только для high/critical, достижимых в production, когда upstream отстаёт. Dev- и build-инструменты (`@vercel/node`, node-gyp, pac-proxy-agent и др.) только записываются. `@vercel/node` не заменяется: он нужен как тип в `app/server/api/index.ts`, Vercel уходит в Milestone 2.
- **D-14:** Запись остатка (DEP-04) — `docs/security/dependency-audit.md`, в git, по-русски, сухо, факты на дату аудита. По каждому оставшемуся advisory: пакет, severity, путь зависимости, достижимость (production-рантайм, build-инструмент, dev-инструмент, не поставляется), патч-версия, статус upstream или решение. В заголовке команда `yarn npm audit --all --recursive --severity high --json` и дата. `.planning` в `.gitignore`, поэтому запись там не попала бы в git. Аудит в CI и в `yarn verify` не добавляется: внешние данные сделали бы гейт недетерминированным. `scripts/check-docs-commands.mjs` проверяет только `README.md`, `app/server/README.md` и `AGENTS.md`, `docs/security` под него не попадает.

### Claude's Discretion
- Как разделить Группы 2 и 3 при общем Sharp (D-04).
- Механизм ожидаемо падающего MDX-теста (D-11) и состав фикстур-эталонов.
- Какие транзитивы закрывать `yarn up -R`, какие `resolutions` (D-13), решается по свежему аудиту.
- Убирать ли устаревший заглушечный `@types/sharp` (typecheck должен остаться зелёным).
- Насколько глубоко тесты загрузок идут внутрь обработчика: в изолированном режиме legacy-диск fails closed (WR-04, `assertLegacyUploadsAllowed`), так что валидация multer проверяется до хранилища; проход до Sharp зависит от локального адаптера из Phase 1 D-18.
- Формат таблицы в `docs/security/dependency-audit.md`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Решения и охват
- `.planning/ROADMAP.md` — цель и критерии успеха Phase 2.
- `.planning/REQUIREMENTS.md` — DEP-01 … DEP-05 (DEP-01 содержит устаревший порог Next, см. D-01).
- `plans/002-dependency-security.md` — шаги, верификация, STOP-условия. Шаг 3 (`package-lock.json`) выполнен в фазе 1.
- `docs/adr/0003-verification-before-refactoring.md` — проверка до изменений.
- `.planning/phases/01-verification-baseline/01-CONTEXT.md` — D-05 (Drizzle уже обновлён), D-13/D-14 (Vitest + Playwright), D-18 (локальный storage-драйвер), D-29 (изоляция окружения).
- `.planning/phases/01-verification-baseline/01-02-SUMMARY.md` — образец supply-chain checkpoint и точных пинов.
- `.planning/codebase/CONCERNS.md` — разделы «Audited dependency graph…» и «Dependencies at Risk».

### Код, который трогают апгрейды
- `app/web/package.json`, `app/server/package.json`, `packages/rbac/package.json`, `yarn.lock`, `.yarnrc.yml`.
- `app/web/proxy.ts` — защита маршрутов, matcher (темы advisory Next).
- `app/web/next.config.ts` — `@next/mdx`, rewrites на `API_ORIGIN`.
- `app/web/components/tests/MdxRenderer.tsx`, `app/web/lib/mdx/options.ts`, `remarkMdxStyleToEstree.ts`, `rehypeStyleToObject.ts`, `remarkParagraphPerLine.ts`, `normalizeSource.ts` — MDX-конвейер.
- `app/web/components/editor/editor-hooks/use-debounce.ts` — единственный вызов lodash.
- `app/server/src/routes/tests/index.ts` (multer, `POST /:id/assets`), `app/server/src/routes/users/avatar.ts` (multer + Sharp), `app/server/src/routes/docs/assets.ts` (multer + Sharp).
- `app/server/api/index.ts` — единственное использование `@vercel/node` (тип).
- `app/web/vercel.json`, `app/server/vercel.json`, `app/server/vercel-build.cjs` — Vercel-сборка для локальной репродукции.

### Тестовая инфраструктура
- `scripts/verify.mjs`, `scripts/with-test-db.mjs`, `scripts/e2e.mjs`, `e2e/playwright.config.ts`, `e2e/fixtures/seed.json`, `app/server/src/test-support/test-database.ts`, `app/server/vitest.config.ts`.

### Advisory (первичные, сверить при выполнении)
- Next: GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4 (critical, <16.3.3), GHSA-vcvr-r3jv-pc5j (critical, <16.3.6), GHSA-6gpp-xcg3-4w24, GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4 (<16.2.11) и ещё 8 high.
- next-mdx-remote: GHSA-g4xw-jxrg-5f6m (>=4.3.0 <6.0.0, first patched 6.0.0).
- Multer: GHSA-wc9g-mqfw-jrwm, GHSA-535w-7cp7-47q4 (<2.3.0) и ещё 4. Sharp: GHSA-f88m-g3jw-g9cj (<0.35.0), GHSA-rgj7-g3m4-5g8c (<0.35.4).
- PostCSS: GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 (<=8.5.17; вложенный 8.4.31 в Next). lodash: GHSA-r5fr-rjxr-66jc (<=4.17.23). @tiptap/core: GHSA-j95f-988m-3j2f. TinyMCE: GHSA-vg35-5wq7-3x7w, GHSA-q742-qvgc-gc2f, GHSA-v98h-vmpc-fpqv.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/server/src/app.ts` — Express-приложение как default export, поднимается в Vitest без `listen`.
- `app/server/src/test-support/test-database.ts` и `scripts/with-test-db.mjs` — одноразовая БД `test_*` для тестов роутов.
- `e2e/` + `scripts/e2e.mjs` — изолированный стек (одноразовая БД, сид, Express, `next build` + `next start`); API-запросы Playwright к нему для проверки proxy.
- `app/web/lib/mdx/normalizeSource.test.ts` — образец Vitest-теста MDX-модуля (в Node, без jsdom).
- Образец ожидаемо падающих проверок D1/D2/D5 в e2e фазы 1.

### Established Patterns
- Тулчейн пинится точно (`yarn add -E`) после human-checkpoint; production-зависимости — `^`.
- Каждый воркспейс сам объявляет нужные ему бинарники.
- Агенты не коммитят; `yarn verify` — единственный гейт; нулевой прогон тестов = провал.
- Доки проекта по-русски; идентификаторы, команды и пути без перевода.

### Integration Points
- Прод всё ещё на Vercel (до Milestone 2): нативный Sharp и Next 16.3 могут упасть только там, отсюда preview-checkpoint (D-05).
- `proxy.ts` участвует в защищённой маршрутизации: на Next-апгрейд завязаны redirect и `callbackUrl`.
- `MdxRenderer` используется в `TestRunner.tsx` и `attempt-review/AttemptQuestionsList.tsx`: ученики видят тексты преподавателей.
- Снимок аудита на 2026-10-03: 110 записей по 26 пакетам. Прямые: next (15, из них 3 critical), multer (6), sharp (2), tinymce (3), postcss (2), lodash (1), next-mdx-remote (1), @tiptap/core в rbac (1). Через express: path-to-regexp 0.1.12 (нужен ≥0.1.13, в express 4.22.3). Остальное — транзитивы build/dev-инструментов (pm2, @vercel/node, node-gyp, sass, gray-matter, autoprefixer и др.), часть уходит вместе с удалениями D-06.

</code_context>

<specifics>
## Specific Ideas

- Первый план этой фазы — тесты, а не апгрейд (D-11): результат «красный на 5, зелёный на 6» служит доказательством DEP-03.
- Preview-checkpoint после Группы 4: пользователь открывает несколько реальных тестов с таблицами, формулами, цветами и картинками и сравнивает с продом.
- В `REQUIREMENTS.md` при закрытии фазы поправить DEP-01: порог Next 16.3.x вместо 16.2.11, TinyMCE «удалён».

</specifics>

<deferred>
## Deferred Ideas

- Периодический информационный audit-шаг в CI — новая возможность сверх DEP-01…DEP-05.
- Перенос компиляции MDX с клиента на сервер (библиотека рекомендует `serialize` на сервере) — архитектурные фазы.
- Замена lodash-debounce своей реализацией вместе с отменой при unmount — Phase 8 (RT-01…RT-04).
- Замена типа `@vercel/node` в `app/server/api/index.ts` — потеряет смысл с уходом Vercel (Milestone 2).
- Drizzle v1 — отдельная фаза после стабильного 1.0 (Phase 1 deferred).

### Reviewed Todos (not folded)
None — совпадающих todo нет.

</deferred>

---

*Phase: 2-Dependency security*
*Context gathered: 2026-10-03*
