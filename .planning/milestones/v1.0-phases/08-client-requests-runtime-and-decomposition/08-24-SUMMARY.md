---
phase: 08-client-requests-runtime-and-decomposition
plan: 24
subsystem: web/editor (данные эмодзи, ленивые группы плагинов, бюджет чанка)
tags: [PERF-03, PERF-05, D-22, D-23]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-01
    provides: золотые MDX-образцы, e2e editor-toolbar.spec.ts (FULL_CONTROLS, классы div.sticky / div.clear-both)
  - phase: 08-02
    provides: scripts/editor-bundle.mjs --report, EDITOR_ROUTES, EMOJI_MARKER, bench/editor-before.json
  - phase: 08-07
    provides: CodeActionMenuPlugin с обязательным anchorElem, editor.ssr.test.ts, AUTOCOMPLETE в MDX_TRANSFORMERS
  - phase: 08-10
    provides: SpeechToTextPlugin рисует null до гидрации, e2e Bold в div.sticky
provides:
  - utils/emoji-table.ts — createEmojiTableLoader, loadEmojiTable, getLoadedEmojiTable, EMOJI_ALIAS_PATTERN, EmojiEntry
  - mdxToEditorState ждёт таблицу только для MDX с :alias:, сбой загрузки — конвертация без таблицы, устаревшая конвертация не перезаписывает новую
  - пикер эмодзи грузит таблицу при открытии меню по `:`
  - plugins/optional/{emoji,mentions,code}.tsx через next/dynamic, OPTIONAL_PLUGIN_GROUPS и isPluginGroupEnabled в plugins-config.ts
  - scripts/editor-bundle.mjs --check [--budget], editorBundleCheck, scripts/editor-bundle-budget.json, yarn editor:budget, шаг CI «Check editor bundle budget»
  - e2e/tests/editor-emoji-lazy.spec.ts
affects: [08-25, 08-28]

actuals:
  tokens: 8700
  tasks: 3
  commits: 0
plan_head_before: 10f47fccda1b2b6fd6119d7627da6a5e926eefc0
plan_head_after: 10f47fccda1b2b6fd6119d7627da6a5e926eefc0

tech-stack:
  added: []
  patterns:
    - "Ленивые данные: загрузчик с мемо успешного промиса и сбросом мемо при отказе; синхронный доступ к уже загруженному (getLoadedEmojiTable) для трансформеров"
    - "Ленивая группа плагинов: файл plugins/optional/<группа>.tsx рендерит существующие плагины с isPluginEnabled; plugins.tsx подключает его next/dynamic({ ssr: false }) при isPluginGroupEnabled; списки имён групп — в plugins-config.ts, чтобы проверка не тянула модуль группы"

key-files:
  created:
    - app/web/components/editor/utils/emoji-table.ts
    - app/web/components/editor/utils/emoji-table.test.ts
    - app/web/components/editor/utils/mdx-emoji-load.test.ts
    - app/web/components/editor/plugins/optional/emoji.tsx
    - app/web/components/editor/plugins/optional/mentions.tsx
    - app/web/components/editor/plugins/optional/code.tsx
    - e2e/tests/editor-emoji-lazy.spec.ts
    - scripts/editor-bundle-budget.json
  modified:
    - app/web/components/editor/transformers/markdown-emoji-transformer.ts
    - app/web/components/editor/utils/mdx-converter.ts
    - app/web/components/editor/plugins/emoji-picker-plugin.tsx
    - app/web/components/editor/plugins.tsx
    - app/web/components/editor/plugins-config.ts
    - scripts/editor-bundle.mjs
    - scripts/editor-bundle.test.mjs
    - package.json
    - .github/workflows/ci.yml
    - AGENTS.md

key-decisions:
  - "Таблица эмодзи грузится только по вызову (решение пользователя 2026-10-05): открытие меню `:` в пикере или mdxToEditorState с :alias:; предзагрузки в QuestionEditorPageClient.tsx нет — фраза objective про загрузку при монтировании страницы устарела, файл не тронут"
  - "Пикер грузит таблицу на переходе queryString null → не null (открытие меню), а не на каждый символ: при сбое повтор — при следующем открытии `:` (решение исполнителя, автономно)"
  - "EmojiEntry = { emoji, aliases, tags }: поле tags добавлено к интерфейсу плана, иначе поиск пикера по тегам изменился бы (решение исполнителя, автономно)"
  - "mdxToEditorState хранит номер конвертации на редактор (WeakMap): конвертация, ждавшая таблицу, не применяется, если после неё началась другая — раньше конвертация была синхронной и гонки не было (решение исполнителя, автономно)"
  - "Ленивые группы: emoji (EmojiPicker), mentions (Mentions), code (CodeActionMenu). Остальные кандидаты D-22 оставлены в ядре по анализу бандла и поведению (таблица ниже)"
  - "Плагины с регистрацией node transform (EmojisPlugin, KeywordsPlugin, HashtagPlugin, CodeHighlightPlugin) не ленивые: registerNodeTransform после первой конвертации помечает узлы грязными, слушатель MdxPlugin отдаёт onMdxChange без правки пользователя (форма «изменена», автосохранение черновика) (решение исполнителя, автономно)"
  - "editor:budget проверяет обе величины и маркер emoji-list; путь бюджета по умолчанию scripts/editor-bundle-budget.json, --budget для фикстур тестов"

requirements-completed: [PERF-03, PERF-05]

duration: ~75 мин
completed: 2026-10-05
---

# Phase 8 Plan 24: ленивые эмодзи и группы плагинов редактора под бюджетом Summary

**Таблица эмодзи (262 605 байт в сборке) ушла из первой загрузки редактора и грузится по вызову; пикер, упоминания и меню блока кода — ленивые группы `next/dynamic`; JS первой загрузки редактора 2 874 142 → 2 602 281 байт (gzip 768 266 → 733 234) при тех же золотых MDX и наборе кнопок; бюджет +5 % проверяет `yarn editor:budget` в CI.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer): таблица эмодзи вне первой загрузки

- RED: `emoji-table.test.ts` (модуль отсутствовал) и `mdx-emoji-load.test.ts` (2 из 5 падали: сбой загрузки не вызывал загрузчик, таблица не грузилась для `:alias:`) — прогон красный, затем зелёный.
- `emoji-table.ts`: `createEmojiTableLoader(importer)` — успешный промис мемоизирован, параллельные вызовы делят один запрос, отказ сбрасывает мемо (только если это тот же промис); экземпляр по умолчанию `() => import('./emoji-list')`. `EMOJI_ALIAS_PATTERN = /:[a-z0-9_]+:/` без флага `g`.
- `EMOJI.replace` берёт `getLoadedEmojiTable()`; нет таблицы — замены нет, `:alias:` остаётся текстом (`export` по-прежнему `null`).
- `mdxToEditorState`: MDX без `:alias:` или при загруженной таблице — синхронная конвертация как раньше; иначе `loadEmojiTable().catch(() => null)` и конвертация; промис не отклоняется из-за сбоя чанка. `editor.tsx` не изменён.
- `emoji-picker-plugin.tsx`: `useEffect` с загрузкой при монтировании убран; загрузка — в `onQueryChange` при открытии меню; уже загруженная таблица берётся сразу. Пока таблицы нет, `options` пуст и меню не рисуется.
- Золотые образцы 08-01 (в том числе `heading-emoji`, `emoji-aliases`) зелёные без правок теста: STOP плана 008 не наступил.
- e2e `editor-emoji-lazy.spec.ts`: открытие вопроса из сида `editor-<проект>` (формулировка без `:alias:`), ожидание текста и `networkidle` — ни один JS-ответ не содержит `EMOJI_MARKER`; ввод ` :smi` — загружен ответ с маркером, виден пункт `😄 smile`, текст `… :smi` в редакторе. Зелёный на chromium-desktop и chromium-mobile.

### Task 2: ядро и ленивые группы

Анализ первой загрузки (сборка с правками Task 1, маркеры групп в чанках `.next/static/chunks`):

| Кандидат D-22 | Решение | Вес / причина |
|---|---|---|
| эмодзи: данные | лениво, по вызову | чанк `19imyri2qpxcm.js` 262 605 байт сырой, ~31,7 КБ gzip |
| эмодзи: пикер (`EmojiPicker`) | группа `optional/emoji.tsx` | входит в общий выигрыш групп ниже |
| упоминания (`Mentions`) | группа `optional/mentions.tsx` | чанк 8 136 байт сырой, ~4,4 КБ gzip |
| код: меню (`CodeActionMenu`) | группа `optional/code.tsx` | чанк 2 833 байт сырой, ~1,4 КБ gzip |
| код: подсветка (`CodeHighlight`) | ядро | `@lexical/code` статичен через `nodes.ts`; плагин 0,6 КБ и регистрирует node transform |
| эмодзи `:)` (`Emojis`), хэштеги, ключевые слова | ядро | регистрируют node transform (см. key-decisions); `@lexical/hashtag` статичен через `nodes.ts` |
| встраивания (`AutoEmbed`, `Twitter`, `YouTube`) | ядро | модуль `auto-embed-plugin` статически импортируют `insert-embeds.tsx` (тулбар) и `embeds-picker-plugin.tsx`: выигрыш 0 |
| раскладки (`Layout`) | ядро | `layout-plugin` статически импортируют `insert-columns-layout.tsx` и `columns-layout-picker-plugin.tsx`: выигрыш 0 |
| автодополнение | ядро | `nodes/autocomplete-node.tsx` импортирует `uuid` из `autocomplete-plugin.tsx`, узел статичен: выигрыш 0 без переноса `uuid` (файлы вне плана) |
| речь (`SpeechToText`), действия (импорт, экспорт, шаринг, markdown, режим, очистка, дерево) | ядро | плагины сами рисуют кнопки панели действий; статическая оболочка требует переписать вендорные плагины; суммарно ~14 КБ исходника |

Три группы вместе: первая загрузка 2 612 178 → 2 602 281 байт (−9 897), gzip 736 001 → 733 234 (−2 767). Группы подключаются `next/dynamic(..., { ssr: false })` при `isPluginGroupEnabled`, загрузка начинается при монтировании редактора; кнопки тулбара и панели действий не тронуты, обёртки `div.sticky` и `div.clear-both` прежние — `editor-toolbar.spec.ts` не менялся. `nodes.ts` и `editor.tsx` не менялись; файлы плагинов не переносились — импорты `editor.ssr.test.ts` прежние. `MarkdownTogglePlugin` и его список трансформеров не трогались.

### Task 3: бюджет, команда, CI

- RED: 7 новых тестов `--check` в `scripts/editor-bundle.test.mjs` падали, затем 12/12 зелёные.
- `editor-bundle.mjs`: режим `--check` (код 1: сырой или gzip больше бюджета — маршрут и числа; маркер emoji-list в первой загрузке; маршрут без лимитов; нет файла бюджета), `--budget <путь>`, экспорт `editorBundleCheck`; экспорты `EDITOR_ROUTES`, `EMOJI_MARKER`, `editorBundleReport` сохранены. Успех — строки размеров и `editor bundle OK`.
- `scripts/editor-bundle-budget.json`: ceil(размер × 1,05) по каждому маршруту.
- `package.json`: `"editor:budget": "node scripts/editor-bundle.mjs --check"`. `ci.yml`: шаг `Check editor bundle budget` (`run: yarn editor:budget`) сразу после «Build web». `AGENTS.md` «Project commands»: строка о `yarn editor:budget`.
- `08-BENCHMARKS.md`: колонка «После» строк редактора и черновика заполнена значениями 08-24 с пометкой; `bench/editor-after.json` не писался (его пишет 08-28).

## Размеры чанка редактора

Оба маршрута (`questions/[questionId]`, `questions/drafts/[draftId]`) одинаковы. Сборка `API_ORIGIN=http://127.0.0.1:4000 yarn workspace @bio-exam/web build`, `node scripts/editor-bundle.mjs --report`.

| Замер | Сырой, байт | gzip, байт | Чанков | emoji-list в первой загрузке |
|---|---|---|---|---|
| «до» 08-02 (`bench/editor-before.json`, af8410f) | 2 851 678 | 759 171 | 28 | да |
| «до» этого плана (HEAD 10f47fc, без правок) | 2 874 142 | 768 266 | 30 | да |
| после Task 1 | 2 612 178 | 736 001 | 29 | нет |
| после Task 2 (итог) | 2 602 281 | 733 234 | 30 | нет |
| бюджет (итог × 1,05, вверх) | 2 732 396 | 769 896 | — | запрещено |

Изменение к HEAD: −271 861 байт сырой (−9,5 %), −35 032 gzip (−4,6 %). К 08-02: −249 397 (−8,7 %), −25 937 (−3,4 %). Сырой бюджет ниже размера «до», gzip-бюджет немного выше gzip HEAD (769 896 > 768 266): возврат таблицы в первую загрузку ловит маркер и сырой лимит.

## codegraph

`codegraph impact` (индекс основного дерева):
- `EMOJI` — 3 символа: `markdown-emoji-transformer.ts`, `plugins.tsx`, `mdx-converter.ts`.
- `mdxToEditorState` — 4: `mdx-converter.ts`, `editor.tsx` (`MdxPlugin`, `Editor`).
- `Plugins` — 5: `plugins.tsx`, `editor.tsx` (`Editor`), `QuestionEditor.tsx` (`QuestionEditor`).
- `emojiList` — 2: `emoji-list.ts`, `markdown-emoji-transformer.ts` (второй импортёр — динамический в `emoji-picker-plugin.tsx`, в графе не виден).

`codegraph affected` по изменённым файлам: `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx` (новые файлы индексу неизвестны). Фактически затронутые тесты: `mdx-golden.test.ts`, `editor.ssr.test.ts`, `emoji-table.test.ts`, `mdx-emoji-load.test.ts`, `scripts/editor-bundle.test.mjs`, e2e `editor-toolbar.spec.ts`, `editor-emoji-lazy.spec.ts` — все прогнаны.

## Проверки

- `yarn workspace @bio-exam/web vitest run components/editor` — 7 файлов, 67 passed (после Task 1 и после Task 2).
- `API_ORIGIN=http://127.0.0.1:4000 yarn workspace @bio-exam/web build && node scripts/editor-bundle.mjs --report` — `"emojiInFirstLoad": false` на обоих маршрутах.
- `yarn e2e e2e/tests/editor-emoji-lazy.spec.ts` — 10 passed (8 setup + desktop + mobile).
- `yarn e2e e2e/tests/editor-toolbar.spec.ts e2e/tests/editor-emoji-lazy.spec.ts` — 18 passed (набор тулбара full, оба promptText, состояние Bold, ленивые эмодзи на обоих проектах).
- `node --test scripts/editor-bundle.test.mjs` — pass 12, fail 0.
- `yarn editor:budget` — `editor bundle OK`.
- `node scripts/check-ci-workflow.mjs` — `check-ci-workflow: OK`.
- `yarn verify` — `yarn verify: OK` (web 77 файлов тестов, server 77, exam-core 12, rbac 1; script-tests pass 213).
- `yarn e2e` — 196 passed (2,0 мин), failed 0.
- `oxfmt --check .` — все файлы в формате.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-24` — `08-24 changed only its files`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Гонка асинхронной конвертации MDX**
- **Found during:** Task 1
- **Issue:** конвертация MDX с `:alias:` теперь ждёт чанк; если за это время начнётся конвертация другого MDX без `:alias:` (сразу), устаревшая применилась бы позже и перезаписала новый текст.
- **Fix:** номер конвертации на редактор (`WeakMap`), устаревшая после загрузки не применяется; тест «устаревшая конвертация … не перезаписывает более новую».
- **Files modified:** `app/web/components/editor/utils/mdx-converter.ts`, `mdx-emoji-load.test.ts`

**2. [Rule 1 - Bug] Пикер без таблицы при загрузке её конвертацией MDX**
- **Found during:** Task 1
- **Issue:** если таблицу загрузила конвертация MDX после монтирования пикера, его состояние оставалось `null` и меню бы не появилось.
- **Fix:** при открытии меню пикер берёт `getLoadedEmojiTable()`, если таблица уже есть.
- **Files modified:** `app/web/components/editor/plugins/emoji-picker-plugin.tsx`

### Отклонения состава

- `QuestionEditorPageClient.tsx` из `<files>` Task 1 не тронут: предзагрузки нет по решению пользователя; в `files_modified` его нет.
- `emojis-plugin.tsx` (optional) не тронут: он не импортирует `emoji-list`.
- `editor-toolbar.spec.ts` (optional) не тронут: классы обёрток не менялись.
- Ленивых групп меньше, чем перечислено в D-22 (обоснование в таблице Task 2) — допускается правилом «точный состав — по анализу бандла».

## Поведение, о котором надо знать

- Ввод `:smile:` прямо в редакторе (трансформер `EMOJI` в `MarkdownShortcutPlugin`) заменяет код символом, только когда таблица уже загружена. Обычно её загружает открытие меню пикера на первом `:`; при сбое чанка код остаётся текстом. То же для «Convert from markdown» (`MarkdownTogglePlugin`), если в этой сессии таблица ещё не грузилась.
- `/`, `@` и `:` до загрузки соответствующей группы ничего не открывают; текст остаётся (UI-SPEC Поверхность 7).

## Передачи следующим планам

- 08-28: замер «после» — команды `08-BENCHMARKS.md` без изменений; строки редактора в колонке «После» уже заполнены значениями 08-24 (сырой 2 602 281, gzip 733 234, 30 чанков) — перезаписать своими, если 08-25…08-27 меняют редактор. Бюджет — `scripts/editor-bundle-budget.json`; если редактор растёт законно, пересчитать бюджет тем же правилом (размер × 1,05 вверх) в том же плане, иначе падает шаг CI «Check editor bundle budget».
- 08-25 и далее (правки редактора): `next/dynamic` группы — `plugins/optional/{emoji,mentions,code}.tsx`, списки — `OPTIONAL_PLUGIN_GROUPS` в `plugins-config.ts`. Плагин с `registerNodeTransform` в ленивую группу не переносить (onMdxChange без правки пользователя). `EmojiPickerPlugin`, `MentionsPlugin`, `CodeActionMenuPlugin` по-прежнему лежат по старым путям — `editor.ssr.test.ts` импортирует их напрямую.
- Таблица эмодзи: только `loadEmojiTable`/`getLoadedEmojiTable` из `utils/emoji-table.ts`; статический импорт `emoji-list` вернёт данные в первую загрузку — ловят `yarn editor:budget` (CI) и `editor-emoji-lazy.spec.ts`.
- Возможный выигрыш вне плана: вынести `uuid` из `autocomplete-plugin.tsx` (его импортирует `nodes/autocomplete-node.tsx` и `mdx-golden.test.ts`), тогда словарь автодополнения (~43 КБ исходника) можно сделать ленивой группой.
- `scripts/check-ci-workflow.mjs` шаг `yarn editor:budget` не требует (файл вне плана); добавить его в `JOB_ORDER.build` может план, который правит этот скрипт.

## Deferred human verification

- Редактор на preview (D-35): кнопки тулбара и панели действий, эмодзи (`:` и пикер, в том числе вопрос с `:smile:` в формулировке), `@`, меню блока кода, сохранение — сводно в 08-28. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает ведущая сессия. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Первый прогон шага CI «Check editor bundle budget» на ubuntu-24.04 после push (размеры чанков на Linux могут слегка отличаться от macOS; запас 5 %). Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Файлы к коммиту

Новые:
- app/web/components/editor/utils/emoji-table.ts
- app/web/components/editor/utils/emoji-table.test.ts
- app/web/components/editor/utils/mdx-emoji-load.test.ts
- app/web/components/editor/plugins/optional/emoji.tsx
- app/web/components/editor/plugins/optional/mentions.tsx
- app/web/components/editor/plugins/optional/code.tsx
- e2e/tests/editor-emoji-lazy.spec.ts
- scripts/editor-bundle-budget.json

Изменённые:
- app/web/components/editor/transformers/markdown-emoji-transformer.ts
- app/web/components/editor/utils/mdx-converter.ts
- app/web/components/editor/plugins/emoji-picker-plugin.tsx
- app/web/components/editor/plugins.tsx
- app/web/components/editor/plugins-config.ts
- scripts/editor-bundle.mjs
- scripts/editor-bundle.test.mjs
- package.json
- .github/workflows/ci.yml
- AGENTS.md

Вне git (`.planning`): `08-24-SUMMARY.md`, правка `08-BENCHMARKS.md` (колонка «После» строк редактора).

## Self-Check: PASSED
