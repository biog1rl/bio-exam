---
phase: 02-dependency-security
verified: 2026-10-03T21:31:00Z
status: passed
human_verification_confirmed: "2026-10-05, пользователь"
score: 6/6 must-haves verified
covered_files:
  - .planning/phases/02-dependency-security/02-01-PLAN.md
  - .planning/phases/02-dependency-security/02-01-SUMMARY.md
  - .planning/phases/02-dependency-security/02-02-PLAN.md
  - .planning/phases/02-dependency-security/02-02-SUMMARY.md
  - .planning/phases/02-dependency-security/02-03-PLAN.md
  - .planning/phases/02-dependency-security/02-03-SUMMARY.md
  - .planning/phases/02-dependency-security/02-04-PLAN.md
  - .planning/phases/02-dependency-security/02-04-SUMMARY.md
  - .planning/phases/02-dependency-security/02-05-PLAN.md
  - .planning/phases/02-dependency-security/02-05-SUMMARY.md
  - .planning/phases/02-dependency-security/02-06-PLAN.md
  - .planning/phases/02-dependency-security/02-06-SUMMARY.md
  - .planning/phases/02-dependency-security/02-07-PLAN.md
  - .planning/phases/02-dependency-security/02-07-SUMMARY.md
  - .planning/phases/02-dependency-security/02-08-PLAN.md
  - .planning/phases/02-dependency-security/02-08-SUMMARY.md
  - .planning/phases/02-dependency-security/02-09-PLAN.md
  - .planning/phases/02-dependency-security/02-09-SUMMARY.md
  - app/server/package.json
  - app/server/src/lib/sharp-runtime.test.ts
  - app/server/src/routes/uploads.test.ts
  - app/server/src/test-support/http.ts
  - app/web/components/tests/MdxRenderer.tsx
  - app/web/lib/mdx/options.ts
  - app/web/lib/mdx/remarkMdxAllowlist.ts
  - app/web/lib/mdx/remarkMdxStyleToEstree.ts
  - app/web/lib/mdx/untrusted.test.ts
  - app/web/package.json
  - docs/security/dependency-audit.md
  - e2e/tests/proxy-protection.spec.ts
  - packages/rbac/package.json
  - yarn.lock
covered_digest: "v2:sha256:c5dcf50630cc6997f02d08c41ba7d9d03c54060aefb68f35411ef679d8815011"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Preview-деплой ветки на Vercel под Node 24 (02-07 Task 2)"
    expected: "Сборка web и server доходит до Ready, `/healthz` отвечает `{\"ok\":true}`, загрузка аватара проходит через Sharp 0.35.5 в функции Vercel (нативный бинарник linux есть в yarn.lock, но установка и запуск на Linux/Vercel здесь не проверялись)"
    why_human: "Нужен доступ к Vercel, агенту он запрещён; Sharp и Next 16.3 могут упасть только в среде Vercel (D-05)"
  - test: "Сравнение реальных текстов преподавателей на preview и на проде (02-08 Task 3, D-10)"
    expected: "Несколько самых оформленных реальных тестов (таблицы, формулы, цвета, картинки, тексты с `{`) выглядят как на проде. Отдельно проверить, что тексты со старым атрибутом `class` не потеряли значимого оформления: после ревью `class`/`className` белым списком `remarkMdxAllowlist` больше не пропускается (отступление принято в 02-REVIEW-DISPOSITION.md как «accepted»). Также элементы вне белого списка (`font`, `center`, `form`, `button` и т.п.) разворачиваются в текст и могут изменить вид старых текстов"
    why_human: "Тексты лежат в Storage; агент к ним не ходит; визуальное сравнение нельзя сделать кодом"
  - test: "Коммиты, push, PR и зелёный CI на запушенном HEAD под Linux (02-09 Task 3, ADR-0003)"
    expected: "Изменения фазы (7 изменённых и 7 новых путей из `git status`, включая `docs/security/` и `yarn.lock`) закоммичены пользователем, CI на запушенном HEAD зелёный; `yarn verify` и `yarn e2e` проходят на Linux"
    why_human: "Правило пользователя: агенты не коммитят и не пушат; рабочее дерево сейчас содержит все изменения незакоммиченными (HEAD всё ещё 7a6f95a), CI на этих изменениях не запускался"
---

# Phase 2: Dependency security - отчёт верификации

**Цель фазы:** в production-графе зависимостей нет прямого high-severity advisory, и ничего заметно не сломалось.
**Проверено:** 2026-10-03T21:31Z (UTC; в локальном времени 2026-10-04)
**Статус:** human_needed
**Повторная верификация:** нет, первичная

Всё, что проверяется кодом, тестами и свежим аудитом, подтверждено собственным прогоном верификатора. Три шага, требующих человека, отложены в режиме автономного запуска (`deferred_human_gate: true` в 02-07, 02-08, 02-09) и не засчитаны. Недостающего в коде, тестах и документах нет, поэтому `gaps_found` не выставлен.

## Достижение цели

### Наблюдаемые истины (критерии ROADMAP)

| #   | Истина | Статус | Доказательство |
| --- | ------ | ------ | -------------- |
| 1   | SC1a: прямых production advisory нет | ✓ VERIFIED | `yarn npm audit --all --environment production --severity high --no-deprecations` -> `YN0001: No audit suggestions`, код 0. Рекурсивный аудит (17 записей) не содержит ни одного пакета, объявленного в `package.json` воркспейсов: `tar`, `@fastify/busboy`, `braces`, `http-cache-semantics`, `path-to-regexp`, `serialize-javascript`, `undici` отсутствуют среди прямых зависимостей |
| 2   | SC1b: каждый оставшийся транзитивный advisory записан с путём, достижимостью и статусом upstream | ✓ VERIFIED | Свежий `yarn npm audit --all --recursive --severity high --json` (2026-10-04): 17 записей. Сверка GHSA по `docs/security/dependency-audit.md`: все 17 есть, отсутствующих нет; лишний только GHSA-gpj5-g38j-94v9 (Drizzle, помечен «закрыт»). Для каждой строки заполнены путь, достижимость, патч-версия, статус upstream. Дополнительно: `--environment production --recursive` даёт 11 записей (tar x9, http-cache-semantics, serialize-javascript), документ объясняет их через неиспользуемые `bcrypt`/`webpack` в `dependencies` app/web |
| 3   | SC2: `yarn install --immutable`, `yarn verify`, production-сборка web выходят с 0 | ✓ VERIFIED (локально) | `yarn install --immutable` перезапущен верификатором: код 0. `yarn verify: OK` и `yarn e2e` 108 passed (6 ожидаемых `@known-defect`, `next build` внутри e2e) приняты по прогону оркестратора на финальном дереве, верификатор их не перезапускал. Linux/CI-часть уходит в human-пункт 3 |
| 4   | SC3 (DEP-03): регрессионный тест показывает, что недоверенный MDX не исполняется на `next-mdx-remote` 6 | ✓ VERIFIED | `yarn workspace @bio-exam/web vitest run lib/mdx/untrusted.test.ts`: 114 passed, код 0. Установлен `next-mdx-remote` 6.0.0. Тест проходит реальный путь `normalizeMdxSource` -> `serialize(buildMdxOptions())` -> `renderToString(MDXRemote)` в Node. `LEGIT_FIXTURES` побайтно равны `baseline/untrusted.test.ts.02-01` (60 строк, `diff` пустой). В `PAYLOADS` пейлоады 1, 2, 5 (выражения) совпадают с базой; 6 и 7 отличаются от базы добавленным после тега абзацем (описано в 02-REVIEW-FIX.md, строка про `iframe srcdoc`, и в 02-08-SUMMARY.md, раздел с «Fix» для пейлоада 6); доказательство DEP-03 опирается на 1, 2, 5, которые побайтно совпадают с базой. Красное на v5 для 1/2/5 записано в 02-01-SUMMARY.md (флаги `flow`/`inline`/`attr`), красное на прежнем чёрном списке (68 из 114 красных) записано в 02-REVIEW-FIX.md. Независимый контроль верификатора: на v6 без `remarkMdxAllowlist` (только `remarkGfm` + `rehypeRaw`) выражения не исполняются (`blockJS`), но `<script>` и `<iframe srcdoc>` доходят до HTML, то есть белый список `app/web/lib/mdx/remarkMdxAllowlist.ts` необходим и подключён первым в `remarkPlugins` (`options.ts`). Заглушек `test.fails`, `skip`, `only` в тестах фазы нет |
| 5   | SC4a: загрузки (обрыв, лимит, форматы), proxy-защищённые маршруты, редактор и Drizzle-запросы ведут себя как раньше | ✓ VERIFIED | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/lib/sharp-runtime.test.ts`: 25 passed, код 0 (три multer-роута: отказ по MIME, >5 МБ, 401 без сессии, обрыв запроса, сломанный multipart, сигнатура файла, PNG через Sharp в хранилище). `e2e/tests/proxy-protection.spec.ts`: набор сценариев (тесты `test` и циклы по вариантам), включая RSC/prefetch-заголовки, динамические параметры, `//dashboard`, `/dashboard/`. Редактор и Drizzle закрыты существующими e2e и DB-тестами по D-12 (прогон e2e оркестратором) |
| 6   | SC4b: Sharp ставится и работает на Node 24 | ✓ VERIFIED (локально) | `sharp` 0.35.5, Node v24.17.0, `engines.node: "24"`, `.nvmrc` v24; `sharp-runtime.test.ts` (rotate, resize, webp и png на 4x4) зелёный; в `yarn.lock` есть `@img/sharp-linux-x64@npm:0.35.5`. Установка и запуск на Linux/Vercel не проверены, это human-пункт 1 |

**Счёт:** 6/6 истин подтверждены кодом; `behavior_unverified: 0`; три отложенных человеческих шага (раздел ниже) в счёт не входят и не засчитаны.

### Утверждения планов 02-02…02-09 (must_haves) и их соответствие

Все `artifacts` и `key_links` из frontmatter планов проверены `verify.artifacts` и `verify.key-links`: 02-02 3/3 и 3/3, 02-03 1/1 и 1/1, 02-05 4/4 и 1/1, 02-06 2/2 и 1/1, 02-07 2/2 и 1/1, 02-08 2/2 и 2/2, 02-09 1/1 и 1/1; у 02-04 блока `artifacts` нет (план-checkpoint без файлов). Недостающих артефактов и несвязанных связей нет. Утверждения планов, повторяющие критерии ROADMAP, свёрнуты в строки выше; собственные утверждения планов проверены отдельно:

| План | Утверждение | Статус | Доказательство |
| ---- | ----------- | ------ | -------------- |
| 02-01 | Матрица пейлоадов красная на v5 через `test.fails` (1, 2, 5, 6, 7) | ✓ VERIFIED как историческое | 02-01-SUMMARY.md (`24 passed, 5 expected fail`); теперь заменено обычными тестами по 02-08, `test.fails` в файле нет. `LEGIT_FIXTURES` равны базе |
| 02-02 | Тесты загрузок, Sharp, `http.ts` не менялись после 02-02 | ✓ VERIFIED | `shasum -a 256` трёх файлов равен блоку `## sha256` в 02-02-SUMMARY.md |
| 02-03 | Спека proxy не менялась; редиректы на `/login` включая RSC/prefetch, динамические пути, формы пути | ✓ VERIFIED | sha256 `proxy-protection.spec.ts` равен блоку в 02-03-SUMMARY.md; `test.fail` в спеке нет; `app/web/proxy.ts` не изменён (`git status` пуст) |
| 02-04 | Таблица версий одобрена пользователем до установки; блок `approved-versions` | ✓ VERIFIED | 02-04-SUMMARY.md: одобрено 2026-10-03; установленные версии равны блоку (next 16.3.8, `@next/mdx` ^16.3.8, lodash 4.18.1, postcss 8.5.28, next-mdx-remote 6.0.0, multer 2.4.0, sharp 0.35.5, express 4.22.3) |
| 02-05 | Удаления D-06; lodash >= 4.18.1 везде; express path-to-regexp >= 0.1.13; postcss ^8.5.28; `use-debounce.ts` не менялся | ✓ VERIFIED | `rg` по репозиторию пуст; в `yarn.lock` одна запись lodash 4.18.1, `path-to-regexp@~0.1.13`, postcss 8.5.23 и 8.5.28; `use-debounce.ts` без изменений |
| 02-06 | Next и `@next/mdx` одной версии 16.3.8; нет postcss ниже 8.5.18; Sharp у Next уже 0.35.x; `proxy.ts` совпадает с HEAD | ✓ VERIFIED | node_modules: next 16.3.8; в lock нет postcss ниже 8.5.23; `proxy.ts` не изменён |
| 02-07 | Одна версия sharp (0.35.x); тесты 02-02 без изменений на новых multer и sharp | ✓ VERIFIED | единственная запись `sharp@npm:^0.35.4, ^0.35.5` -> 0.35.5; sha256 сходится; 25 тестов зелёные. Preview на Vercel и CI на Linux из этого плана отложены (human-пункты 1 и 3) |
| 02-08 | Нет `test.fails`; `compiled: true` у всех 9 пейлоадов; `LEGIT_FIXTURES` без изменений; `remarkMdxStyleToEstree` в `rehypePlugins` после `rehypeRaw`; компиляция на клиенте | ✓ VERIFIED | см. истину 4; `options.ts`; `MdxRenderer.tsx` остаётся `'use client'` с `serialize` на клиенте. Сравнение реальных текстов отложено (human-пункт 2) |
| 02-09 | Документ аудита; одна строка на advisory; resolutions не добавлены; аудит не в `yarn verify` и CI; формулировка DEP-01 обновлена | ✓ VERIFIED | 17/17 GHSA; `rg audit scripts/verify.mjs .github` пуст; `resolutions` без добавлений; DEP-01 в REQUIREMENTS.md обновлён. Коммиты, push, PR и CI из этого плана отложены (human-пункт 3) |

Утверждения планов о чистом рабочем дереве, открытом PR и зелёном CI (02-07, 02-09) закрываются только человеком и не засчитаны.

### Требования (REQUIREMENTS.md)

Идентификаторы из frontmatter планов: 02-01 `DEP-03, DEP-05`; 02-02 `DEP-05`; 02-03 `DEP-05`; 02-04 `DEP-01, DEP-02, DEP-03`; 02-05 `DEP-01, DEP-02, DEP-04, DEP-05`; 02-06 `DEP-01, DEP-05`; 02-07 `DEP-01, DEP-05`; 02-08 `DEP-03, DEP-04, DEP-05`; 02-09 `DEP-01, DEP-04, DEP-05`. Объединение: DEP-01…DEP-05, все пять учтены, осиротевших (в REQUIREMENTS.md на Phase 2, но без плана) нет.

| Требование | Планы | Статус | Доказательство |
| ---------- | ----- | ------ | -------------- |
| DEP-01 | 02-04, 02-05, 02-06, 02-07, 02-09 | ✓ SATISFIED (локально; Vercel-часть в human) | В `yarn.lock` и `node_modules`: Next 16.3.8, `@next/mdx` ^16.3.8, multer 2.4.0, sharp 0.35.5, drizzle-orm 0.45.3, postcss 8.5.28 (у Next 8.5.23), express 4.22.3. TinyMCE убран, поиск по репозиторию (без lock, `.planning`, docs) не находит `tinymce`, `pm2`, `gray-matter`, `postcss-cli`, `autoprefixer`, `sass`, `@tiptap/*`; PostCSS-конфиг в `package.json` содержит один плагин `@tailwindcss/postcss`, scss-файлов нет. Формулировка DEP-01 в REQUIREMENTS.md обновлена (16.3.x, TinyMCE удалён) |
| DEP-02 | 02-04, 02-05 | ✓ SATISFIED | lodash 4.18.1 (`app/web/package.json` ^4.18.1, lock `^4.18.1`); единственный вызов `use-debounce.ts` не менялся по D-07 |
| DEP-03 | 02-01, 02-04, 02-08 | ✓ SATISFIED | см. истину 4 |
| DEP-04 | 02-05, 02-08, 02-09 | ✓ SATISFIED | см. истины 1 и 2; `resolutions` содержит только `@types/react` и `@types/react-dom` (решение D-13: не добавлять) |
| DEP-05 | 02-01…02-03, 02-05…02-09 | ✓ SATISFIED (локально); реальные тексты, Vercel и CI ждут человека | см. истины 3, 5, 6 и раздел человеческих проверок |

В REQUIREMENTS.md чекбоксы DEP-01…DEP-05 остаются `[ ]`, трассировка `Pending`: после закрытия человеческих пунктов их переключает оркестратор. Это не пробел кода.

### Артефакты

| Артефакт | Ожидание | Статус | Детали |
| -------- | -------- | ------ | ------ |
| `app/web/lib/mdx/untrusted.test.ts` | матрица пейлоадов, эталоны, инвариант по SSR-HTML | ✓ VERIFIED | 593 строки, 114 тестов зелёные; белый список в тесте задан независимо от плагина (отдельный оракул) |
| `app/web/lib/mdx/remarkMdxAllowlist.ts` | белый список элементов, атрибутов, схем URL, style | ✓ VERIFIED | 277 строк; элементы вне списка разворачиваются, `script/style/svg/math/iframe/object/embed/base/meta/link` и имена с `:`/`.` удаляются с содержимым; узлы `html`, `mdxjsEsm`, `mdxFlowExpression`, `mdxTextExpression` вырезаются; проверка схем `http/https/mailto/tel` и `data:image` только для `img` |
| `app/web/lib/mdx/options.ts` | плагин подключён первым | ✓ WIRED | `remarkPlugins: [remarkMdxAllowlist, remarkGfm, remarkParagraphPerLine]`; единственный потребитель `MdxRenderer.tsx` (`serialize(normalized, buildMdxOptions())`) |
| `app/web/components/tests/MdxRenderer.tsx` | граница ошибок и запасной вывод | ✓ VERIFIED | `MdxErrorBoundary` вокруг `MDXRemote`, запасной вывод текстом |
| `app/server/src/routes/uploads.test.ts`, `sharp-runtime.test.ts`, `test-support/http.ts` | характеризация загрузок и Sharp | ✓ VERIFIED | 25 тестов зелёные |
| `e2e/tests/proxy-protection.spec.ts` | проверки proxy | ✓ VERIFIED | набор сценариев с тегом `@proxy` (прогон e2e оркестратором) |
| `docs/security/dependency-audit.md` | остаток advisory | ✓ VERIFIED | см. истину 2 |
| `yarn.lock`, `package.json` x3 | обновлённый граф | ✓ VERIFIED | `yarn install --immutable` код 0 |

### Ключевые связи

| Откуда | Куда | Через | Статус |
| ------ | ---- | ----- | ------ |
| `MdxRenderer.tsx` | `options.ts` -> `remarkMdxAllowlist.ts` | `buildMdxOptions()` в `serialize` | ✓ WIRED |
| `remarkMdxAllowlist` | `remarkMdxStyleToEstree` | allowlist чистит `style`, затем `remarkMdxStyleToEstree` (в `rehypePlugins`) строит ESTree; пустой/нечитаемый `style` удаляется | ✓ WIRED |
| тест `untrusted.test.ts` | реальный конвейер | импорт `normalizeMdxSource`, `buildMdxOptions`, `MDXRemote`, `serialize` без подмен | ✓ WIRED |
| `uploads.test.ts` | Express `app.ts` и multer-роуты | запросы к `/api/tests/:id/assets`, `/api/users/avatar`, `/api/docs/assets` | ✓ WIRED |

### Трассировка данных (уровень 4)

`MdxRenderer` получает `source` из текстов преподавателя и рендерит результат `serialize`. Источник реальный (пользовательский MDX), статического значения нет; в тестах путь прогоняется целиком: ✓ FLOWING.

### Поведенческие проверки

| Поведение | Команда | Результат | Статус |
| --------- | ------- | --------- | ------ |
| Недоверенный MDX не исполняется | `yarn workspace @bio-exam/web vitest run lib/mdx/untrusted.test.ts` | 114 passed | ✓ PASS |
| Загрузки и Sharp на Node 24 | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/lib/sharp-runtime.test.ts` | 25 passed | ✓ PASS |
| Прямой production-аудит чист | `yarn npm audit --all --environment production --severity high --no-deprecations` | `No audit suggestions`, код 0 | ✓ PASS |
| Остаток равен документу | `yarn npm audit --all --recursive --severity high --json` против `dependency-audit.md` | 17 из 17 GHSA в документе | ✓ PASS |
| Lockfile воспроизводим | `yarn install --immutable` | код 0 | ✓ PASS |
| v6 без белого списка | узловой скрипт `serialize` + `renderToString` | выражения заблокированы, `<script>` и `srcdoc` проходят | ✓ PASS (подтверждает необходимость плагина) |
| `yarn verify`, `yarn e2e` | не перезапускались | приняты по прогону оркестратора (`verify: OK`, e2e 108 passed) | принято без перепроверки |

### Выполнение проб

Шаг 7c: пропущен, probe-скриптов (`scripts/*/tests/probe-*.sh`) фаза не объявляет.

### Антипаттерны

`TBD`, `FIXME`, `XXX`, `TODO`, `HACK` в файлах фазы не найдены. Заглушек и пустых реализаций нет.

| Файл | Строка | Паттерн | Серьёзность | Влияние |
| ---- | ------ | ------- | ----------- | ------- |
| `app/web/package.json` | `bcrypt`, `webpack`, `prosemirror-model`, `tiptap-extension-auto-joiner` | прямые зависимости без импортов в коде (IN-04, вне D-06) | ⚠️ Warning | `bcrypt` и `webpack` тянут 11 high/critical advisory в production-рекурсивном аудите; в документе они записаны как build-инструмент без исполнения в рантайме, но реальное удаление остаётся решением пользователя |
| `.planning/REQUIREMENTS.md` | чекбоксы DEP-01…DEP-05 | не переключены | ℹ️ Info | делает оркестратор после человеческих пунктов |

### Примечания (не пробелы)

- Отложено в `deferred-items.md`: клиентские ошибки multer возвращаются как 500 (S7, тесты намеренно закрепляют текущее поведение по D-11); статическая проверка полов версий в `yarn.lock` (S9); CSP `base-uri 'self'` для страниц ученика. Предупреждения Vitest об ESM в `vitest.config.ts` и `YN0086` существовали до фазы.
- Открытые информационные находки ревью: IN-01 (типизация `remarkMdxStyleToEstree`), IN-03 (Sharp smoke не различает rotate на однотонной картинке), IN-05 (старый комментарий в `vitest.config.ts`). На цель фазы не влияют.
- Допущение по `class`: атрибут сознательно не пропускается белым списком (оверлей через классы Tailwind в обход фильтра `position`). Это видимое изменение для старых текстов, поэтому оно включено в human-пункт 2.

## Человеческая проверка

### 1. Preview на Vercel под Node 24 (02-07 Task 2)

**Тест:** собрать preview ветки, открыть `/healthz`, загрузить аватар.
**Ожидание:** Ready, `{"ok":true}`, аватар обрабатывается Sharp 0.35.5 в функции Vercel.
**Почему человек:** нужен доступ к Vercel; агентам закрыт.

### 2. Сравнение реальных текстов на preview и на проде (02-08 Task 3, D-10)

**Тест:** открыть несколько самых оформленных реальных тестов (таблицы, формулы, цвета, картинки, тексты с `{`, старый `class`) и сравнить с продом.
**Ожидание:** оформление сохраняется; потеря оформления от `class` и от элементов вне белого списка принята осознанно или оформлена отдельной задачей.
**Почему человек:** тексты в Storage, нужен визуальный осмотр.

### 3. Коммиты, push, PR, зелёный CI на Linux (02-09 Task 3, ADR-0003)

**Тест:** закоммитить изменения фазы, запушить, дождаться CI.
**Ожидание:** CI на запушенном HEAD зелёный.
**Почему человек:** агенты не коммитят и не пушат; изменения в рабочем дереве, CI на них не запускался.

## Итог

Кодом, тестами и свежим аудитом подтверждены все четыре критерия ROADMAP и все пять требований DEP-01…DEP-05. Недостающих артефактов нет, блокеров нет. Фаза не закрывается как `passed`: три шага, которые мог сделать только человек (Vercel preview, сравнение реальных текстов, коммиты и CI на Linux), не выполнены и не одобрены, поэтому статус `human_needed`.

---

_Проверено: 2026-10-03T21:31Z_
_Верификатор: Claude (gsd-verifier)_

## Закрытие

2026-10-05. Код фазы работает на проде (`bio-exam.ru`, свой сервер, ветка `master`). Пункты раздела «Человеческая проверка» пользователь подтвердил как выполненные; пункты про preview Vercel заменены работой на своём сервере.

`covered_digest` пересчитан на `dev` 41f580a (файлы фазы менялись следующими фазами). Верификатор заново не запускался: на этом коде проходят `yarn verify` и e2e.

`covered_digest` пересчитан на `dev` 1962edd после тестов покрытия, уборки web-тестов и удаления мёртвого кода (b720f21, 3513919, 65f04e5).
