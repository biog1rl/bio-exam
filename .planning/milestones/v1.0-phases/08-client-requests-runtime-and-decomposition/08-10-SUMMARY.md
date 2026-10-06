---
phase: 08-client-requests-runtime-and-decomposition
plan: 10
subsystem: web-editor-runtime
tags: [rt-02, lexical, debounce, toolbar, speech-recognition, vitest, fake-react, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-client-requests-runtime-and-decomposition
    provides: "08-01: e2e editor-toolbar.spec.ts (FULL_CONTROLS), разметка React Doctor; 08-07: SSR-тест редактора, находки аудита для RT-02"
provides:
  - "createDebounced(fn, ms, { maxWait, timers }) — порт lodash debounce (trailing, maxWait, cancel, flush) со швом таймеров"
  - "useDebounce: колбэк в ref через изоморфный layout-эффект (useLatestRef), useMemo по [ms, maxWait], cancel() при размонтировании и при смене функции"
  - "subscribeToolbar(editor, handler): одна подписка SELECTION_CHANGE_COMMAND и одно начальное чтение; useUpdateToolbarHandler подписывается только по activeEditor"
  - "ToolbarPlugin: $updateToolbar на уровне модуля, эффект с [activeEditor]"
  - "createSpeechSession({ create, onText, onStop }) с dispose(): abort, снятие result/end/error, ссылка в null; плагин речи создаёт сессию на каждое включение"
  - "app/web/test-support/fake-react.ts: записывающая подмена хуков React для тестов проводки без DOM"
  - "e2e: состояние кнопки Bold следует выделению"
affects: [08-24, 08-25, 08-28]

actuals:
  tokens: 14100
  tasks: 3
  commits: 0
plan_head_before: 944b88abff9fd8200587c3416fa6bec7df0d84f1
plan_head_after: 944b88abff9fd8200587c3416fa6bec7df0d84f1

tech-stack:
  added: []
  patterns:
    - "Проводка хуков без DOM: vi.mock('react', async (o) => (await import('@/test-support/fake-react')).mockReact(await o())), createHarness().render/renderPhase/commit/unmount/strictRemount; эффекты помечаются layout/passive"
    - "Последний колбэк в ref: useLatestRef(value) пишет ref в useLayoutEffect (на сервере useEffect), без записи при рендере"
    - "Ресурс браузера в эффекте: объект-сессия с dispose() + флаг active в замыкании эффекта; новая сессия на каждое включение"
    - "Поддержка API браузера в рендере: useSyncExternalStore(подписка-пустышка, проверка window, () => false) — сервер и гидрация рисуют null"

key-files:
  created:
    - app/web/components/editor/editor-hooks/debounced.ts
    - app/web/components/editor/editor-hooks/debounced.test.ts
    - app/web/components/editor/editor-hooks/use-debounce.test.ts
    - app/web/components/editor/editor-hooks/toolbar-subscription.ts
    - app/web/components/editor/editor-hooks/toolbar-subscription.test.ts
    - app/web/components/editor/plugins/actions/speech-session.ts
    - app/web/components/editor/plugins/actions/speech-session.test.ts
    - app/web/test-support/fake-react.ts
  modified:
    - app/web/components/editor/editor-hooks/use-debounce.ts
    - app/web/components/editor/editor-hooks/use-update-toolbar.ts
    - app/web/components/editor/plugins/toolbar/toolbar-plugin.tsx
    - app/web/components/editor/plugins/actions/speech-to-text-plugin.tsx
    - e2e/tests/editor-toolbar.spec.ts

key-decisions:
  - "useDebounce без maxWait передаёт maxWait = ms: прежний вызов lodash всегда передавал { maxWait }, и lodash при 'maxWait' in options с undefined ставит потолок, равный wait. Поведение code-button.tsx сохранено (решение исполнителя, автономно)"
  - "createDebounced — порт алгоритма lodash debounce (без leading); flush снимает таймер сразу (lodash оставляет висящий таймер без видимого эффекта). Паритет проверен скриптом: 3000 случайных последовательностей call/cancel/flush, 0 расхождений"
  - "onStop сессии речи (события end и error) возвращает кнопку в выключенное состояние; раньше кнопка оставалась «включённой» после самопроизвольного конца распознавания (решение исполнителя, автономно)"
  - "Выключение — dispose() (abort), повторное включение — новый SpeechRecognition: повторный start() того же объекта до end даёт InvalidStateError"
  - "Поддержка распознавания проверяется в рендере через useSyncExternalStore с серверным снимком false вместо модульной SUPPORT_SPEECH_RECOGNITION (закрывает находку :45); экспорт SUPPORT_SPEECH_RECOGNITION удалён, импортов не было"
  - "Подписи кнопки речи не менялись (08-UI-SPEC, Поверхность 7): FULL_CONTROLS прежний, перевёрнутая подпись остаётся в deferred-items"
  - "Тесты тулбара подменяют $getSelection через vi.mock('lexical') и используют поддельный редактор; настоящий createEditor в этом файле не смешивается"
  - "Сессия живёт в замыкании эффекта; отдельный useRef для распознавателя не нужен, ссылка на SpeechRecognition обнуляется внутри dispose()"
  - "use-report.ts (находка 08-07) не менялся: файла нет в files_modified, записан в deferred-items"

requirements-completed: [RT-02]

duration: 17min
completed: 2026-10-05
---

# Phase 08 Plan 10: RT-02 — debounce, подписка тулбара, распознавание речи Summary

**useDebounce пишет колбэк в ref в изоморфном layout-эффекте и отменяет вызов при размонтировании (createDebounced — порт lodash со швом таймеров). Тулбар подписывается на SELECTION_CHANGE один раз на активный редактор. Распознавание речи при выключении и размонтировании делает abort и снимает слушатели result/end/error. Всё доказано тестами без DOM через записывающую подмену react.**

## Performance

- Duration: около 17 мин
- Started: 2026-10-05T07:41:52Z
- Completed: 2026-10-05T07:58:55Z
- Tasks: 3
- Files: 13 (8 новых, 5 изменённых)

## Accomplishments

- `debounced.ts`: `createDebounced` с `cancel` и `flush`, шов `DebounceTimers` (`setTimer`, `clearTimer`, `now`) по образцу `keep-alive.ts`.
- `use-debounce.ts`: `useLatestRef` (ref пишется в `useLayoutEffect`, на сервере в `useEffect`), `useMemo` над `createDebounced`, `useEffect(() => () => debounced.cancel(), [debounced])`. Возвращаемая функция сохраняет `cancel` и `flush`. Вызывающие (`code-action-menu-plugin.tsx`, `editor-ui/code-button.tsx`) не менялись.
- `toolbar-subscription.ts` + `use-update-toolbar.ts`: `useEffect(() => subscribeToolbar(activeEditor, () => callbackRef.current), [activeEditor, callbackRef])`. 11 потребителей в `plugins/toolbar/*` не менялись.
- `toolbar-plugin.tsx`: `$updateToolbar` вынесен на уровень модуля, зависимости эффекта `[activeEditor]`. Значение `ToolbarContext` уже было в `useMemo`, теперь оно стабильно, потому что стабилен `$updateToolbar`. Попутно прекратилась переподписка `history-toolbar-plugin.tsx`: его эффект зависит от `[$updateToolbar, activeEditor, editor]`.
- `speech-session.ts`: `createSpeechSession` (start ставит result/end/error, dispose: abort + снятие + null, повторный dispose безопасен, события после dispose игнорируются), `speechRecognitionSupported()`, `createBrowserSpeechRecognition()` (continuous и interimResults = true).
- `speech-to-text-plugin.tsx`: `SpeechToTextPlugin` проверяет поддержку через `useSyncExternalStore` и рисует `SpeechToTextControl`. Эффект создаёт сессию при `isEnabled`, а в очистке ставит `active = false` и вызывает `dispose()`. Логика голосовых команд вынесена в `insertTranscript` без изменений.
- `e2e/tests/editor-toolbar.spec.ts`: тест «состояние кнопки форматирования следует выделению». Сценарий: набрать `обычный жирный`, выделить второе слово, нажать Bold и проверить `aria-pressed`: при клике в обычное слово `false`, в жирное `true`, снова в обычное `false`. `FULL_CONTROLS` не менялся.

## Закрытые находки React Doctor и аудита 08-07

| Источник | Место (до) | Что было | Как закрыто | Тест |
| --- | --- | --- | --- | --- |
| React Doctor `no-unguarded-browser-global-at-module-scope` ×2 | `speech-to-text-plugin.tsx:45` | `SUPPORT_SPEECH_RECOGNITION` на уровне модуля решал экспорт | `useSyncExternalStore(..., speechRecognitionSupported, () => false)` | `speech-session.test.ts`: «плагин без поддержки…», `editor.ssr.test.ts` |
| React Doctor `no-unguarded-browser-global-in-render-or-hook-init` ×2, аудит 08-07 | `speech-to-text-plugin.tsx:53` | конструктор `SpeechRecognition` в теле компонента на каждом рендере | выбор конструктора в `speech-session.ts`, вызывается только из эффекта при включении | «плагин: включение создаёт сессию…» |
| React Doctor `effect-needs-cleanup` | `speech-to-text-plugin.tsx:57` | очистка только `stop()`, слушатель result не снимался, ref не обнулялся | `dispose()`: abort, снятие result/end/error, ссылка в null; флаг `active` | «dispose вызывает abort…», «событие result после dispose…», «плагин: размонтирование…» |
| React Doctor `no-ref-current-in-render` | `use-debounce.ts:7` | `funcRef.current = fn` при рендере, нет отмены при размонтировании | `useLatestRef` + `cancel()` в очистке | `use-debounce.test.ts` (все 7) |
| CONTEXT D-16 (без диагностики инструмента) | `use-update-toolbar.ts:10-31` | `[activeEditor, callback]` — переподписка на каждый рендер | колбэк в ref, `[activeEditor]` | «useUpdateToolbarHandler: три рендера…», «смена activeEditor…», «StrictMode…» |
| CONTEXT D-16 (без диагностики инструмента) | `toolbar-plugin.tsx:19`, `:30` | `$updateToolbar` новый на каждый рендер, `[editor, activeEditor]` | функция модуля, `[activeEditor]` | «ToolbarPlugin: $updateToolbar стабилен…», «ToolbarContext: …тот же объект» |
| Аудит 08-07 | `use-report.ts:34-35` | `cleanup` создаёт и сразу удаляет `#report-container` | не закрыто: файла нет в плане; записано в `deferred-items.md` | — |

Повторный прогон `npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline` из корня worktree дал 4 ошибки и 216 предупреждений против 9 ошибок в базе 08-01. Ошибок в файлах плана нет. В `speech-to-text-plugin.tsx` осталось одно предупреждение `only-export-components` на `:31` (экспорт `SPEECH_TO_TEXT_COMMAND`); в базе 08-01 оно было на `:30` и вне охвата. Лог прогона: `scratchpad/08-10-react-doctor.log`.

## codegraph

`codegraph impact` (индекс основного дерева):

- `useDebounce`: два определения. `editor-hooks/use-debounce.ts:5` и `hooks/useDebounce.ts:9` (хук значения, другая сигнатура, не менялся). Codegraph приписал `CodeActionMenuContainer`, `CodeActionMenuPlugin` и `CopyButton` второму определению, но по импортам они вызывают редакторный `use-debounce.ts`. API для них сохранён.
- `useUpdateToolbarHandler`: 25 символов. Это 11 плагинов тулбара (`font-family`, `font-size`, `subsuper`, `font-format`, `block-format` (`BlockFormatDropDown`), `font-background`, `link`, `code-language`, `line-height`, `element-format`, `font-color`) и `plugins.tsx` (`Plugins`). Сигнатура не менялась.
- `SpeechToTextPlugin`: 2 символа, это константа и `plugins.tsx`. Теперь это функция-компонент, `<SpeechToTextPlugin />` в `plugins.tsx` не менялся.

`codegraph affected` по изменённым файлам (`use-debounce.ts`, `use-update-toolbar.ts`, `speech-to-text-plugin.tsx`, `toolbar-plugin.tsx`, `toolbar-context.tsx`): 1 файл, `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx`. Это исходник с пометкой «(test file)» по слову `tests` в пути, а не тест. Новые модули в индексе ещё не появились.

## TDD

- Задача 1 (RED): `debounced.test.ts` и `use-debounce.test.ts` запущены на старом `use-debounce.ts` (lodash). Модуль `./debounced` не найден, 5 из 7 тестов проводки красные: ref пишется при рендере, нет отмены при размонтировании и в StrictMode. Лог: `scratchpad/08-10-red-task1.log`. GREEN: 16 из 16.
- Tracer gate задачи 1 пройден: оба `<automated>` зелёные (vitest editor-hooks — 16 passed; проверка «fake-react only in tests»), typecheck чистый.
- Задача 2 (RED): сначала оба файла тестов падали на отсутствующих модулях. Потом созданы чистые `toolbar-subscription.ts` и `speech-session.ts`, а хуки ещё оставались старыми. На этом этапе красных было 5: «useUpdateToolbarHandler: три рендера…», «ToolbarPlugin: $updateToolbar стабилен…» и три теста плагина речи. Лог: `scratchpad/08-10-red-task2.log`. GREEN: `vitest run components/editor` — 6 файлов, 67 тестов passed.
- Коммиты RED/GREEN не выполнялись (правило пользователя).

## Проверки

- `yarn workspace @bio-exam/web vitest run components/editor`: 6 файлов, 67 passed. Сюда входят золотые MDX-образцы 08-01 и `editor.ssr.test.ts` 08-07.
- `yarn workspace @bio-exam/web typecheck`: без ошибок. `yarn workspace @bio-exam/web lint`: в файлах плана предупреждений нет.
- Проверка расположения подмены: `fake-react only in tests`, exit 0.
- `yarn oxfmt --check .`: All matched files use the correct format.
- `yarn verify`: `yarn verify: OK`. Шаги: lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests. Web: 62 файла, 1165 тестов passed.
- `yarn e2e tests/editor-toolbar.spec.ts`: 16 passed (новый тест на chromium-desktop и chromium-mobile).
- `yarn e2e`: 186 passed (1.5m), упавших нет.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-10`: `08-10 changed only its files`.

## Deviations from Plan

1. [Rule 1 - Bug] Первая версия e2e ставила каретку клавишами Home и End. После End в конце жирного слова `aria-pressed` оставался `false` на обоих проектах, при этом Home → `false` проходил. Сценарий переведён на клики по обычному и жирному слову: `editor.getByText(PLAIN_WORD)` и `strong`. Как Lexical определяет формат каретки на правой границе жирного узла в конце абзаца, не исследовалось. Этот вопрос не относится к подписке.
2. `toolbar-context.tsx` (необязательный в плане) не менялся: значение провайдера уже в `useMemo`.
3. Тесты проводки `useUpdateToolbarHandler`, `ToolbarPlugin`, `ToolbarContext` и плагина речи лежат в `toolbar-subscription.test.ts` и `speech-session.test.ts`. Это нужно, чтобы не выходить за `files_modified`.

## Threat surface

T-8-22 закрыт: `dispose()` плюс флаг `active`. Тесты проверяют, что после размонтирования события result, error и end не вызывают `report`, `editor.update` и смену состояния (`stateUpdatesAfterUnmount = 0`). T-8-23 закрыт: тесты считают вызовы `registerCommand`. Новых сетевых точек, путей доступа и схем нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Распознавание речи в браузере с микрофоном (Chrome). Шаги: открыть вопрос в редакторе, нажать кнопку микрофона, сказать фразу и убедиться, что текст вставился. Затем выключить кнопку: дальнейшая речь в редактор не приходит. Включить снова и уйти со страницы: индикатор микрофона во вкладке гаснет, ввод не приходит. Проверка сводная, в 08-28.
2. Коммит файлов плана делает ведущая сессия. Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Передачи следующим планам

- 08-24 (ленивые группы):
  - `SpeechToTextPlugin` теперь функция-компонент. На сервере и при гидрации он рисует `null`, кнопка появляется после гидрации. Если плагин уходит в `next/dynamic`, проверка поддержки остаётся внутри него.
  - Экспорта `SUPPORT_SPEECH_RECOGNITION` больше нет.
  - Новый e2e-тест ищет кнопку `Bold` в `div.sticky` по `aria-pressed`. Если 08-24 меняет обёртки тулбара, этот тест обновляется вместе с `FULL_CONTROLS`.
- 08-24, 08-25 и любые тесты хуков: `app/web/test-support/fake-react.ts` поддерживает `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useState`, `useContext` (значение по умолчанию контекста) и `useSyncExternalStore` (клиентский снимок). Подключение: `vi.mock('react', async (o) => (await import('@/test-support/fake-react')).mockReact(await o()))`. Импортировать подмену можно только из `*.test.ts`. После `vi.resetModules()` используйте статически импортированный `createHarness`: результат фабрики мока кешируется.
- `use-debounce.ts` экспортирует `useLatestRef`, его использует и `use-update-toolbar.ts`.
- `deferred-items.md`: перевёрнутая подпись кнопки речи остаётся (08-01), `use-report.ts` добавлен (08-10).
- 08-28: сводная ручная проверка микрофона (раздел выше).

## Файлы к коммиту

```
 M app/web/components/editor/editor-hooks/use-debounce.ts
 M app/web/components/editor/editor-hooks/use-update-toolbar.ts
 M app/web/components/editor/plugins/actions/speech-to-text-plugin.tsx
 M app/web/components/editor/plugins/toolbar/toolbar-plugin.tsx
 M e2e/tests/editor-toolbar.spec.ts
?? app/web/components/editor/editor-hooks/debounced.test.ts
?? app/web/components/editor/editor-hooks/debounced.ts
?? app/web/components/editor/editor-hooks/toolbar-subscription.test.ts
?? app/web/components/editor/editor-hooks/toolbar-subscription.ts
?? app/web/components/editor/editor-hooks/use-debounce.test.ts
?? app/web/components/editor/plugins/actions/speech-session.test.ts
?? app/web/components/editor/plugins/actions/speech-session.ts
?? app/web/test-support/fake-react.ts
```

Вне git (общий `.planning`): этот SUMMARY и строка 08-10 в `deferred-items.md`.

## Self-Check: PASSED

Все 8 новых файлов на месте, HEAD worktree 944b88a (коммитов нет по правилу пользователя), комментариев в новых и изменённых файлах нет (лицензионная шапка вендора в speech-to-text-plugin.tsx сохранена как была).

## Дополнение после плана (2026-10-05)

По решению пользователя своя реализация `createDebounced` (`editor-hooks/debounced.ts` и её тест) удалена. `useDebounce` строится на `lodash/debounce` (импорт одной функции, а не всего `lodash`), `maxWait: maxWait ?? ms`, запись ref в изоморфном layout-эффекте и `cancel()` при размонтировании и смене функции сохранены. Тест хука `use-debounce.test.ts` работает на фейковых таймерах Vitest без изменений, все 7 проверок зелёные.
