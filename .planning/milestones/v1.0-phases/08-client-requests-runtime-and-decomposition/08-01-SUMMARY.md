---
phase: 08-client-requests-runtime-and-decomposition
plan: 01
subsystem: testing
tags: [lexical, mdx, vitest, playwright, react-doctor, characterization]

requires:
  - phase: 07.1-teacher-role
    provides: код редактора и e2e-фикстуры на коммите eae17fe
provides:
  - золотые MDX-образцы редактора без DOM (14 образцов, строгое сравнение и идемпотентность)
  - e2e набор кнопок тулбара и нижней панели пресета full на desktop и mobile
  - e2e закрепление утечки подсказки автодополнения в promptText (test.fail до 08-07)
  - тест editor-<p> в сиде e2e
  - базовый прогон react-doctor@0.9.17 с разметкой находок
affects: [08-07, 08-10, 08-24, 08-25]

actuals:
  tokens: 6903
  tasks: 4
  commits: 0
plan_head_before: eae17fef107178a2cc82da3c34eb0effae183d21
plan_head_after: eae17fef107178a2cc82da3c34eb0effae183d21

tech-stack:
  added: []
  patterns:
    - "Сериализация редактора проверяется без DOM: createEditor из lexical с nodes.ts, mdxToEditorState и editorStateToMdx в read"
    - "Набор кнопок тулбара снимается как роль и доступное имя каждого button; у безымянных — текст или класс lucide-иконки в скобках"

key-files:
  created:
    - app/web/components/editor/utils/mdx-golden-cases.ts
    - app/web/components/editor/utils/mdx-golden.test.ts
    - e2e/tests/editor-toolbar.spec.ts
    - .planning/phases/08-client-requests-runtime-and-decomposition/08-REACT-DOCTOR.md
    - .planning/phases/08-client-requests-runtime-and-decomposition/deferred-items.md
  modified:
    - e2e/fixtures/seed.json

key-decisions:
  - "Проба D-17 пройдена: Lexical сериализует MDX в Vitest environment node без DOM, STOP не наступил"
  - "Набор кнопок full одинаков на desktop и mobile, записан одним литералом FULL_CONTROLS"
  - "В набор тулбара включены radio (подстрочный и надстрочный, выравнивание, отступы): это кнопки тулбара ToggleGroup (решение исполнителя, автономно)"
  - "Обе проверки promptText (сохранённый вопрос и черновик) падают из-за подсказки автодополнения на обоих проектах и помечены test.fail до 08-07"
  - "react-doctor закреплён на 0.9.17; подтверждено 9 диагностик в 6 местах, назначены 08-07, 08-10, 08-25"

patterns-established:
  - "Золотые образцы: поле output — фактический вывод кода, idempotent: false фиксирует известную неидемпотентность без исправления"

requirements-completed: [RT-04, PERF-03]

coverage:
  - id: D1
    description: "Проба D-17 и золотые MDX-образцы D-22 без DOM"
    requirement: PERF-03
    verification:
      - kind: unit
        ref: "app/web/components/editor/utils/mdx-golden.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Набор кнопок тулбара и нижней панели пресета full на desktop и mobile"
    requirement: PERF-03
    verification:
      - kind: e2e
        ref: "e2e/tests/editor-toolbar.spec.ts#набор тулбара full"
        status: pass
    human_judgment: false
  - id: D3
    description: "Точный promptText сохранённого вопроса и черновика (известный дефект, test.fail до 08-07)"
    verification:
      - kind: e2e
        ref: "e2e/tests/editor-toolbar.spec.ts#promptText сохранённого вопроса, promptText черновика"
        status: pass
    human_judgment: false
  - id: D4
    description: "Базовый прогон React Doctor с закреплённой версией и разметкой находок"
    requirement: RT-04
    verification:
      - kind: other
        ref: "npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline"
        status: pass
    human_judgment: false

deferred_human_gate: true
duration: 16min
completed: 2026-10-05
status: complete
---

# Phase 8 Plan 01: характеризация редактора до правок

**Lexical сериализует MDX без DOM: 14 золотых образцов с проверкой идемпотентности (таблица не идемпотентна). В e2e закреплены 26 элементов тулбара и 8 кнопок нижней панели пресета full, а также утечка подсказки автодополнения: в promptText попадает `trace textbooks (TAB)` или `trace textbooks (SWIPE ⮕)`. Базовый прогон react-doctor@0.9.17 дал 229 диагностик, из них подтверждено 9.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** 16 мин
- **Started:** 2026-10-05T05:30:50Z
- **Completed:** 2026-10-05T05:47Z
- **Tasks:** 4 из 4
- **Files modified:** 4 в worktree (3 новых, 1 изменён) и 3 файла в `.planning`

## Accomplishments

- Проба D-17 пройдена первой задачей: в Vitest `environment: 'node'` редактор из `createEditor` (`lexical`) с `nodes.ts` принимает MDX через `mdxToEditorState` и отдаёт его через `editorStateToMdx`. `document` и `window` не определены, это проверяет отдельный тест. `@lexical/headless` не использовался.
- 14 золотых образцов D-22 записаны по выводу текущего кода. Тест сравнивает строго и проверяет идемпотентность: 28 тестов (1 среда, 14 образцов, 13 идемпотентности).
- `e2e/tests/editor-toolbar.spec.ts` закрепляет набор и порядок кнопок пресета `full` на chromium-desktop и chromium-mobile. Обе проверки точного `promptText` записаны со строгим `toBe`.
- `08-REACT-DOCTOR.md`: версия 0.9.17, команда, базовый прогон и таблица по всем 229 диагностикам.

## Ход задач

1. **Задача 1 (tracer): проба Lexical без DOM и образец `heading-emoji`.** Сначала прогон с пустым `output`: красный, сравнение `'# Заголовок\n\nПривет 😄'` с `''`, тест среды зелёный. Затем фактический вывод скопирован в `output`, прогон зелёный. Шлюз tracer: `<verify>` перепрогнан end-to-end и прошёл, затем расширение.
2. **Задача 2: полный набор образцов.** Входы 13 новых образцов прогнаны через тот же путь `createEditor → mdxToEditorState → editorStateToMdx` во временном тесте `zz-capture.test.ts`. Он записывал вывод и повторный вывод в scratchpad и удалён сразу после прогона. `output` каждого образца взят из этого вывода, затем золотой тест прогнан зелёным.
3. **Задача 3: e2e.** Сид дополнен тестами `editor-desktop` и `editor-mobile`. Спецификация прогнана сначала с пустыми массивами (красный прогон, массивы сняты из диффа), затем без отметок на `promptText` (обе проверки красные на обоих проектах), затем с `test.fail()`: зелёная.
4. **Задача 4: React Doctor, `codegraph affected`, `yarn verify`, `yarn e2e`, сверка.** Все шаги зелёные.

## codegraph

В worktree нет `.codegraph/`. Команды выполнены из основного дерева: его индекс построен на том же коммите `eae17fe`, и на старте плана код совпадает.

`codegraph impact mdxToEditorState`:

```
Impact of changing "mdxToEditorState" — 4 affected symbols:

function mdxToEditorState (typescript) — app/web/components/editor/utils/mdx-converter.ts:38
app/web/components/editor/utils/mdx-converter.ts
  function    mdxToEditorState:38

app/web/components/editor/editor.tsx
  function    MdxPlugin:29
  function    Editor:76
  file        editor.tsx:1
```

`codegraph impact editorStateToMdx`:

```
Impact of changing "editorStateToMdx" — 4 affected symbols:

function editorStateToMdx (typescript) — app/web/components/editor/utils/mdx-converter.ts:58
app/web/components/editor/utils/mdx-converter.ts
  function    editorStateToMdx:58

app/web/components/editor/editor.tsx
  function    MdxPlugin:29
  function    Editor:76
  file        editor.tsx:1
```

`codegraph affected` по файлам плана (индекс основного дерева новых файлов не знает, поэтому в выводе они перечислены как есть):

```
Affected test files (3):

  app/web/components/editor/utils/mdx-golden.test.ts
  e2e/fixtures/seed.json
  e2e/tests/editor-toolbar.spec.ts
```

`codegraph affected app/web/components/editor/utils/mdx-converter.ts app/web/components/editor/nodes.ts` (то, что характеризует план):

```
Affected test files (1):

  app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
```

## Проба D-17

Пройдена. Пакет `lexical` 0.x из зависимостей web, `createEditor({ namespace, nodes: [...nodes], onError: throw })`. Все узлы `nodes.ts` регистрируются без DOM, включая `ImageNode`, `TweetNode`, `HorizontalRuleNode`, таблицы и `AutocompleteNode`. Конвертация в обе стороны работает. Новых зависимостей нет.

## Золотые образцы (`MDX_GOLDEN_CASES`)

| Образец | Что закрепляет | Идемпотентен |
| --- | --- | --- |
| `heading-emoji` | `# Заголовок` и `:smile:` → `😄` | да |
| `emoji-aliases` | `:heart::fire: :thumbsup: :rocket:` → `❤️🔥 👍 🚀`, неизвестный `:nope:` остаётся текстом | да |
| `image-markdown` | `![Клетка под микроскопом](/uploads/cell.png)` без изменений | да |
| `image-html-sized` | `<img src alt width="320" height="240" />` без изменений | да |
| `table` | выравнивание `:---`, `:---:`, `---:` → `---`; перед текстом непустой ячейки добавляется пробел (`|  Орган |`); пустая ячейка остаётся `|  |` | **нет** (`idempotent: false`: каждый проход добавляет пробел) |
| `code-block` | блок ```` ```python ```` с двумя строками без изменений | да |
| `check-list` | `- [x]` и `- [ ]` без изменений | да |
| `horizontal-rule` | `---` → `***` | да |
| `tweet` | `<tweet id="1234567890" />` без изменений | да |
| `headings-quote` | h1-h3 и `> цитата` без изменений | да |
| `lists` | нумерованный с вложенным маркированным (отступ 4 пробела) и отдельный маркированный без изменений | да |
| `link` | `[учебнике](https://example.com/biology)` без изменений | да |
| `inline-formats` | `**жирное**`, `*курсивное*`, `~~зачёркнутое~~`, `` `код` `` без изменений | да |
| `multi-paragraph` | абзацы с одной и тремя пустыми строками между ними без изменений | да |

## Набор кнопок пресета `full` (одинаков на desktop и mobile)

Каждый `button` контейнера записывается как роль из `ariaSnapshot` и доступное имя. У кнопки без имени вместо имени в скобках стоит текст кнопки или класс lucide-иконки. Так записаны три `combobox` (их доступное имя пусто) и четыре иконки-кнопки без подписи.

Тулбар (26): `button:Undo`, `button:Redo`, `combobox:[Paragraph]`, `combobox:[Arial]`, `button:[lucide-minus]`, `button:16`, `button:[lucide-plus]`, `button:1.5`, `button:Bold`, `button:Italic`, `button:Underline`, `button:Strikethrough`, `radio:Toggle subscript`, `radio:Toggle superscript`, `button:Toggle link`, `button:Clear formatting`, `button:text color`, `button:text background color`, `radio:Left Align`, `radio:Center Align`, `radio:Right Align`, `radio:Justify Align`, `radio:Outdent`, `radio:Indent`, `combobox:[Insert]`, `button:Медиатека`.

Нижняя панель действий (8): `button:Disable speech to text`, `button:Share Playground link to current editor state`, `button:Import editor state from JSON`, `button:Export editor state to JSON`, `button:Convert from markdown`, `button:Lock read-only mode`, `button:[lucide-trash2]` (очистка), `button:[lucide-notebook-pen]` (дерево).

Сравнение идёт через `expect.poll` (до 15 с), чтобы после ленивой загрузки 08-24 набор сверялся с уже загруженными группами.

## Проверки `promptText`

Ввод `trace text`, ожидаемое значение `trace text` (вывод сериализации абзаца).

| Проверка | chromium-desktop (факт) | chromium-mobile (факт) | Отметка |
| --- | --- | --- | --- |
| Сохранённый вопрос (`/questions/<id>` → «Сохранить вопрос» → by-slug) | `"trace textbooks (TAB)"` | `"trace textbooks (SWIPE ⮕)"` | `test.fail()` |
| Черновик (`/questions/new` → PATCH 200 с `trace text` → GET черновика) | `"trace textbooks (TAB)"` | `"trace textbooks (SWIPE ⮕)"` | `test.fail()` |

Обе проверки сначала прогнаны без отметок и упали на обоих проектах. Когда 08-07 устранит утечку, `test.fail()` даст «unexpected pass», и 08-07 снимет отметки. Пока отметка стоит, любая другая причина падения этих двух тестов тоже будет скрыта.

## React Doctor

- Версия `react-doctor@0.9.17` (`npm view react-doctor version`), сеть была, отложенного шага нет.
- Команда: `npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline` из корня worktree, код выхода 1 (диагностики уровня error).
- Score 46 / 100, 229 диагностик (9 error, 220 warning).
- Разметка в `08-REACT-DOCTOR.md`. Подтверждено 9 диагностик в 6 местах: 08-07 — `code-action-menu-plugin.tsx:157`; 08-10 — `speech-to-text-plugin.tsx:45`, `:53`, `:57`, `use-debounce.ts:7`; 08-25 — `MediaLibrary.tsx:337` (два правила). Ложные срабатывания: `mentions-plugin.tsx:573` и `SearchDialog.tsx:110`, `:118` (`plans/README.md`). Остальные 216 вне охвата. Сверка: 9 + 16 + 204 = 229.
- Инструмент предлагает `npx react-doctor install --yes`; не выполнялось (новый пакет).

Полный вывод диагностик базового прогона. Общий блок «Agent guidance» в начале и рекламный блок в конце опущены: они не зависят от кода.

```
React Doctor — @bio-exam/web
Score: 46 / 100 Critical

229 issues
Performance: 50 warnings
Bugs: 8 errors, 93 warnings
Maintainability: 43 warnings
Accessibility: 1 error, 31 warnings
Security: 3 warnings

⚠ Intl formatter rebuilt each call ×2
  react-doctor/js-hoist-intl
  app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx:23
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:133
⚠ Locale/timezone formatting during render ×8
  react-doctor/no-locale-format-in-render
  app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx:23
  app/(internal)/(protected)/admin/tests/components/test-editor/QuestionsPanel.tsx:71 (test file)
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:133
  components/ui/calendar.tsx:145
  components/users/UserProfileAssignmentsPage.tsx:737
  components/users/UserProfileAssignmentsPage.tsx:783
  components/users/UserRowItem.tsx:122
  components/users/UsersTable.tsx:274
⚠ fetch Response consumed without status check ×10
  react-doctor/no-fetch-response-used-without-status-check
  app/(internal)/(protected)/admin/attempts/[id]/page.tsx:23
  app/(internal)/(protected)/admin/groups/GroupsClient.tsx:19
  app/(internal)/(protected)/admin/settings/rbac/page.tsx:22
  app/(internal)/(protected)/admin/users/UsersClient.tsx:19
  app/(internal)/(protected)/profile/ProfileClient.tsx:19
  components/AppSidebar.tsx:39
  components/groups/GroupSheet.tsx:69
  components/users/dialogs/EditUserDialog.tsx:81
  components/users/dialogs/UserGrantsDialog.tsx:28
  lib/fetcher.ts:2
⚠ React function has high control-flow complexity ×9
  react-doctor/no-high-complexity-react-function
  app/(internal)/(protected)/admin/groups/GroupsClient.tsx:21
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:178
  components/editor/editor-ui/image-component.tsx:157
  components/editor/plugins.tsx:111
  components/editor/plugins/images-plugin/MediaLibrary.tsx:37
  components/groups/GroupSheet.tsx:82
  components/users/UserProfileAssignmentsPage.tsx:145
  components/users/UserRowItem.tsx:26
  components/users/dialogs/EditUserDialog.tsx:130
⚠ Array lookup inside a loop ×6
  react-doctor/js-set-map-lookups
  app/(internal)/(protected)/admin/settings/rbac/page.tsx:89
  components/Breadcrumbs/index.tsx:109
  components/editor/plugins/toolbar/font-format-toolbar-plugin.tsx:35
  components/groups/GroupSheet.tsx:308
  components/groups/GroupSheet.tsx:342
  components/users/dialogs/EditUserDialog.tsx:520
⚠ Large component is hard to read and change ×8
  react-doctor/no-giant-component
  app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx:122
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:178
  components/editor/editor-ui/image-component.tsx:157
  components/editor/plugins/images-plugin/MediaLibrary.tsx:37
  components/groups/GroupSheet.tsx:82
  components/ui/image-upload.tsx:26
  components/users/UserProfileAssignmentsPage.tsx:145
  components/users/dialogs/EditUserDialog.tsx:130
⚠ Data fetching inside an effect ×5
  react-doctor/no-fetch-in-effect
  app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx:185
  app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx:110 (test file)
  app/(internal)/invite/[token]/InviteClient.tsx:21
  components/AppSidebar.tsx:38
  components/editor/plugins/drag-drop-paste-plugin.tsx:58
⚠ Icon-only Button without accessible name ×18
  react-doctor/shadcn-icon-button-requires-label
  app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx:493
  app/(internal)/(protected)/admin/tests/TestsClient.tsx:322 (test file)
  app/(internal)/(protected)/admin/tests/TestsClient.tsx:367 (test file)
  app/(internal)/(protected)/admin/tests/TestsClient.tsx:464 (test file)
  app/(internal)/(protected)/admin/tests/components/MatchingEditor.tsx:128 (test file)
  app/(internal)/(protected)/admin/tests/components/MatchingEditor.tsx:157 (test file)
  app/(internal)/(protected)/admin/tests/components/OptionsEditor.tsx:106 (test file)
  app/(internal)/(protected)/admin/tests/components/OptionsEditor.tsx:136 (test file)
  app/(internal)/(protected)/admin/tests/components/QuestionTypeScoringRuleEditor.tsx:192 (test file)
  app/(internal)/(protected)/admin/tests/components/topic-page/TopicTestCard.tsx:50 (test file)
  components/Search/SearchButton.tsx:34
  components/ThemeSwitcher.tsx:62
  components/editor/plugins/floating-link-editor-plugin.tsx:223
  components/editor/plugins/floating-link-editor-plugin.tsx:234
  components/editor/plugins/floating-link-editor-plugin.tsx:249
  components/editor/plugins/floating-link-editor-plugin.tsx:259
  components/editor/plugins/toolbar/font-size-toolbar-plugin.tsx:61
  components/editor/plugins/toolbar/font-size-toolbar-plugin.tsx:88
⚠ Array index used as a key ×6
  react-doctor/no-array-index-as-key
  app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx:246 (test file)
  app/(internal)/(protected)/admin/tests/components/QuestionTypeScoringRuleEditor.tsx:166 (test file)
  components/Tiles/index.tsx:22
  components/editor/GitCommitModal.tsx:137
  components/tests/attempt-review/QuestionAnswerReview.tsx:40 (test file)
  components/tests/attempt-review/QuestionAnswerReview.tsx:171 (test file)
⚠ Sequential independent awaits ×2
  react-doctor/server-sequential-independent-await
  app/(internal)/(protected)/admin/users/[id]/page.tsx:38
  app/(internal)/(protected)/profile/[id]/page.tsx:11
⚠ Heavy library loaded eagerly ×4
  react-doctor/prefer-dynamic-import
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:21
  components/data-table.tsx:48
  components/progress/AttemptBarChart.tsx:7
  components/ui/chart.tsx:5
⚠ eslint/no-unused-vars ×7
  eslint/no-unused-vars
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:21
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:21
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:95
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:102
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:230
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:240
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:268
⚠ transition: all animates everything ×5
  react-doctor/no-transition-all
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:309
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:429
  app/(internal)/(protected)/dashboard/DashboardClient.tsx:705
  components/editor/plugins/images-plugin/MediaLibrary.tsx:275
  components/nav-user.tsx:51
⚠ State update after await in an effect
  react-doctor/no-set-state-after-await-in-effect
  app/(internal)/invite/[token]/InviteClient.tsx:21
⚠ Loading flag reset outside finally ×2
  react-doctor/no-loading-flag-reset-outside-finally
  app/(internal)/invite/[token]/InviteClient.tsx:34
  components/Search/SearchDialog.tsx:192
⚠ Client-side redirect for navigation ×3
  react-doctor/nextjs-no-client-side-redirect
  app/(internal)/login/LoginPageClient.tsx:52
  app/(internal)/login/LoginPageClient.tsx:61
  components/auth/AuthGuard.tsx:48
⚠ Unstable context provider value ×4
  react-doctor/jsx-no-constructed-context-values
  components/Breadcrumbs/BreadcrumbsContext.tsx:15
  components/editor/context/doc-path-context.tsx:12
  components/ui/chart.tsx:46
  components/ui/toggle-group.tsx:22
⚠ Full Framer Motion import ×6
  react-doctor/use-lazy-motion
  components/Search/SearchDialog.tsx:8
  components/animate-ui/components/backgrounds/bubble.tsx:5
  components/animate-ui/components/backgrounds/gradient.tsx:5
  components/ui/lock-keyhole-open.tsx:6
  components/ui/lock-keyhole.tsx:6
  components/ui/lock.tsx:6
⚠ HTML injection sink with dynamic content ×2
  react-doctor/dangerous-html-sink
  components/Search/SearchDialog.tsx:110
  components/Search/SearchDialog.tsx:118
⚠ useEffect state synchronization flashes after paint
  react-doctor/rendering-hydration-no-flicker
  components/ThemeSwitcher.tsx:23
⚠ State initialized from a mount effect
  react-doctor/no-initialize-state
  components/ThemeSwitcher.tsx:24
⚠ Permanent will-change wastes GPU ×9
  react-doctor/no-permanent-will-change
  components/animate-ui/components/backgrounds/bubble.tsx:137
  components/animate-ui/components/backgrounds/bubble.tsx:149
  components/animate-ui/components/backgrounds/bubble.tsx:158
  components/animate-ui/components/backgrounds/bubble.tsx:167
  components/animate-ui/components/backgrounds/bubble.tsx:174
  components/animate-ui/components/backgrounds/bubble.tsx:186
  components/editor/plugins/draggable-block-plugin.tsx:58
  components/editor/plugins/draggable-block-plugin.tsx:66
  components/editor/plugins/floating-text-format-plugin.tsx:187
✖ R3F uniform prop source mutated after being copied ×2
  react-doctor/r3f-no-mutate-uniform-prop-source-in-use-frame
  components/background-paper-shaders.tsx:78
  components/background-paper-shaders.tsx:79
⚠ Non-component export in component file ×23
  react-doctor/only-export-components
  components/data-table.tsx:84
  components/editor/editor-ui/image-component.tsx:46
  components/editor/plugins/actions/speech-to-text-plugin.tsx:30
  components/editor/plugins/actions/speech-to-text-plugin.tsx:44
  components/editor/plugins/autocomplete-plugin.tsx:50
  components/editor/plugins/embeds/auto-embed-plugin.tsx:51
  components/editor/plugins/embeds/auto-embed-plugin.tsx:84
  components/editor/plugins/embeds/auto-embed-plugin.tsx:118
  components/editor/plugins/embeds/twitter-plugin.tsx:19
  components/editor/plugins/embeds/youtube-plugin.tsx:19
  components/editor/plugins/images-plugin.tsx:50
  components/editor/plugins/layout-plugin.tsx:75
  components/editor/plugins/layout-plugin.tsx:77
  components/editor/plugins/picker/table-picker-plugin.tsx:17
  components/editor/plugins/table-plugin.tsx:53
  components/editor/plugins/table-plugin.tsx:56
  components/ui/badge.tsx:30
  components/ui/button-group.tsx:76
  components/ui/button.tsx:52
  components/ui/navigation-menu.tsx:113
  components/ui/tabs.tsx:78
  components/ui/toggle.tsx:41
  components/ui/widget.tsx:67
⚠ preventDefault on a form or link ×2
  react-doctor/no-prevent-default
  components/data-table.tsx:180
  components/data-table.tsx:205
⚠ Click handler missing keyboard handler ×5
  react-doctor/click-events-have-key-events
  components/editor/GitCommitModal.tsx:156
  components/editor/GitCommitModal.tsx:162
  components/editor/GitCommitModal.tsx:168
  components/editor/plugins/images-plugin/MediaLibrary.tsx:308
  components/groups/GroupSheet.tsx:388
⚠ Handler on non-interactive element ×3
  react-doctor/no-noninteractive-element-interactions
  components/editor/GitCommitModal.tsx:156
  components/editor/GitCommitModal.tsx:162
  components/editor/GitCommitModal.tsx:168
⚠ Full lodash import
  react-doctor/no-full-lodash-import
  components/editor/editor-hooks/use-debounce.ts:3
✖ Ref mutated during render
  react-doctor/no-ref-current-in-render
  components/editor/editor-hooks/use-debounce.ts:7
⚠ next/no-img-element ×5
  next/no-img-element
  components/editor/editor-ui/image-component.tsx:90
  components/editor/plugins/images-plugin/MediaLibrary.tsx:267
  components/editor/plugins/images-plugin/MediaLibrary.tsx:337
  components/ui/cropped-avatar.tsx:27
  components/ui/cropped-avatar.tsx:61
⚠ Browser global read at module scope ×12
  react-doctor/no-unguarded-browser-global-at-module-scope
  components/editor/plugins/actions/speech-to-text-plugin.tsx:45
  components/editor/plugins/actions/speech-to-text-plugin.tsx:45
  components/editor/shared/environment.ts:15
  components/editor/shared/environment.ts:17
  components/editor/shared/environment.ts:20
  components/editor/shared/environment.ts:20
  components/editor/shared/environment.ts:22
  components/editor/shared/environment.ts:24
  components/editor/shared/environment.ts:24
  components/editor/shared/environment.ts:26
  components/editor/shared/environment.ts:30
  components/editor/shared/environment.ts:35
✖ Browser global read during server render ×3
  react-doctor/no-unguarded-browser-global-in-render-or-hook-init
  components/editor/plugins/actions/speech-to-text-plugin.tsx:53
  components/editor/plugins/actions/speech-to-text-plugin.tsx:53
  components/editor/plugins/code-action-menu-plugin.tsx:157
✖ Effect subscription or timer never cleaned up
  react-doctor/effect-needs-cleanup
  components/editor/plugins/actions/speech-to-text-plugin.tsx:57
⚠ Empty default prop breaks memo
  react-doctor/rerender-memo-with-default-value
  components/editor/plugins/component-picker-menu-plugin.tsx:33
⚠ Unescaped dynamic string in RegExp constructor ×3
  react-doctor/no-unescaped-dynamic-string-in-regexp
  components/editor/plugins/component-picker-menu-plugin.tsx:52
  components/editor/plugins/emoji-picker-plugin.tsx:94
  components/editor/plugins/emoji-picker-plugin.tsx:95
⚠ await inside a loop ×3
  react-doctor/async-await-in-loop
  components/editor/plugins/context-menu-plugin.tsx:78
  components/editor/plugins/drag-drop-paste-plugin.tsx:65
  lib/image-signed-url-cache.ts:39
⚠ Effect promise .then sets state with no catch
  react-doctor/no-promise-then-side-effect-in-effect-without-catch
  components/editor/plugins/emoji-picker-plugin.tsx:65
⚠ State only used in handlers ×4
  react-doctor/rerender-state-only-in-handlers
  components/editor/plugins/floating-link-editor-plugin.tsx:58
  components/editor/plugins/images-plugin/MediaLibrary.tsx:44
  components/editor/plugins/toolbar/code-language-toolbar-plugin.tsx:30
  components/users/dialogs/EditUserDialog.tsx:155
⚠ window.open without noopener
  react-doctor/window-open-without-noopener
  components/editor/plugins/floating-link-editor-plugin.tsx:351
⚠ Unsafe JSON.parse dereference
  react-doctor/no-unsafe-json-parse
  components/editor/plugins/images-plugin.tsx:343
⚠ Interaction on static element ×3
  react-doctor/no-static-element-interactions
  components/editor/plugins/images-plugin/MediaLibrary.tsx:308
  components/groups/GroupSheet.tsx:388
  components/ui/stacked-accordion.tsx:71
⚠ Object URL is created during render
  react-doctor/no-create-object-url-in-render
  components/editor/plugins/images-plugin/MediaLibrary.tsx:337
⚠ createObjectURL without revokeObjectURL
  react-doctor/no-create-object-url-without-revoke
  components/editor/plugins/images-plugin/MediaLibrary.tsx:337
✖ Missing key in list
  react-doctor/jsx-key
  components/editor/plugins/mentions-plugin.tsx:573
⚠ State initializer runs on every render
  react-doctor/rerender-lazy-state-init
  components/editor/plugins/toolbar/history-toolbar-plugin.tsx:18
⚠ Deprecated react-dom APIs break in React 19
  react-doctor/no-react-dom-deprecated-apis
  components/editor/shared/react-test-utils.ts:2
⚠ State adjusted after a prop changes ×19
  react-doctor/no-adjust-state-on-prop-change
  components/groups/GroupSheet.tsx:145
  components/groups/GroupSheet.tsx:146
  components/groups/GroupSheet.tsx:147
  components/groups/GroupSheet.tsx:148
  components/groups/GroupSheet.tsx:149
  components/groups/GroupSheet.tsx:150
  components/groups/GroupSheet.tsx:151
  components/groups/GroupSheet.tsx:152
  components/groups/GroupSheet.tsx:153
  components/groups/GroupSheet.tsx:160
  components/groups/GroupSheet.tsx:161
  components/groups/GroupSheet.tsx:162
  components/groups/GroupSheet.tsx:170
  components/ui/image-upload.tsx:79
  components/users/dialogs/EditUserDialog.tsx:202
  components/users/dialogs/EditUserDialog.tsx:218
  components/users/dialogs/EditUserDialog.tsx:220
  components/users/dialogs/ReinviteUserDialog.tsx:35
  components/users/dialogs/ReinviteUserDialog.tsx:36
⚠ Context value from an unmemoized local literal
  react-doctor/context-provider-value-from-unmemoized-local-literal
  components/providers/AuthProvider.tsx:188
⚠ Role used instead of HTML tag
  react-doctor/prefer-tag-over-role
  components/ui/breadcrumb.tsx:48
⚠ Effects chained together
  react-doctor/no-effect-chain
  components/ui/image-crop-dialog.tsx:79
⚠ Live state pushed to parent via effect
  react-doctor/no-pass-live-state-to-parent
  components/ui/image-crop-dialog.tsx:91
⚠ Parent kept in sync with a callback effect
  react-doctor/no-prop-callback-in-effect
  components/ui/image-crop-dialog.tsx:91
⚠ Control missing accessible label
  react-doctor/control-has-associated-label
  components/users/AvatarEditor.tsx:170
⚠ Duplicated JSX structure ×2
  react-doctor/duplicate-jsx-subtree
  components/users/dialogs/EditUserDialog.tsx:636
  components/users/dialogs/EditUserDialog.tsx:658
⚠ Effect updates its own dependency
  react-doctor/no-self-updating-effect
  lib/drafts/use-question-draft-autosave.ts:74
⚠ array.find() inside a loop
  react-doctor/js-index-maps
  lib/users/edit-user-form.ts:35
✖ react-doctor/require-reduced-motion
  react-doctor/require-reduced-motion
  package.json
```

## Итоги проверок

- `yarn workspace @bio-exam/web vitest run components/editor/utils/mdx-golden.test.ts`: 1 файл, 28 passed.
- `yarn e2e tests/editor-toolbar.spec.ts`: 14 passed (8 setup, 3 на chromium-desktop, 3 на chromium-mobile; 4 из них — ожидаемые падения `test.fail()`).
- `yarn verify`: `yarn verify: OK` (все шаги passed; в `lint-typecheck-test` web-тест `mdx-golden.test.ts` — 28 tests).
- `yarn e2e` (полный): 178 passed, failed нет.
- `oxfmt --check` по четырём файлам плана: формат верный.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-01`: `08-01 changed only its files`.

## Решения исполнителя (автономно)

- В набор тулбара включены элементы `radio`: Radix ToggleGroup рендерит кнопки подстрочного и надстрочного индекса, выравнивания и отступов с ролью `radio`. Без них ленивая загрузка могла бы потерять эти кнопки незаметно.
- У безымянных кнопок в скобках записан текст или класс иконки: иначе три `combobox` и четыре иконки неразличимы. Доступные имена при этом не меняются.
- Desktop и mobile дали одинаковые массивы, поэтому записан один литерал (план допускает два, если они различаются).
- Тексты образцов — на русском. `trace text` в образцы не добавлялся: он используется только в e2e.

## Deviations from Plan

- Задача 2: фактический вывод 13 образцов снят временным тестом `zz-capture.test.ts` вместо копирования из сообщений об ошибке. Путь конвертации тот же, файл удалён сразу после прогона, в дереве его нет. Задача 1 выполнена по плану, с копированием из диффа.
- Иных отклонений нет. Код приложения не менялся.

## Issues Encountered

- Сериализация таблицы не идемпотентна, кнопка речи показывает обратную подпись. Обе находки записаны в `deferred-items.md` фазы и не исправлялись.
- Спецификация тулбара находит контейнеры по классам `plugins.tsx` и `editor.tsx`. В `files_modified` плана 08-24 её нет: если 08-24 меняет эти обёртки, спецификацию надо добавить в его список (запись в `deferred-items.md`).

## Known Stubs

Нет.

## Deferred human verification

- Коммит файлов плана. Не выполнено, ждёт пользователя или ведущую сессию; исполнитель не одобрял. Файлы к коммиту (worktree `gsd/phase-08`):
  - `app/web/components/editor/utils/mdx-golden-cases.ts` (новый)
  - `app/web/components/editor/utils/mdx-golden.test.ts` (новый)
  - `e2e/fixtures/seed.json` (изменён)
  - `e2e/tests/editor-toolbar.spec.ts` (новый)
- Документы фазы лежат в общем `.planning` (вне git worktree): `08-REACT-DOCTOR.md`, `08-01-SUMMARY.md`, `deferred-items.md`.

## Next Phase Readiness

- 08-07: снять `test.fail()` с двух проверок `promptText` после устранения утечки автодополнения. Подтверждённая находка `code-action-menu-plugin.tsx:157`.
- 08-10: подтверждённые находки в `speech-to-text-plugin.tsx` и `use-debounce.ts`. Если меняется подпись кнопки речи, обновить `FULL_CONTROLS`.
- 08-24: золотые образцы и `FULL_CONTROLS` — проверка STOP плана 008.
- 08-25: итоговый прогон той же версией 0.9.17. Подтверждённые находки `MediaLibrary.tsx:337`.

## Self-Check: PASSED

- FOUND: все 4 файла worktree и 3 файла `.planning`.
- Коммиты не создавались по правилу пользователя; `HEAD` = `eae17fe` до и после плана.

---
*Phase: 08-client-requests-runtime-and-decomposition*
*Completed: 2026-10-05*
