---
phase: 08-client-requests-runtime-and-decomposition
plan: 07
subsystem: web-editor
tags: [lexical, ssr, mdx, autocomplete, vitest, playwright, rt-01]

requires:
  - phase: 08-client-requests-runtime-and-decomposition
    provides: "08-01: золотые MDX-образцы, e2e набора тулбара full и две проверки promptText с test.fail"
provides:
  - SSR-тест редактора без DOM (renderToString пресета full в среде node)
  - CodeActionMenuPlugin без умолчания document.body
  - счётчик символов на globalThis.TextEncoder
  - трансформер AUTOCOMPLETE: подсказка автодополнения экспортируется в MDX пустой строкой
  - аудит components/editor/** на глобалы браузера с таблицей
affects: [08-10, 08-24, 08-25]

actuals:
  tokens: 2134
  tasks: 3
  commits: 0
plan_head_before: 186182dd31f8e93e98cc83a397e8e41c0ae86e5c
plan_head_after: 186182dd31f8e93e98cc83a397e8e41c0ae86e5c

tech-stack:
  added: []
  patterns:
    - "SSR-проверка компонента без DOM: renderToString из react-dom/server в Vitest environment node, файл .test.ts без JSX через createElement"
    - "Узел, которого не должно быть в MDX, выключается text-match трансформером с export → '' и regExp /(?!)/ без importRegExp и replace"

key-files:
  created:
    - app/web/components/editor/editor.ssr.test.ts
    - app/web/components/editor/transformers/markdown-autocomplete-transformer.ts
  modified:
    - app/web/components/editor/plugins/code-action-menu-plugin.tsx
    - app/web/components/editor/plugins/actions/counter-character-plugin.tsx
    - app/web/components/editor/GitCommitModal.tsx
    - app/web/components/editor/utils/mdx-converter.ts
    - app/web/components/editor/utils/mdx-golden.test.ts
    - e2e/tests/editor-toolbar.spec.ts

key-decisions:
  - "Полный рендер Editor full не падал и до правок (plugins.tsx передаёт anchorElem=null, счётчик в пресете UTF-16); красный прогон получен точечными SSR-тестами CodeActionMenuPlugin без anchorElem и CounterCharacterPlugin с UTF-8"
  - "Editor в SSR-тесте обёрнут в настоящий AuthProvider с initialMe учителя: InsertMediaLibrary вызывает useAuth (решение исполнителя, автономно)"
  - "GitCommitModal: чтение истории из localStorage при рендере защищено CAN_USE_DOM (решение исполнителя, автономно; модуль сейчас никто не импортирует)"
  - "AUTOCOMPLETE без importRegExp, replace и trigger: импорт Lexical 0.38.2 пропускает такой трансформер, regExp обязателен по типу и равен /(?!)/"
  - "new Image() в useSuspenseImage (image-component.tsx) не правится: вне регулярного выражения аудита, декоратор рендерится порталом только после монтирования"

patterns-established:
  - "SSR-тест редактора закрепляет RT-01: новый плагин с обращением к document или window при рендере роняет yarn verify"

requirements-completed: [RT-01]

coverage:
  - id: D1
    description: "Editor с пресетом full рендерится через renderToString без document и window"
    requirement: RT-01
    verification:
      - kind: unit
        ref: "app/web/components/editor/editor.ssr.test.ts#редактор с пресетом full рендерится на сервере без document и window"
        status: pass
    human_judgment: false
  - id: D2
    description: "CodeActionMenuPlugin без anchorElem и с null ничего не рендерит; счётчик символов UTF-8 и UTF-16 рендерится на сервере"
    requirement: RT-01
    verification:
      - kind: unit
        ref: "app/web/components/editor/editor.ssr.test.ts#меню блока кода без контейнера ничего не рендерит, счётчик символов рендерится на сервере в обеих кодировках"
        status: pass
    human_judgment: false
  - id: D3
    description: "Подсказка автодополнения не попадает в MDX"
    requirement: RT-01
    verification:
      - kind: unit
        ref: "app/web/components/editor/utils/mdx-golden.test.ts#подсказка автодополнения не попадает в MDX"
        status: pass
      - kind: e2e
        ref: "e2e/tests/editor-toolbar.spec.ts#promptText сохранённого вопроса, promptText черновика"
        status: pass
    human_judgment: false

deferred_human_gate: true
duration: 13min
completed: 2026-10-05
status: complete
---

# Phase 8 Plan 07: редактор без DOM при рендере и подсказка автодополнения вне MDX

**Редактор с пресетом `full` рендерится через `renderToString` в среде `node`, где нет `document` и `window`. Умолчание `anchorElem = document.body` в меню блока кода убрано, счётчик символов берёт `globalThis.TextEncoder`. Трансформер `AUTOCOMPLETE` экспортирует узел подсказки пустой строкой, поэтому `promptText` сохранённого вопроса и черновика равен введённому `trace text` на обоих проектах e2e без `test.fail`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** 13 мин
- **Started:** 2026-10-05T13:58 (локальное время)
- **Completed:** 2026-10-05T14:11
- **Tasks:** 3 из 3
- **Files modified:** 8 в worktree (2 новых, 6 изменённых)

## Accomplishments

- `editor.ssr.test.ts` (4 теста): среда без DOM; полный рендер `Editor` с `preset: 'full'`, `initialMdxContent: '# Заголовок'` и плейсхолдером внутри `AuthProvider`, в HTML есть «Медиатека»; `CodeActionMenuPlugin` без `anchorElem` и с `null` даёт пустую строку; `CounterCharacterPlugin` в `LexicalComposer` рендерит `0 characters` для `UTF-8` и `UTF-16`.
- `code-action-menu-plugin.tsx`: `anchorElem` без умолчания, тип `HTMLElement | null` обязателен, `null` → `null`. Вызывающий только `plugins.tsx`, он не менялся.
- `counter-character-plugin.tsx`: `globalThis.TextEncoder` в проверке и в `new`; логика подсчёта та же.
- `GitCommitModal.tsx`: `getHistory()` при рендере возвращает `[]` без `CAN_USE_DOM`; в браузере поведение прежнее.
- `markdown-autocomplete-transformer.ts`: `AUTOCOMPLETE` с `dependencies: [AutocompleteNode]`, `export` → `''` для `AutocompleteNode` и `null` для остальных узлов, `regExp: /(?!)/`. В `MDX_TRANSFORMERS` стоит перед `EMOJI`, порядок остальных прежний.
- Золотой тест на состояние «`TextNode('trace text')` + `AutocompleteNode('books (TAB)')`»: вывод строго равен выводу абзаца с одним `trace text` и не содержит `books` и `(TAB)`. 14 золотых образцов 08-01 (`mdx-golden-cases.ts`) не менялись и проходят.
- `e2e/tests/editor-toolbar.spec.ts`: снят `test.fail()` с проверок «promptText сохранённого вопроса» и «promptText черновика».

## Ход задач

1. **Задача 1 (tracer, TDD).** Снимок `08-plan-files.cjs snapshot 08-07` (0 путей, дерево чистое). Первый прогон SSR-теста упал на `useAuth must be used within <AuthProvider>` (`InsertMediaLibrary`), после обёртки в `AuthProvider` полный рендер прошёл **до правок**: `plugins.tsx` передаёт `anchorElem={floatingAnchorElem}` (на сервере `null`, умолчание параметра срабатывает только на `undefined`), а счётчик в пресете `full` идёт с `charset="UTF-16"` и `window` не трогает. Поэтому красное состояние закреплено двумя точечными тестами: `ReferenceError: document is not defined` на `code-action-menu-plugin.tsx:157` и `ReferenceError: window is not defined` на `counter-character-plugin.tsx:11`. После правок 4 из 4 зелёные, проверка `node -e` плана печатает `rt01 sources ok`. Шлюз tracer: `<verify>` перепрогнан end-to-end, зелёный, затем расширение.
2. **Задача 2: аудит.** 121 строка `rg` (таблица ниже). Исправлено одно место: `GitCommitModal.tsx`. Остальное — эффекты, обработчики, колбэки Lexical, защищённые `CAN_USE_DOM` модульные константы или не глобалы. RT-02-файлы не тронуты.
3. **Задача 3 (TDD).** Сначала тест в `mdx-golden.test.ts`: красный, `"trace textbooks (TAB)"` — ровно утечка из e2e 08-01. После трансформера `vitest run components/editor`: 2 файла, 33 теста зелёные. Снятие `test.fail`, `oxfmt` по файлам, `codegraph affected`, `yarn verify`, `yarn e2e`, сверка.

## codegraph

В worktree нет `.codegraph/`, команды выполнены из основного дерева (индекс на `eae17fe`, редактор после 08-01 не менялся).

`codegraph impact CodeActionMenuPlugin`:

```
Impact of changing "CodeActionMenuPlugin" — 2 affected symbols:

function CodeActionMenuPlugin (tsx) — app/web/components/editor/plugins/code-action-menu-plugin.tsx:156
app/web/components/editor/plugins/code-action-menu-plugin.tsx
  function    CodeActionMenuPlugin:156

app/web/components/editor/plugins.tsx
  file        plugins.tsx:1
```

`codegraph impact CounterCharacterPlugin`:

```
Impact of changing "CounterCharacterPlugin" — 2 affected symbols:

function CounterCharacterPlugin (tsx) — app/web/components/editor/plugins/actions/counter-character-plugin.tsx:50
app/web/components/editor/plugins/actions/counter-character-plugin.tsx
  function    CounterCharacterPlugin:50

app/web/components/editor/plugins.tsx
  file        plugins.tsx:1
```

`codegraph impact Editor`:

```
Impact of changing "Editor" — 5 affected symbols:

function Editor (tsx) — app/web/components/editor/editor.tsx:76
app/web/components/editor/editor.tsx
  function    Editor:76

app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  function    QuestionEditor:46
  file        QuestionEditor.tsx:1

app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  function    QuestionEditorPageClient:119
  file        QuestionEditorPageClient.tsx:1
```

`codegraph affected` по 8 файлам плана:

```
Affected test files (4):

  app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  app/web/components/editor/editor.ssr.test.ts
  app/web/components/editor/utils/mdx-golden.test.ts
  e2e/tests/editor-toolbar.spec.ts
```

## Таблица аудита `components/editor/**`

Команда: `rg -n "\b(document|window|navigator|localStorage)\b" app/web/components/editor -g '*.ts' -g '*.tsx'` — 121 строка в 31 файле (номера строк после правок плана). Вердикт «допустимо» — обращение в эффекте, обработчике события, колбэке Lexical (`createDOM`, `exportDOM`, `importDOM`, команда, слушатель обновлений) или под `CAN_USE_DOM`.

| Файл | Строки | Контекст | Вердикт |
| --- | --- | --- | --- |
| `GitCommitModal.tsx` | 63 | комментарий в коде | не обращение |
| `GitCommitModal.tsx` | 83, 85 | `saveToHistory`, вызывается из `handleCommit` (обработчик) | допустимо |
| `GitCommitModal.tsx` | 94 | `getHistory()` вызывается в теле компонента при рендере | **исправлено**: `if (!CAN_USE_DOM) return []` |
| `editor.ssr.test.ts` | 38, 39, 42 | проверка `typeof` и название теста | тест, не обращение |
| `utils/mdx-golden.test.ts` | 29, 30 | проверка `typeof` | тест, не обращение |
| `plugins-config.ts` | 118 | ключ объекта `document:` (пресет) | не глобал |
| `utils/emoji-list.ts` | 11009, 11018, 11333, 11960, 11962 | строки тегов и описаний эмодзи | не глобал |
| `plugins/autocomplete-plugin.tsx` | 2318 | слово `'navigator'` в словаре подсказок | не глобал |
| `plugins/autocomplete-plugin.tsx` | 91, 93 | `formatSuggestionText`, вызывается в `editor.update` внутри `useEffect` | допустимо |
| `editor-ui/image-resizer.tsx` | 92-96, 104-106 | `setStartCursor`, `setEndCursor` из обработчиков указателя | допустимо |
| `editor-ui/image-resizer.tsx` | 140, 141, 205, 206 | `handlePointerDown`, `handlePointerUp` | допустимо |
| `editor-ui/code-button.tsx` | 44 | обработчик клика копирования | допустимо |
| `editor-ui/image-component.tsx` | 253 | `$onEnter`, колбэк команды Lexical | допустимо |
| `shared/caret-from-point.ts` | 17, 18, 26, 27 | тело функции, модуль никто не импортирует | допустимо |
| `shared/can-use-dom.ts` | 2-4 | сама защита `typeof window` | допустимо |
| `shared/environment.ts` | 13, 15, 17, 20, 22, 24, 26, 30, 35 | модульные константы под `CAN_USE_DOM &&`, модуль никто не импортирует | допустимо |
| `shared/environment.ts` | 29, 31 | закомментированные строки | не обращение |
| `nodes/mention-node.ts` | 77 | `exportDOM` | допустимо |
| `nodes/layout-item-node.tsx` | 18 | `createDOM` | допустимо |
| `nodes/layout-container-node.tsx` | 23 | `$convertLayoutContainerElement`, конвертер `importDOM` | допустимо |
| `nodes/layout-container-node.tsx` | 49, 58 | `createDOM`, `exportDOM` | допустимо |
| `nodes/emoji-node.tsx` | 28 | `createDOM` | допустимо |
| `nodes/image-node.tsx` | 112, 184 | `exportDOM`, `createDOM` | допустимо |
| `nodes/embeds/youtube-node.tsx` | 93 | `exportDOM` | допустимо |
| `nodes/embeds/tweet-node.tsx` | 61, 62 | `createTweet` (`useCallback`, вызывается из эффекта и `onload`) | допустимо |
| `nodes/embeds/tweet-node.tsx` | 82, 85 | `useEffect` | допустимо |
| `nodes/embeds/tweet-node.tsx` | 156, 158 | `exportDOM` | допустимо |
| `editor-hooks/use-report.ts` | 4, 7, 18, 19 | `getElement()`, вызывается из возвращаемого колбэка | допустимо |
| `editor-hooks/use-report.ts` | 34, 35 | `cleanup` из `useEffect` и таймера | допустимо |
| `plugins/tab-focus-plugin.tsx` | 23 | `registerKeyTimeStampTracker()`, вызывается в `useEffect` | допустимо |
| `plugins/typing-pref-plugin.tsx` | 101-105, 108-112 | `useEffect` и его очистка | допустимо |
| `plugins/code-action-menu-plugin.tsx` | 91, 96 | `useEffect` и его очистка | допустимо |
| `plugins/code-action-menu-plugin.tsx` | 157 (до правки) | умолчание параметра `anchorElem = document.body` при рендере | **исправлено** (задача 1) |
| `plugins/actions/counter-character-plugin.tsx` | 11, 16 (до правки) | `window.TextEncoder` в инициализаторе `useState` при рендере | **исправлено** (задача 1) |
| `plugins/context-menu-plugin.tsx` | 59, 62, 65, 94, 95, 109 | `$onSelect` пунктов меню | допустимо |
| `plugins/floating-text-format-plugin.tsx` | 87 | `mouseMoveListener` | допустимо |
| `plugins/floating-text-format-plugin.tsx` | 106, 107, 110, 111 | `useEffect` и очистка | допустимо |
| `plugins/floating-text-format-plugin.tsx` | 120 | `$updateTextFormatFloatingToolbar` (`useCallback`, из слушателей) | допустимо |
| `plugins/floating-text-format-plugin.tsx` | 149, 155 | `useEffect` и очистка | допустимо |
| `plugins/floating-text-format-plugin.tsx` | 310 | `updatePopup` (`useCallback`, слушатель `selectionchange`) | допустимо |
| `plugins/floating-text-format-plugin.tsx` | 359, 361 | `useEffect` и очистка | допустимо |
| `plugins/floating-link-editor-plugin.tsx` | 78, 79 | `$updateLinkEditor` (`useCallback`, из слушателей) | допустимо |
| `plugins/floating-link-editor-plugin.tsx` | 121, 128 | `useEffect` и очистка | допустимо |
| `plugins/floating-link-editor-plugin.tsx` | 351 | колбэк команды клика по ссылке | допустимо |
| `plugins/images-plugin.tsx` | 48 | `getDOMSelection` под `CAN_USE_DOM` | допустимо |
| `plugins/images-plugin.tsx` | 180, 182 | `useEffect` и очистка | допустимо |
| `plugins/images-plugin.tsx` | 270 | `$onDragStart`, колбэк команды | допустимо |
| `plugins/images-plugin.tsx` | 379, 380 | `getDragSelection`, из обработчиков перетаскивания | допустимо |
| `plugins/images-plugin/MediaLibrary.tsx` | 316 | `onClick` | допустимо |
| `plugins/embeds/auto-embed-plugin.tsx` | 123, 124 | замыкание, которое возвращает `debounce`; вызывается при вводе | допустимо |
| `plugins/actions/share-content-plugin.tsx` | 19, 22, 23 | `shareDoc`, обработчик кнопки | допустимо |
| `plugins/actions/share-content-plugin.tsx` | 26 | `useEffect` | допустимо |
| `plugins/actions/speech-to-text-plugin.tsx` | 45 | модульная константа `SUPPORT_SPEECH_RECOGNITION` под `CAN_USE_DOM &&` | допустимо; файл RT-02 |
| `plugins/actions/speech-to-text-plugin.tsx` | 53 | `SpeechRecognition` в теле компонента при рендере, под `CAN_USE_DOM &&` | допустимо (защищено); файл RT-02, **исполнитель 08-10** |

Вне регулярного выражения аудита: `editor-ui/image-component.tsx:51` — `new Image()` в `useSuspenseImage` при рендере `LazyImage`. Декоратор `ImageNode` рендерится порталом в DOM-элемент редактора только после монтирования, на сервере не вызывается. Не правилось, передаётся 08-24 (тот же файл в ленивых группах). `plugins/draggable-block-plugin.tsx:28,30` — `requestAnimationFrame` в обработчике `drop` внутри эффекта, допустимо.

## Находки для 08-10 (RT-02)

- `speech-to-text-plugin.tsx:53`: конструктор `SpeechRecognition` выбирается в теле компонента на каждом рендере (под `CAN_USE_DOM`, на сервере безопасно). При переводе на сессию с `dispose()` (D-16, D-17) выбор конструктора можно вынести в модуль сессии.
- `speech-to-text-plugin.tsx:55` и `typing-pref-plugin.tsx:34`: `useReport()`; его `cleanup` в `use-report.ts:34-35` при размонтировании вызывает `getElement()`, который создаёт `#report-container`, если его нет, и сразу удаляет. На SSR не влияет, к RT-02 относится как очистка при размонтировании.
- `use-debounce.ts`, `use-update-toolbar.ts`, `toolbar-plugin.tsx`: глобалов браузера по `rg` нет; находки D-16 (запись ref при рендере, повторные подписки) остаются за 08-10.

## Проверки

- `yarn workspace @bio-exam/web vitest run components/editor/editor.ssr.test.ts`: 1 файл, 4 теста, passed.
- Проверка источников `node -e …`: `rt01 sources ok`.
- `yarn workspace @bio-exam/web vitest run components/editor`: 2 файла, 33 теста, passed.
- `yarn workspace @bio-exam/web vitest run components/editor/utils/mdx-golden.test.ts`: 29 тестов, passed.
- Проверка `test.fail`: `no expected failures`.
- `yarn oxfmt --check .`: `All matched files use the correct format`.
- `yarn verify`: первый прогон `FAILED at lint-typecheck-test` — `TS2769` в `editor.ssr.test.ts` (`createElement(AuthProvider, { initialMe }, child)`: `children` обязателен в типе пропсов). Исправлено передачей `children` в пропсах. Повторный прогон: все 8 шагов passed, `yarn verify: OK`. Тесты: rbac 1 файл, exam-core 12, web 58, server 66.
- `yarn e2e`: `184 passed (1.4m)`. `editor-toolbar.spec.ts` на chromium-desktop и chromium-mobile: «набор тулбара full», «promptText сохранённого вопроса», «promptText черновика» — passed, набор кнопок `FULL_CONTROLS` не менялся.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-07`: `08-07 changed only its files`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SSR-тест требует AuthProvider**
- **Found during:** задача 1
- **Issue:** `InsertMediaLibrary` вызывает `useAuth()`, без провайдера рендер бросает `useAuth must be used within <AuthProvider>`. В приложении редактор всегда внутри `AuthProvider`.
- **Fix:** `Editor` в тесте обёрнут в `AuthProvider` с `initialMe` учителя (`tests.read`, `tests.write`); эффекты на сервере не выполняются, запросов нет.
- **Files modified:** `app/web/components/editor/editor.ssr.test.ts`

**2. [Rule 1 - Test design] Полный рендер не краснел до правок**
- **Found during:** задача 1
- **Issue:** behavior плана ожидал красный прогон на `document.body`, но полный рендер `Editor` проходил: умолчание параметра не срабатывает на `null`, счётчик в пресете `UTF-16`.
- **Fix:** добавлены точечные SSR-тесты `CodeActionMenuPlugin` без `anchorElem` и `CounterCharacterPlugin` с `UTF-8`; оба красные до правок и зелёные после. Полный рендер оставлен как общий сторож RT-01.
- **Files modified:** `app/web/components/editor/editor.ssr.test.ts`

**3. [Rule 1 - Bug] Типизация `createElement(AuthProvider, …)`**
- **Found during:** задача 3, первый `yarn verify`
- **Issue:** `TS2769`: `children` обязателен в типе пропсов `AuthProvider`.
- **Fix:** `children` передан в объекте пропсов.
- **Files modified:** `app/web/components/editor/editor.ssr.test.ts`

## Known Stubs

Нет.

## Threat Flags

Нет. T-8-16 закрыт трансформером `AUTOCOMPLETE`, золотым тестом и e2e точного равенства; T-8-17 — SSR-тестом в `yarn verify` и таблицей аудита; T-8-SC — установок нет, DOM-среда не добавлялась.

## Передачи следующим планам

- **08-10:** находки аудита выше; RT-02-файлы в этом плане не менялись.
- **08-24:** `CodeActionMenuPlugin` теперь принимает обязательный `anchorElem: HTMLElement | null` без умолчания: при ленивой загрузке группы передавать `floatingAnchorElem` как сейчас. `editor.ssr.test.ts` рендерит `Editor` с пресетом `full` через `renderToString` и импортирует `CodeActionMenuPlugin` и `CounterCharacterPlugin` по путям `./plugins/code-action-menu-plugin` и `./plugins/actions/counter-character-plugin`: при переносе файлов или переводе плагинов на `next/dynamic` тест обновляется в том же плане (`next/dynamic` при необходимости подменяется `vi.mock`, D-15). `new Image()` в `useSuspenseImage` (`image-component.tsx:51`) — при работе с этим файлом можно защитить `CAN_USE_DOM`.
- **08-24 и любые правки сериализации:** `AUTOCOMPLETE` стоит в `MDX_TRANSFORMERS` перед `EMOJI`; золотой тест «подсказка автодополнения не попадает в MDX» и e2e точного `promptText` теперь обычные проверки. `MarkdownTogglePlugin` в `plugins.tsx` использует свой список трансформеров без `AUTOCOMPLETE`: по коду `exportChildren` (Lexical 0.38.2) переключение в режим markdown при открытой подсказке покажет её текст; не проверялось. В `promptText` это не уходит: сохранение идёт только через `MDX_TRANSFORMERS`.

## Deferred human verification

- Коммит файлов плана — не выполнен, ждёт ведущей сессии; исполнитель не коммитил. Шагов пользователя план не содержит.

## Файлы к коммиту

```
 M app/web/components/editor/GitCommitModal.tsx
 M app/web/components/editor/plugins/actions/counter-character-plugin.tsx
 M app/web/components/editor/plugins/code-action-menu-plugin.tsx
 M app/web/components/editor/utils/mdx-converter.ts
 M app/web/components/editor/utils/mdx-golden.test.ts
 M e2e/tests/editor-toolbar.spec.ts
?? app/web/components/editor/editor.ssr.test.ts
?? app/web/components/editor/transformers/markdown-autocomplete-transformer.ts
```

## Self-Check: PASSED

- FOUND: `app/web/components/editor/editor.ssr.test.ts`, `app/web/components/editor/transformers/markdown-autocomplete-transformer.ts`
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `186182d`, изменения в рабочем дереве.
