---
phase: 02-dependency-security
plan: 01
subsystem: testing
tags: [mdx, next-mdx-remote, characterization, vitest, dep-03]
status: complete
requires: []
provides:
  - "app/web/lib/mdx/untrusted.test.ts: характеризация MDX-конвейера на next-mdx-remote 5.0.0 (PAYLOADS, LEGIT_FIXTURES, EXPRESSION_CONTENT)"
  - "sha256 untrusted.test.ts для сверки в 02-05, 02-06, 02-07"
affects: [02-05, 02-06, 02-07, 02-08]
tech-stack:
  added: []
  patterns:
    - "Ожидаемо падающая проверка Vitest test.fails плюс обычный тест «конвейер отработал» на тот же пейлоад"
key-files:
  created:
    - app/web/lib/mdx/untrusted.test.ts
  modified: []
key-decisions:
  - "Разметка test.fails задаётся отдельной константой KNOWN_HOLES (имена пейлоадов), тип PAYLOADS оставлен как в плане { name, source, compiled }"
  - "Пейлоады 3 и 4 (ESM) зелёные уже на v5 из-за removeImportsExportsPlugin; в доказательство «красный на 5, зелёный на 6» не входят"
requirements-completed: [DEP-03, DEP-05]
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 1700
  tasks: 2
  commits: 0
estimate_actuals_note: "actuals.tokens = chars/4 по единственному изменённому файлу (6736 байт); коммитов нет по правилу пользователя"
completed: 2026-10-03
---

# Phase 2 Plan 01: характеризация MDX-конвейера на next-mdx-remote 5

**Тест `app/web/lib/mdx/untrusted.test.ts` прогоняет настоящий путь `normalizeMdxSource` -> `serialize(normalized, buildMdxOptions())` -> `renderToString(MDXRemote)` в Node без jsdom. На next-mdx-remote 5.0.0 выражения {1, 2, 5} исполняются (флаг `globalThis.__mdxPwned` выставлен), `<script>` и `srcdoc` (6, 7) проходят в HTML; эти пять проверок оформлены `test.fails`. Эталоны легитимного контента зелёные.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Файлы, готовые к коммиту

- `app/web/lib/mdx/untrusted.test.ts` (новый, untracked)

Код MDX-конвейера (`app/web/lib/mdx/*.ts`, `MdxRenderer.tsx`) не менялся: `git status --porcelain --untracked-files=all -- app/web/lib/mdx app/web/components/tests` печатает ровно `?? app/web/lib/mdx/untrusted.test.ts`.

## Выполнение

- Task 1 (tracer): срез «выражение в блоке» и style-эталон. Прогон: `2 passed | 1 expected fail (3)`. Гейт tracer: `<verify>` перезапущен, зелёный. Проба: `test.fails` -> `test` даёт `AssertionError ... + 'flow' - undefined`, то есть падение на флаге, а не на импорте или рендере. Файл возвращён в исходный вид.
- Task 2: матрица из 9 пейлоадов, 9 эталонов, 2 записи `EXPRESSION_CONTENT`. Итог: `Tests 24 passed | 5 expected fail (29)`.
- Опция `development` в `serialize` не понадобилась: рендер под Vitest (`NODE_ENV=test`) прошёл без ошибок jsx-runtime.
- TDD по сути (без коммитов): Task 1 сначала зафиксировал красную проверку флага (на v5 она падает), затем разметку `test.fails` сделал по факту прогона-пробы всех пейлоадов; проверки, зелёные на v5, оставлены обычными `test`, способность их ассертов упасть подтверждена пробами ниже.

## Разметка пейлоадов на v5 (next-mdx-remote 5.0.0)

| # | Пейлоад (name в PAYLOADS) | v5 | compiled на v5 | Механизм | Причина / проба |
|---|---|---|---|---|---|
| 1 | выражение в блоке | красный (флаг `flow`) | true | `test.fails` | при `test` падает на `assert.equal(__mdxPwned, undefined)`: `+ 'flow'` |
| 2 | выражение в абзаце | красный (флаг `inline`) | true | `test.fails` | при `test` падает на флаге: `+ 'inline'` |
| 3 | ESM export (вырезает removeImportsExportsPlugin уже в v5) | зелёный | true | `test` | next-mdx-remote 5 без `useDynamicImport` добавляет `removeImportsExportsPlugin` (`node_modules/next-mdx-remote/dist/serialize.js`), HTML `<p>абзац</p>`, флаг не выставлен. Проба A (`__mdxPwned = 'probe'` перед ассертом): падает на флаге `+ 'probe'`. Проба B (`assertInert(html + '<script>')`): падает на `/<script/i` |
| 4 | ESM import (вырезает removeImportsExportsPlugin уже в v5) | зелёный | true | `test` | тот же плагин; импорт `./pwned.js` вырезается, компиляция не падает, HTML `<p>абзац</p>`. Пробы A и B падают на флаге и на `/<script/i` |
| 5 | выражение в атрибуте onError | красный (флаг `attr`) | true | `test.fails` | при `test` падает на флаге: `+ 'attr'` (выражение атрибута вычисляется при рендере) |
| 6 | элемент script | красный (`assertInert`) | true | `test.fails` | HTML `<script>globalThis.__mdxPwned = 'script'</script>`; при `test` падает на `/<script/i` |
| 7 | iframe srcdoc со скриптом | красный (`assertInert`) | true | `test.fails` | HTML `<iframe srcdoc="&lt;script&gt;…">`; при `test` падает на `/\ssrcdoc=/i` |
| 8 | строковые обработчики on* | зелёный | true | `test` | React не печатает строковые `onerror`/`onClick` (предупреждение `Invalid event handler property`), HTML `<img src="/a.png" alt=""/>` и `<div>x</div>`. Пробы A и B падают на флаге и на `/<script/i` |
| 9 | javascript: в ссылках | зелёный | true | `test` | React 19 подменяет URL на `javascript:throw new Error('React has blocked a javascript: URL…')`, `__mdxPwned` в атрибутах нет. Пробы A и B падают на флаге и на `/<script/i` |

- Обязательный красный набор {1, 2, 5} на v5 красный: STOP плана 002 не наступил. Это доказательство D-11 «красный на 5».
- 6 и 7 — `test.fails` по факту красноты `assertInert`; на v6 их закрывает плагин 02-08.
- 3 и 4 в доказательство «красный на 5, зелёный на 6» не входят: ESM вырезается уже на v5.
- Расхождений с фактом, записанным при ревью плана, нет: красные 1, 2, 5, 6, 7; зелёные 3, 4, 8, 9; все 9 `compiled: true`.
- Для 02-08: переключить в обычный `test` ровно имена из константы `KNOWN_HOLES` (1, 2, 5, 6, 7).

## EXPRESSION_CONTENT на v5

Сравнение после `html.replace(/<!-- -->/g, '')`, строка целиком.

| name | Исходник | Вывод v5 | Ожидание на v6 (D-08) |
|---|---|---|---|
| выражения в тексте | `` число {2} и {' '} и {"{"} `` | `<p>число 2 и   и {</p>` (сырой HTML: `<p>число <!-- -->2<!-- --> и <!-- --> <!-- --> и <!-- -->{</p>`) | `<p>число  и  и </p>` |
| объектный style | `<span style={{ color: 'red' }}>x</span>` | `<span style="color:red">x</span>` | `<span>x</span>` |

## Эталоны легитимного контента (LEGIT_FIXTURES), вывод v5

| name | Фрагменты в HTML |
|---|---|
| style у MDX-JSX span | `<span style="color:#e11d48;font-weight:700">цвет</span>` |
| style у блочного p | `<p style="text-align:center">по центру</p>` |
| GFM-таблица | `<table>`, `<th>А</th>`, `<th>Б</th>`, `<td>1</td>`…`<td>4</td>`, `</table>` |
| markdown-картинка | `<img src="uploads/tests/biology/cell/assets/a.png" alt="Клетка"/>` |
| HTML-картинка из редактора | `<img src="https://example.test/a.png" alt="схема" width="300" height="200"/>` |
| нижний и верхний индексы | `<sub>2</sub>`, `<sup>2+</sup>` |
| нумерация из редактора | `<p>1) первый</p>`, `<p>2) второй</p>` |
| жирный и курсив | `<strong>жирный</strong>`, `<em>курсив</em>` |
| экранированные фигурные скобки (`'\\{x\\}'`) | `<p>{x}</p>` |

Картинки на v5 дополнительно дают `<link rel="preload" as="image" …/>` от React 19; в ожидания это не включено.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/mdx/untrusted.test.ts`: `Test Files 1 passed`, `Tests 24 passed | 5 expected fail (29)`.
- Форма tracer: `mdx tracer shape ok`. Форма матрицы: `mdx matrix ok`.
- `yarn oxfmt app/web/lib/mdx/untrusted.test.ts` выполнен до подсчёта хеша; комментариев в файле нет.
- `yarn verify`: `yarn verify: OK` (все шаги passed, `lib/mdx/untrusted.test.ts (29 tests)` в шаге `lint-typecheck-test`).
- Пробы инверсии (A, B, C) делались во временной копии рабочего дерева и откатывались из резервной копии в scratchpad; хеш после откатов совпадает с записанным ниже.

## Deviations from Plan

None - plan executed exactly as written. Уточнение реализации: разметка `test.fails` задана константой `KNOWN_HOLES` (Set имён пейлоадов), а не полем в `PAYLOADS`, чтобы тип `PAYLOADS` остался `{ name, source, compiled }`, как в плане.

## Known Stubs

Нет.

## Threat Flags

Нет. Пейлоады только присваивают `globalThis.__mdxPwned` (T-2-02), `beforeEach` удаляет флаг.

## sha256

```
d9dd7aabd2e51277f762ea6c4c7121f1fa5a66e93bac2701670106c80e7c4695  app/web/lib/mdx/untrusted.test.ts
```

## Self-Check: PASSED

- FOUND: `app/web/lib/mdx/untrusted.test.ts`
- Коммиты не проверялись: коммитов нет по правилу пользователя.
