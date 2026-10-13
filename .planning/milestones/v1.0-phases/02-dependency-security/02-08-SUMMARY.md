---
phase: 02-dependency-security
plan: 08
subsystem: web-mdx
tags: [dependency-security, group-4, next-mdx-remote, mdx, blockjs, dep-03, dep-04, dep-05]
status: complete
deferred_human_gate: true
requires: [02-01, 02-04, 02-07]
provides:
  - "next-mdx-remote 6.0.0 в app/web с blockJS по умолчанию"
  - "remarkStripUnsafeJsx: вырезает script, srcdoc, on* в MDX-JSX"
  - "untrusted.test.ts без ожидаемо падающих проверок, 34 теста"
affects: [02-09]
tech-stack:
  added: []
  patterns:
    - "Плагин, строящий ESTree-атрибут (remarkMdxStyleToEstree), зарегистрирован в rehypePlugins после rehypeRaw, чтобы blockJS (конец remarkPlugins) его не вырезал"
    - "Защитный remark-плагин первым в remarkPlugins, без sanitizer-фреймворка (D-09)"
key-files:
  created:
    - app/web/lib/mdx/remarkStripUnsafeJsx.ts
  modified:
    - app/web/package.json
    - yarn.lock
    - app/web/lib/mdx/options.ts
    - app/web/lib/mdx/untrusted.test.ts
key-decisions:
  - "next-mdx-remote 5.0.0 -> 6.0.0 (одобренная версия 02-04); MdxRenderer.tsx не менялся: пути экспорта и типы serialize/MDXRemote/MDXRemoteSerializeResult в 6.0.0 те же"
  - "style сохранён переносом remarkMdxStyleToEstree из remarkPlugins в rehypePlugins между rehypeRaw и rehypeStyleToObject; правка типов плагина не понадобилась"
  - "remarkStripUnsafeJsx первым в remarkPlugins: удаляет MDX-JSX script (без учёта регистра) с содержимым, атрибуты srcdoc и on* (без учёта регистра)"
  - "Пейлоад 6 дополнен абзацем после script: документ из одного script после вырезания давал пустой HTML и ронял проверку «конвейер отработал» (html.length > 0)"
  - "{выражения} и объектный style={{…}} больше не выводятся (D-08): EXPRESSION_CONTENT переключён на вывод v6"
  - "Task 3 (preview против прода) не выполнен и не одобрен: пользователь недоступен, шаги в Deferred human verification"
requirements-completed: []
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 1300
  tasks: 2
  commits: 0
estimate_actuals_note: "actuals.tokens = chars/4 по изменённому коду (remarkStripUnsafeJsx.ts 1381 байт, изменённые строки options.ts и untrusted.test.ts около 3300 байт, строка манифеста); yarn.lock и эта сводка в расчёт не входят; tasks: 2 из 3, Task 3 отложен; коммитов нет по правилу пользователя"
duration: 7min
completed: 2026-10-04
---

# Phase 2 Plan 08: Группа 4 (next-mdx-remote 6.0.0) Summary

**next-mdx-remote 5.0.0 -> 6.0.0: `blockJS` закрывает выражения (пейлоады 1, 2, 5 красные на v5 и зелёные на v6 на одном и том же тесте), новый `remarkStripUnsafeJsx` вырезает `<script>`, `srcdoc` и `on*` (6, 7, 8), style сохранён переносом `remarkMdxStyleToEstree` в `rehypePlugins` (вывод байт-в-байт как на v5). В `untrusted.test.ts` 34 обычных теста, `test.fails` нет. `yarn verify`, обе сборки Vercel, `yarn e2e` и прямой production-аудит зелёные. Сравнение реальных текстов на preview с продом (Task 3) ждёт пользователя.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` отражает это правило; `plan_head_before` и `plan_head_after` совпадают.

## Performance

- **Started:** 2026-10-03T19:52:20Z
- **Completed:** 2026-10-03T19:59Z (2026-10-04 по местному времени)
- **Tasks:** 2 из 3 (Task 3 отложен до пользователя)
- **Files modified:** 5 (1 новый)

## Что изменено

| Файл | Изменение |
| --- | --- |
| `app/web/package.json` | `next-mdx-remote` `^5.0.0` -> `^6.0.0`. Остальные строки диффа файла пришли из 02-05 и 02-06 |
| `yarn.lock` | next-mdx-remote 6.0.0 вместо 5.0.0, unist-util-remove 4.0.0 вместо 3.1.1, ушли unist-util-is 5.2.1 и unist-util-visit-parents 5.1.3 |
| `app/web/lib/mdx/options.ts` | `remarkPlugins: [remarkStripUnsafeJsx, remarkGfm, remarkParagraphPerLine]`; `rehypePlugins: [[rehypeRaw, { passThrough: MDX_PASS }], remarkMdxStyleToEstree, rehypeStyleToObject]` |
| `app/web/lib/mdx/remarkStripUnsafeJsx.ts` | новый remark-плагин (default export, `unist-util-visit`) |
| `app/web/lib/mdx/untrusted.test.ts` | `KNOWN_HOLES` и ветка `test.fails` удалены; пейлоад 6 дополнен абзацем; ожидания `EXPRESSION_CONTENT` на вывод v6; новый блок `STRIPPED_JSX` (5 проверок плагина по `compiledSource`). `LEGIT_FIXTURES` не менялся |

`app/web/components/tests/MdxRenderer.tsx` не менялся: в 6.0.0 `exports` содержит `.` и `./serialize`, `serialize`, `MDXRemote` и `MDXRemoteSerializeResult` импортируются как раньше, `yarn workspace @bio-exam/web typecheck` код 0. Файл остаётся `'use client'` и вызывает `serialize` в эффекте; `blockJS` и `blockDangerousJS` явно не передаются (в 6.0.0 оба `true` по умолчанию, `dist/serialize.js`). `remarkMdxStyleToEstree.ts` не менялся: typecheck прошёл с прежней сигнатурой `(tree: Root)` из `mdast`.

## Сохранение style (D-08)

В 6.0.0 `getCompileOptions` (`node_modules/next-mdx-remote/dist/serialize.js`) собирает `remarkPlugins` как `[...пользовательские, removeImportsExportsPlugin, removeJavaScriptExpressions]`. `removeJavaScriptExpressions` (`dist/plugins/remove-javascript-expressions.js`) удаляет `mdxFlowExpression`/`mdxTextExpression` и любой `mdxJsxAttribute` со значением `mdxJsxAttributeValueExpression`. `remarkMdxStyleToEstree`, стоявший в `remarkPlugins`, строил именно такой атрибут, поэтому до правки на v6 оба style-эталона были красными (`<span>цвет</span>`, `<p>по центру</p>`).

Способ: `remarkMdxStyleToEstree` убран из `remarkPlugins` и зарегистрирован в `rehypePlugins` сразу после `[rehypeRaw, { passThrough: MDX_PASS }]` и до `rehypeStyleToObject`. На rehype-этапе `blockJS` уже отработал; MDX-JSX узлы проходят через `rehypeRaw` как есть (`MDX_PASS`), плагин находит их тем же `visit` и строит `ObjectExpression` только из `Literal`-значений, разобранных `style-to-object`, код автора в ESTree не попадает. Объектный `style={{…}}` из текста автора по-прежнему вырезается `blockJS` (D-08).

Вывод v6 после правки: `<span style="color:#e11d48;font-weight:700">цвет</span>`, `<p style="text-align:center">по центру</p>`, байт-в-байт как на v5 (02-01).

## Матрица пейлоадов v5 -> v6

v5 — из 02-01 (next-mdx-remote 5.0.0, тот же тест). v6 — next-mdx-remote 6.0.0 с итоговым `buildMdxOptions()`. HTML v6 — фактический вывод после `replace(/<!-- -->/g, '')`; `__mdxPwned` во всех девяти случаях `undefined`.

| # | Пейлоад | v5 | v6 | compiled v5 / v6 | HTML v6 | Чем закрыт |
|---|---|---|---|---|---|---|
| 1 | выражение в блоке | красный (флаг `flow`) | зелёный | true / true | `<p>Абзац текста.</p>` | `blockJS` (`removeJavaScriptExpressions`) |
| 2 | выражение в абзаце | красный (флаг `inline`) | зелёный | true / true | `<p>Текст  дальше.</p>` | `blockJS` |
| 3 | ESM export | зелёный | зелёный | true / true | `<p>абзац</p>` | `removeImportsExportsPlugin` (v5 и v6) |
| 4 | ESM import | зелёный | зелёный | true / true | `<p>абзац</p>` | `removeImportsExportsPlugin` (v5 и v6) |
| 5 | выражение в атрибуте onError | красный (флаг `attr`) | зелёный | true / true | `<img src="/a.png" alt=""/>` | `blockJS` (атрибут-выражение); имя `onError` дополнительно режет `remarkStripUnsafeJsx` |
| 6 | элемент script | красный (`assertInert`, `<script>`) | зелёный | true / true | `<p>абзац</p>` | `remarkStripUnsafeJsx` (на v6 без плагина `<script>` доходил до HTML) |
| 7 | iframe srcdoc со скриптом | красный (`assertInert`, `srcdoc=`) | зелёный | true / true | `<iframe></iframe>` | `remarkStripUnsafeJsx` (на v6 без плагина `srcdoc=` доходил до HTML) |
| 8 | строковые обработчики on* | зелёный | зелёный | true / true | `<img src="/a.png" alt=""/>`, `<div>x</div>` | `remarkStripUnsafeJsx` (на этапе MDX) и React (не печатает строковые обработчики) |
| 9 | javascript: в ссылках | зелёный | зелёный | true / true | `href="javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"` у обеих ссылок | React 19 |

Картинки на v6, как и на v5, дополнительно дают `<link rel="preload" as="image" href="/a.png"/>` от React 19.

Доказательство DEP-03 (D-09, D-11): пейлоады 1, 2, 5 на одном и том же тесте красные на 5 (02-01: `Tests 24 passed | 5 expected fail (29)`) и зелёные на 6. Прогон на v6 до правок `app/web/lib/mdx` (только `yarn add`): проверки 1, 2, 5 упали как «ожидалось падение», 6 и 7 остались ожидаемо падающими, style-эталоны и `EXPRESSION_CONTENT` красные (`7 failed | 20 passed | 2 expected fail (29)`). Это совпадает с прогоном devils-advocate из ревью плана (02-SQUAD-REVIEW C1, C2).

`compiled: true` в блоке `PAYLOADS`: 9 в снимке 02-01, 9 сейчас; тест «конвейер отработал» требует `compiled === true` у всех девяти.

## EXPRESSION_CONTENT v5 -> v6 (изменение по D-08)

Изменение принято D-08: `{выражения}` перестают исполняться. Пропуск объектного `style={{…}}` через проверку AST не делался.

| name | Исходник | v5 | v6 |
|---|---|---|---|
| выражения в тексте | `` число {2} и {' '} и {"{"} `` | `<p>число 2 и   и {</p>` | `<p>число  и  и </p>` |
| объектный style | `<span style={{ color: 'red' }}>x</span>` | `<span style="color:red">x</span>` | `<span>x</span>` |

Следствие для реальных текстов: содержимое в фигурных скобках `{…}` и цвет, заданный объектом `style={{…}}`, на v6 не выводятся. Строковый `style="…"` выводится как раньше. Экранированные `\{x\}` выводятся как `{x}` (эталон зелёный).

## TDD (Task 2), без коммитов

- RED: ветка `test.fails` и `KNOWN_HOLES` удалены, добавлен блок `STRIPPED_JSX` (блочный script, строчный script, `<SCRIPT>`, `srcDoc`, строковые `onerror`/`ONCLICK`; проверка по `compiledSource` из `serialize`). Прогон: `7 failed | 27 passed (34)`; падения на `/<script/i` (6), `/\ssrcdoc=/i` (7) и на запрещённых шаблонах в `compiledSource` (5 новых).
- GREEN: `remarkStripUnsafeJsx.ts` создан и поставлен первым в `remarkPlugins`. Прогон: `1 failed | 33 passed`: пейлоад 6 из одного `<script>` после вырезания дал пустой HTML, и упала проверка «конвейер отработал» (`html.length > 0`). Пейлоад 6 дополнен абзацем (отклонение 1 ниже). Итог: `Tests 34 passed (34)`.
- REFACTOR: не понадобился, `yarn oxfmt` на изменённых файлах.

## Проверки

| Проверка | Результат |
| --- | --- |
| Предусловие: sha256 `baseline/untrusted.test.ts.02-01` | `d9dd7aab…c4695`, равен блоку `## sha256` 02-01; рабочий файл до правок совпадал со снимком |
| `vitest run lib/mdx/untrusted.test.ts` | `Test Files 1 passed (1)`, `Tests 34 passed (34)` |
| `yarn workspace @bio-exam/web typecheck` | код 0, `error TS` нет |
| эталоны и версия | `next-mdx-remote 6.0.0 fixtures unchanged` |
| `compiled` и порядок плагинов | `payloads still compile: 9 style plugin in rehype` |
| installed = approved | `installed = approved: next-mdx-remote` |
| нет ожидаемо падающих, плагин первый | `mdx test has no expected-fail, strip plugin first` |
| `yarn install --immutable` | код 0, `YN0028` нет |
| `yarn verify` | `yarn verify: OK` (все 8 шагов passed; web `Tests 67 passed (67)`, `lib/mdx/untrusted.test.ts (34 tests)`, server `179 passed`, rbac `2 passed`) |
| сборка web по `buildCommand` Vercel с плейсхолдерами | код 0, `Failed to compile` / `Invalid server env` нет |
| `cd app/server && node vercel-build.cjs` | `=== Build completed successfully! ===` |
| `yarn e2e` | `108 passed (42.6s)`, включая `take-test.spec.ts` (flow 2) и `review.spec.ts` (flow 3); `✘` только у `@known-defect` тестов, помеченных ожидаемым падением |
| `yarn npm audit --all --environment production --severity high --no-deprecations` | код 0, `No audit suggestions`: прямых production-advisory high+ нет, next-mdx-remote ушёл из списка |
| `yarn format:check` | `All matched files use the correct format.` |
| sha256 тестов 02-02 и 02-03 | не изменились (`uploads.test.ts` c85d2096…, `sharp-runtime.test.ts` 9b753edb…, `http.ts` 2992ec0b…, `proxy-protection.spec.ts` 9dece947…) |

## sha256

`untrusted.test.ts` после 02-08 (база для 02-09):

```
a9aaec81c7799ed9b7d3a0e0f643ea4501564f1394d336bfbcb70c428397973a  app/web/lib/mdx/untrusted.test.ts
```

## yarn.lock delta

База: `.planning/phases/02-dependency-security/02-08-yarn.lock.before` (снята до `yarn add`). Лог: `02-08-yarn.log`. После `yarn install --immutable` дельта не изменилась.

```
+ next-mdx-remote@6.0.0
+ unist-util-remove@4.0.0
- next-mdx-remote@5.0.0
- unist-util-is@5.2.1
- unist-util-remove@3.1.1
- unist-util-visit-parents@5.1.3
```

| Пакет | Родитель | Одобрен | `npm view <pkg>@<ver> scripts` |
| --- | --- | --- | --- |
| `next-mdx-remote@6.0.0` | `app/web` (прямая) | да, `## approved-versions` 02-04 | `build`, `lint`, `release`, `release:canary`, `prepublishOnly`, `pretest`, `test`, `test:js`, `test:types`; `preinstall`/`install`/`postinstall` нет |
| `unist-util-remove@4.0.0` | `next-mdx-remote@6.0.0` (`^4.0.0`) | транзитив, принят по политике транзитивов | `prepack`, `build`, `format`, `test-api`, `test-coverage`, `test`; `preinstall`/`install`/`postinstall` нет. repository `github.com/syntax-tree/unist-util-remove`, опубликован 2023-07-07 |

Зависимости `unist-util-remove@4.0.0` (`@types/unist ^3.0.0`, `unist-util-is ^6.0.0`, `unist-util-visit-parents ^6.0.0`) уже были в lockfile. Удалённые `unist-util-is@5.2.1` и `unist-util-visit-parents@5.1.3` держал только `unist-util-remove@3.1.1` у next-mdx-remote 5.

## YN0007

нет. В `02-08-yarn.log` (`yarn add` и `yarn install --immutable`) строк `YN0007` и `YN0008` нет. Есть `YN0086` (peer dependencies), она же в логах 02-05, 02-06, 02-07; записана в `deferred-items.md`.

## Файлы по планам, готовые к коммиту

`.planning/` в этом репозитории в `.gitignore`, в коммиты не входит.

| План | Файлы |
| --- | --- |
| 02-01 | `app/web/lib/mdx/untrusted.test.ts` (untracked; в рабочем дереве уже версия 02-08) |
| 02-02 | `app/server/src/test-support/http.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/lib/sharp-runtime.test.ts` (untracked) |
| 02-03 | `e2e/tests/proxy-protection.spec.ts` (untracked) |
| 02-05 | `app/web/package.json` (удаления и `lodash`, `postcss`), `packages/rbac/package.json`, хунк `express` в `app/server/package.json`, `yarn.lock` |
| 02-06 | `app/web/package.json` (`next`, `@next/mdx`), `yarn.lock` |
| 02-07 | хунки `multer`, `sharp`, `@types/sharp` в `app/server/package.json`, `yarn.lock` |
| 02-08 | хунк `next-mdx-remote` в `app/web/package.json`, `yarn.lock`, `app/web/lib/mdx/options.ts`, `app/web/lib/mdx/remarkStripUnsafeJsx.ts` (новый), изменения `app/web/lib/mdx/untrusted.test.ts` |

`untrusted.test.ts` не закоммичен ни в версии 02-01, ни в версии 02-08. Чтобы история показала «красный на 5, зелёный на 6», коммит 02-01 берёт файл из снимка `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01`, коммит 02-08 — текущий файл. Промежуточные состояния `yarn.lock`: после 02-07 = `02-08-yarn.lock.before`, после 02-08 = текущий `yarn.lock`.

Push текущей ветки из своего терминала: `git push -u origin phase-1-verification`.

## Deferred human verification

**Не выполнено, ждёт пользователя; исполнитель не одобрял.** Task 3 (`checkpoint:human-verify`, gate `blocking-human`) пропущен по режиму автономного запуска: пользователь недоступен, одобрение не получено и не подразумевается. `deferred_human_gate: true` во frontmatter нужен только для старта следующего плана. DEP-05 в части реальных текстов (D-10) не подтверждён, пока шаги ниже не пройдены. Исполнитель реальные тексты из Storage и прод-БД не читал.

Шаги для пользователя:

1. Закоммитить изменения плана 02-08 (таблица выше) и выполнить push: `git push -u origin phase-1-verification`.
2. Дождаться preview-деплоя web этой ветки (Ready).
3. Открыть рядом preview и прод на нескольких самых оформленных реальных тестах: таблицы, формулы (индексы, степени), цветной и выровненный текст, картинки в условии и в пояснении. Проверить экран прохождения теста и разбор попытки. Выбрать среди них и такие, где в тексте есть `{`: на v6 содержимое `{…}` больше не выводится (D-08). Найти их можно поиском в админке или своим запросом к базе по `question_search_documents.prompt_text` (например `prompt_text LIKE '%{%'`); исполнитель в базу не ходит. Пояснения (`explanation.md`) в эту таблицу не индексируются, их проверять на открытых вопросах.
4. Сравнить: текст, таблицы, цвета, выравнивание, картинки и их размеры совпадают. Нет пропавших фрагментов текста там, где на проде было содержимое. Исключение — содержимое в фигурных скобках `{…}` и цвет, заданный объектом `style={{…}}`: на preview они пропадают по D-08, это ожидаемое изменение. Перечислить такие места отдельно (URL теста, номер вопроса, фрагмент), чтобы решить, переписывать ли эти тексты; остальные пропажи — расхождения. Также на preview пропадают `<script>`, атрибуты `srcdoc` и `on…` в HTML текстов, это тоже ожидаемо.
5. Написать "approved" или перечислить расхождения (URL теста, номер вопроса, что отличается, скриншот).

При расхождениях: каждое воспроизводится минимальной фикстурой в `LEGIT_FIXTURES` (текст из описания пользователя, не из Storage), исправляется в `app/web/lib/mdx`, затем повторяются Task 2 и этот checkpoint. CI на коммите 02-08 отдельно не проверяется: финальный гейт 02-09 Task 3 проверяет CI на итоговом HEAD.

Ответ пользователя по preview: нет.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Пейлоад 6 дополнен абзацем после `<script>`**
- **Found during:** Task 2 (GREEN)
- **Issue:** пейлоад 6 состоял только из `<script>…</script>`. После вырезания плагином документ пустой, `renderToString` возвращает `''`, и тест «конвейер отработал» падал на `assert.ok(html.length > 0)`. Плагин работает по плану (элемент удаляется с содержимым), тест закладывал непустой вывод, которого у документа из одного скрипта быть не должно.
- **Fix:** к источнику пейлоада 6 добавлен абзац (`\n\nабзац`, по образцу пейлоадов 3 и 4); тело скрипта то же, что в 02-01, `compiled: true` не менялся, ассерт `html.length > 0` для всех пейлоадов не ослаблялся, тип `PAYLOADS` прежний.
- **Ограничение:** изменённый пейлоад 6 на v5 не перепрогонялся (возврат v5 сломал бы базу lockfile группы). Его краснота на v5 следует из 02-01 (`<script>` доходил до HTML независимо от соседнего текста) и из RED-прогона на v6 без плагина. Пейлоад 6 в доказательство «красный на 5, зелёный на 6» не входит: оно держится на 1, 2, 5.
- **Files modified:** `app/web/lib/mdx/untrusted.test.ts`

**2. Новые проверки `STRIPPED_JSX`** (в рамках плана: поведение Task 2 «блочный и строчный script», «srcdoc у любого элемента», «on* убираются раньше React»). Пять проверок по `compiledSource`: блочный, строчный и `<SCRIPT>` script, `srcDoc`, строковые `onerror`/`ONCLICK`. Без них строчный script, регистр и удаление `on*` на этапе MDX тестами не покрывались.

Отклонения по режиму запуска:
- Task 3 не выполнен (автономный режим, пользователь недоступен), записан раздел Deferred human verification.
- Коммиты TDD (RED/GREEN) и коммиты задач не делались по правилу пользователя.

## Known Stubs

Нет.

## Threat Flags

Нет. Новой сетевой поверхности, путей авторизации или работы с файлами нет. `remarkStripUnsafeJsx` сужает поверхность T-2-18.

## Self-Check: PASSED

- FOUND: `app/web/lib/mdx/remarkStripUnsafeJsx.ts`
- FOUND: `.planning/phases/02-dependency-security/02-08-yarn.lock.before`, `02-08-yarn.log`
- MODIFIED: `app/web/package.json`, `yarn.lock`, `app/web/lib/mdx/options.ts`, `app/web/lib/mdx/untrusted.test.ts`
- Коммиты: не проверялись, не выполнялись по правилу пользователя
