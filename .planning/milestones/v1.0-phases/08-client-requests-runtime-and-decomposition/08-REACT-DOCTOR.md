# Фаза 8: React Doctor (RT-04, D-19)

## Версия и команда

- Версия: `react-doctor@0.9.17` (`npm view react-doctor version` на 2026-10-05).
- Команда (из корня репозитория, требование RT-04 с закреплённой версией вместо `latest`):

```
npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline
```

- Пакет запускается через `npx`, в `package.json` и `yarn.lock` не добавляется. Предложение инструмента `npx react-doctor install --yes` не выполняется.
- Код выхода при наличии диагностик уровня error: 1.

## Базовый прогон (до правок фазы)

- Дата: 2026-10-05T05:38Z, ветка `gsd/phase-08`, коммит `eae17fe`, план 08-01.
- Просканировано 500 файлов. Score 46 / 100 (Critical).
- 229 диагностик: Performance 50 warnings; Bugs 8 errors, 93 warnings; Maintainability 43 warnings; Accessibility 1 error, 31 warnings; Security 3 warnings.
- Пометка «(test file)» у файлов `app/(internal)/(protected)/admin/tests/**` и `components/tests/**` ставится инструментом по слову `tests` в пути; это исходники приложения, не тесты.

### Диагностики уровня error (9)

| Правило | Файл | Вердикт | Обоснование | План-исполнитель |
| --- | --- | --- | --- | --- |
| `react-doctor/no-unguarded-browser-global-in-render-or-hook-init` | `components/editor/plugins/code-action-menu-plugin.tsx:157` | подтверждено | Значение по умолчанию `anchorElem = document.body` вычисляется при рендере; на сервере `document` нет (план 007, «глобалы браузера при рендере») | 08-07 |
| `react-doctor/no-unguarded-browser-global-in-render-or-hook-init` ×2 | `components/editor/plugins/actions/speech-to-text-plugin.tsx:53` | подтверждено | `window.SpeechRecognition` читается в теле компонента при каждом рендере | 08-10 |
| `react-doctor/effect-needs-cleanup` | `components/editor/plugins/actions/speech-to-text-plugin.tsx:57` | подтверждено | Очистка эффекта вызывает только `stop()`: обработчики `result` не снимаются, `abort()` нет, ref не обнуляется (план 007, «неполная очистка»; D-16) | 08-10 |
| `react-doctor/no-ref-current-in-render` | `components/editor/editor-hooks/use-debounce.ts:7` | подтверждено | `funcRef.current = fn` присваивается при рендере; отмены при размонтировании нет (план 007, «изменение ref при рендере») | 08-10 |
| `react-doctor/jsx-key` | `components/editor/plugins/mentions-plugin.tsx:573` | ложное срабатывание | `plans/README.md`, «Findings considered and rejected»: JSX-иконка передаётся аргументом конструктора `MentionTypeaheadOption`, `map` строит объекты классов, а не дочерние элементы списка | - |
| `react-doctor/r3f-no-mutate-uniform-prop-source-in-use-frame` ×2 | `components/background-paper-shaders.tsx:78`, `:79` | вне охвата | Модуль `ShaderPlane` не импортируется ни одним файлом `app/web`, в сборку страниц не попадает; фаза его не меняет | - |
| `react-doctor/require-reduced-motion` | `package.json` (`app/web`) | вне охвата | Правило требует общего механизма reduced-motion на всё приложение; глобального правила нет по D-18 («Подтверждено пользователем» п. 5). Reduced-motion добавляется точечно на затронутые элементы | 08-25 (точечно по D-18) |

### Диагностики категорий плана 007 уровня warning в коде редактора и защищённых экранах

| Правило | Файл | Вердикт | Обоснование | План-исполнитель |
| --- | --- | --- | --- | --- |
| `react-doctor/no-unguarded-browser-global-at-module-scope` ×2 | `components/editor/plugins/actions/speech-to-text-plugin.tsx:45` | подтверждено | `SUPPORT_SPEECH_RECOGNITION` вычисляется на уровне модуля, и от него зависит экспорт `SpeechToTextPlugin`: на сервере рендерится `() => null`, в браузере с поддержкой речи рендерится кнопка | 08-10 |
| `react-doctor/no-unguarded-browser-global-at-module-scope` ×10 | `components/editor/shared/environment.ts:15-35` | вне охвата | Каждое чтение защищено `CAN_USE_DOM`; модуль не импортируется ни одним файлом `app/web` | - |
| `react-doctor/no-create-object-url-in-render` | `components/editor/plugins/images-plugin/MediaLibrary.tsx:337` | подтверждено | `URL.createObjectURL(selectedFile)` вызывается в JSX при каждом рендере превью | 08-25 |
| `react-doctor/no-create-object-url-without-revoke` | `components/editor/plugins/images-plugin/MediaLibrary.tsx:337` | подтверждено | Созданные blob-URL не освобождаются `revokeObjectURL` ни при смене файла, ни при закрытии (неполная очистка ресурса) | 08-25 |
| `react-doctor/dangerous-html-sink` ×2 | `components/Search/SearchDialog.tsx:110`, `:118` | ложное срабатывание | `plans/README.md`, «Findings considered and rejected»: подсветчики на клиенте и сервере экранируют исходный текст до вставки управляемых тегов `<mark>` | - |

Повторные подписки тулбара (план 007, D-16: `toolbar-plugin.tsx`, `use-update-toolbar.ts`) и `window.TextEncoder` в `counter-character-plugin.tsx` версия 0.9.17 не диагностирует. Они закрываются по CONTEXT планами 08-10 и 08-07 без диагностики инструмента.

### Остальные диагностики

Все остальные диагностики имеют уровень warning и не относятся к категориям плана 007 (глобалы браузера при рендере, изменение ref при рендере, повторные подписки, неполная очистка). Вердикт по каждой группе: вне охвата RT-04. Миграцию запросов (`no-fetch-response-used-without-status-check`, `no-fetch-in-effect`) ведут планы HTTP-02, это не RT-04.

| Правило | Число | Вердикт | Обоснование |
| --- | --- | --- | --- |
| `react-doctor/js-hoist-intl` | 2 | вне охвата | Производительность форматтера, не категория плана 007 |
| `react-doctor/no-locale-format-in-render` | 8 | вне охвата | Форматирование даты на клиенте, не категория плана 007 |
| `react-doctor/no-fetch-response-used-without-status-check` | 10 | вне охвата | Слой запросов ведут планы HTTP-02 (08-13 … 08-23) |
| `react-doctor/no-high-complexity-react-function` | 9 | вне охвата | Сложность функции, не дефект |
| `react-doctor/js-set-map-lookups` | 6 | вне охвата | Микрооптимизация |
| `react-doctor/no-giant-component` | 8 | вне охвата | Размер компонента, не дефект |
| `react-doctor/no-fetch-in-effect` | 5 | вне охвата | Слой запросов ведут планы HTTP-02 |
| `react-doctor/shadcn-icon-button-requires-label` | 18 | вне охвата | Доступность иконок-кнопок, не категория плана 007 |
| `react-doctor/no-array-index-as-key` | 6 | вне охвата | Статические списки, не категория плана 007 |
| `react-doctor/server-sequential-independent-await` | 2 | вне охвата | Производительность серверной страницы |
| `react-doctor/prefer-dynamic-import` | 4 | вне охвата | Ленивую загрузку редактора ведёт PERF-03 (08-24) по своему анализу бандла |
| `eslint/no-unused-vars` | 7 | вне охвата | Предупреждения линтера в `DashboardClient.tsx` |
| `react-doctor/no-transition-all` | 5 | вне охвата | Стиль анимации; reduced-motion решает D-18 |
| `react-doctor/no-set-state-after-await-in-effect` | 1 | вне охвата | `InviteClient.tsx`, не редактор и не категория плана 007 |
| `react-doctor/no-loading-flag-reset-outside-finally` | 2 | вне охвата | Обработка ошибок флага загрузки |
| `react-doctor/nextjs-no-client-side-redirect` | 3 | вне охвата | Редиректы входа (фаза 4) |
| `react-doctor/jsx-no-constructed-context-values` | 4 | вне охвата | Лишние перерисовки, не дефект |
| `react-doctor/use-lazy-motion` | 6 | вне охвата | Размер бандла Framer Motion |
| `react-doctor/rendering-hydration-no-flicker` | 1 | вне охвата | `ThemeSwitcher.tsx`, не редактор |
| `react-doctor/no-initialize-state` | 1 | вне охвата | `ThemeSwitcher.tsx`, не редактор |
| `react-doctor/no-permanent-will-change` | 9 | вне охвата | Стиль CSS |
| `react-doctor/only-export-components` | 23 | вне охвата | Fast refresh в разработке |
| `react-doctor/no-prevent-default` | 2 | вне охвата | `data-table.tsx`, поведение форм |
| `react-doctor/click-events-have-key-events` | 5 | вне охвата | Доступность клавиатуры |
| `react-doctor/no-noninteractive-element-interactions` | 3 | вне охвата | Доступность клавиатуры |
| `react-doctor/no-full-lodash-import` | 1 | вне охвата | `use-debounce.ts`: размер бандла; сам файл меняет 08-10 по другой находке |
| `next/no-img-element` | 5 | вне охвата | Превью и аватары с blob- и подписанными URL |
| `react-doctor/rerender-memo-with-default-value` | 1 | вне охвата | Лишние перерисовки |
| `react-doctor/no-unescaped-dynamic-string-in-regexp` | 3 | вне охвата | Строка запроса пикера, не категория плана 007 |
| `react-doctor/async-await-in-loop` | 3 | вне охвата | Последовательная загрузка файлов намеренная |
| `react-doctor/no-promise-then-side-effect-in-effect-without-catch` | 1 | вне охвата | `emoji-picker-plugin.tsx:65`: эффект с флагом `mounted` и очисткой; нет `catch` у динамического импорта |
| `react-doctor/rerender-state-only-in-handlers` | 4 | вне охвата | Лишние перерисовки |
| `react-doctor/window-open-without-noopener` | 1 | вне охвата | `floating-link-editor-plugin.tsx:351`, не категория плана 007 |
| `react-doctor/no-unsafe-json-parse` | 1 | вне охвата | `images-plugin.tsx:343`, разбор данных перетаскивания |
| `react-doctor/no-static-element-interactions` | 3 | вне охвата | Доступность клавиатуры |
| `react-doctor/rerender-lazy-state-init` | 1 | вне охвата | Лишняя работа при рендере |
| `react-doctor/no-react-dom-deprecated-apis` | 1 | вне охвата | `shared/react-test-utils.ts` не импортируется приложением |
| `react-doctor/no-adjust-state-on-prop-change` | 19 | вне охвата | Формы групп и пользователей |
| `react-doctor/context-provider-value-from-unmemoized-local-literal` | 1 | вне охвата | `AuthProvider.tsx`, лишние перерисовки |
| `react-doctor/prefer-tag-over-role` | 1 | вне охвата | Разметка breadcrumb |
| `react-doctor/no-effect-chain` | 1 | вне охвата | `image-crop-dialog.tsx` |
| `react-doctor/no-pass-live-state-to-parent` | 1 | вне охвата | `image-crop-dialog.tsx` |
| `react-doctor/no-prop-callback-in-effect` | 1 | вне охвата | `image-crop-dialog.tsx` |
| `react-doctor/control-has-associated-label` | 1 | вне охвата | `AvatarEditor.tsx`, доступность |
| `react-doctor/duplicate-jsx-subtree` | 2 | вне охвата | Дублирование разметки |
| `react-doctor/no-self-updating-effect` | 1 | вне охвата | `use-question-draft-autosave.ts:74`: эффект защищён проверкой `created?.key === key`, цикла нет |
| `react-doctor/js-index-maps` | 1 | вне охвата | Микрооптимизация |

### Итог базового прогона

- Сверка: 9 error + 16 warning категорий плана 007 + 204 остальных = 229.
- Подтверждено: 9 диагностик в 6 местах. 08-07: `code-action-menu-plugin.tsx:157`. 08-10: `speech-to-text-plugin.tsx:45`, `:53`, `:57`, `use-debounce.ts:7`. 08-25: `MediaLibrary.tsx:337` (два правила).
- Ложные срабатывания: `mentions-plugin.tsx:573` (`jsx-key`), `SearchDialog.tsx:110`, `:118` (`dangerous-html-sink`).
- Вне охвата: остальные. `require-reduced-motion` закрывается точечно по D-18 в 08-25.

## Итоговый прогон

- Дата: 2026-10-05T12:11Z, ветка `gsd/phase-08`, коммит `63bed54` и рабочее дерево плана 08-25 (итоговый код web-планов фазы 08-04…08-25).
- Команда та же, версия та же: `npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline`. Код выхода 1: остались диагностики уровня error, у каждой вердикт ниже. RT-04 требует ноль подтверждённых, а не код 0.
- Просканирован 551 файл. Score 54 / 100 (Critical; в базовом прогоне 46).
- 204 диагностики: Performance 48 warnings; Bugs 3 errors, 82 warnings; Maintainability 42 warnings; Accessibility 1 error, 25 warnings; Security 3 warnings.

### Подтверждённые находки базового прогона: итоговый статус

| Место | Правило | План | Итоговый прогон |
| --- | --- | --- | --- |
| `code-action-menu-plugin.tsx:157` | `no-unguarded-browser-global-in-render-or-hook-init` | 08-07 | нет диагностики |
| `speech-to-text-plugin.tsx:53` ×2 | `no-unguarded-browser-global-in-render-or-hook-init` | 08-10 | нет диагностики |
| `speech-to-text-plugin.tsx:57` | `effect-needs-cleanup` | 08-10 | нет диагностики |
| `speech-to-text-plugin.tsx:45` ×2 | `no-unguarded-browser-global-at-module-scope` | 08-10 | нет диагностики |
| `use-debounce.ts:7` | `no-ref-current-in-render` | 08-10 | нет диагностики |
| `MediaLibrary.tsx:337` (перед правкой 08-25 — `:329`) | `no-create-object-url-in-render`, `no-create-object-url-without-revoke` | 08-25 | нет диагностики: ссылка превью создаётся в эффекте хука `hooks/use-object-url.ts` и освобождается `URL.revokeObjectURL` при смене файла, сбросе и размонтировании (тест `hooks/use-object-url.test.ts`) |

### Диагностики уровня error (4)

| Правило | Файл | Вердикт | Обоснование |
| --- | --- | --- | --- |
| `react-doctor/jsx-key` | `components/editor/plugins/mentions-plugin.tsx:573` | ложное срабатывание | Как в базовом прогоне: JSX-иконка — аргумент конструктора `MentionTypeaheadOption`, `map` строит объекты классов, а не дочерние элементы списка (`plans/README.md`, «Findings considered and rejected») |
| `react-doctor/r3f-no-mutate-uniform-prop-source-in-use-frame` ×2 | `components/background-paper-shaders.tsx:78`, `:79` | вне охвата | Модуль не импортируется ни одним файлом `app/web` (проверено `rg` по итоговому дереву), фаза его не меняла |
| `react-doctor/require-reduced-motion` | `package.json` (`app/web`) | вне охвата (D-18) | Правило требует общий механизм на всё приложение; глобального правила нет по D-18 (п. 5). Точечно: помощник `lib/utils/reduced-motion.ts` (`prefersReducedMotion`, запрос `(prefers-reduced-motion: reduce)`) в `SearchDialog` и классы `motion-reduce:*` на затронутых элементах; блок `@media (prefers-reduced-motion:reduce)` есть в собранном CSS. Версия 0.9.17 такой механизм не распознаёт |

### Категории плана 007 уровня warning

| Правило | Файл | Вердикт | Обоснование |
| --- | --- | --- | --- |
| `react-doctor/no-unguarded-browser-global-at-module-scope` ×10 | `components/editor/shared/environment.ts:15-35` | вне охвата | Как в базовом прогоне: каждое чтение защищено `CAN_USE_DOM`, модуль не импортируется ни одним файлом `app/web` |
| `react-doctor/dangerous-html-sink` ×2 | `components/Search/SearchDialog.tsx:113`, `:121` | ложное срабатывание | Строки сдвинулись (было `:110`, `:118`); подсветчики на клиенте и сервере экранируют исходный текст до вставки тегов `<mark>` (`plans/README.md`, «Findings considered and rejected») |

### Изменение числа диагностик относительно базового прогона

| Правило | Было | Стало | Вердикт | Обоснование |
| --- | --- | --- | --- | --- |
| `react-doctor/no-unguarded-browser-global-in-render-or-hook-init` | 3 | 0 | исправлено | 08-07, 08-10 |
| `react-doctor/no-unguarded-browser-global-at-module-scope` | 12 | 10 | исправлено | 08-10 (`speech-to-text-plugin.tsx:45`); 10 мест `environment.ts` — вне охвата |
| `react-doctor/effect-needs-cleanup` | 1 | 0 | исправлено | 08-10 |
| `react-doctor/no-ref-current-in-render` | 1 | 0 | исправлено | 08-10 |
| `react-doctor/no-create-object-url-in-render` | 1 | 0 | исправлено | 08-25 |
| `react-doctor/no-create-object-url-without-revoke` | 1 | 0 | исправлено | 08-25 |
| `react-doctor/no-fetch-response-used-without-status-check` | 10 | 0 | исправлено | Перевод на модуль запросов (08-13…08-23) |
| `react-doctor/no-fetch-in-effect` | 5 | 1 | вне охвата | Осталось `InviteClient.tsx:22`: проверка приглашения голым `fetch` по исключению D-07, не категория плана 007 |
| `react-doctor/no-full-lodash-import` | 1 | 0 | исправлено | `use-debounce.ts` импортирует только `lodash/debounce` |
| `react-doctor/no-promise-then-side-effect-in-effect-without-catch` | 1 | 0 | исправлено | `emoji-picker-plugin.tsx` получает таблицу через `loadEmojiTable` (08-24) |
| `react-doctor/no-noninteractive-element-interactions` | 3 | 0 | исправлено | Разметка изменена планами фазы |
| `react-doctor/click-events-have-key-events` | 5 | 2 | вне охвата | `MediaLibrary.tsx:303` (зона перетаскивания; выбор файла доступен через скрытый `input`), `GroupSheet.tsx:369`; доступность клавиатуры, не категория плана 007 |
| `react-doctor/no-array-index-as-key` | 6 | 5 | вне охвата | Статические списки |
| `react-doctor/only-export-components` | 23 | 22 | вне охвата | Fast refresh в разработке |
| `react-doctor/server-sequential-independent-await` | 2 | 1 | вне охвата | `profile/[id]/page.tsx:11`, производительность серверной страницы |
| `react-doctor/no-loading-flag-reset-outside-finally` | 2 | 10 | ложное срабатывание (9), вне охвата (1) | `ChartSettingsPageClient.tsx:40`, `SearchDialog.tsx:185`, `images-plugin.tsx:118`, `MediaLibrary.tsx:88`, `:142`, `:176`, `DeleteGroupDialog.tsx:41`, `GroupSheet.tsx:200`: правило предполагает отклонённый промис, а функции `lib/http/request.ts` и доменного слоя не отклоняются, они возвращают исход (сетевые ошибки и ошибки разбора ловятся внутри `request`); ранний выход без сброса флага при `auth` и `aborted` — правило фазы (08-04, 08-21). `LoginPageClient.tsx:147`: сброс стоит в `finally` и намеренно пропускается при переходе после входа (коммит dev 40fa16c). `InviteClient.tsx:32`: голый `fetch` по исключению D-07 может отклониться при обрыве связи, тогда экран остаётся в «Загрузка»; код до фазы был таким же, не категория плана 007 — вне охвата RT-04, записано в отложенные пункты 08-25 |
| `react-doctor/motion-animate-presence-must-outlive-child` | 0 | 1 | вне охвата | `SearchDialog.tsx:357`: ветка `searchError ? <LoadErrorAlert> : <AnimatePresence>` (08-22) снимает `AnimatePresence` вместе с результатами, поэтому выходной анимации нет. Блок ошибки заменяет выдачу сразу — намеренно (Поверхность 5); перенос условия внутрь `AnimatePresence` задержал бы появление ошибки. Не категория плана 007 |

### Остальные диагностики итогового прогона

Число не изменилось; вердикт и обоснование — как в таблице «Остальные диагностики» базового прогона (вне охвата RT-04): `js-hoist-intl` 2, `no-locale-format-in-render` 8, `no-high-complexity-react-function` 9, `js-set-map-lookups` 6, `no-giant-component` 8, `shadcn-icon-button-requires-label` 18, `prefer-dynamic-import` 4, `eslint/no-unused-vars` 7, `no-transition-all` 5, `no-set-state-after-await-in-effect` 1, `nextjs-no-client-side-redirect` 3, `jsx-no-constructed-context-values` 4, `use-lazy-motion` 6, `rendering-hydration-no-flicker` 1, `no-initialize-state` 1, `no-permanent-will-change` 9, `no-prevent-default` 2, `no-static-element-interactions` 3, `next/no-img-element` 5, `rerender-memo-with-default-value` 1, `no-unescaped-dynamic-string-in-regexp` 3, `async-await-in-loop` 3, `rerender-state-only-in-handlers` 4, `window-open-without-noopener` 1, `no-unsafe-json-parse` 1, `rerender-lazy-state-init` 1, `no-react-dom-deprecated-apis` 1, `no-adjust-state-on-prop-change` 19, `context-provider-value-from-unmemoized-local-literal` 1, `prefer-tag-over-role` 1, `no-effect-chain` 1, `no-pass-live-state-to-parent` 1, `no-prop-callback-in-effect` 1, `control-has-associated-label` 1, `duplicate-jsx-subtree` 2, `no-self-updating-effect` 1, `js-index-maps` 1.

### Итог итогового прогона

- Сверка: 4 error + 12 warning категорий плана 007 (10 `environment.ts`, 2 `dangerous-html-sink`) + 188 остальных = 204; к базовому 229: −25 по правилам таблицы изменений.
- Подтверждённых диагностик категорий плана 007 и уровня error в файлах фазы: ноль. Все 6 подтверждённых мест базового прогона закрыты (08-07, 08-10, 08-25).
- Ложные срабатывания: `mentions-plugin.tsx:573` (`jsx-key`), `SearchDialog.tsx:113`, `:121` (`dangerous-html-sink`), 9 мест `no-loading-flag-reset-outside-finally`.
- Вне охвата: остальные; `require-reduced-motion` закрыт точечно по D-18.
