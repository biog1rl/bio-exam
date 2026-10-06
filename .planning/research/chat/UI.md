# Исследование: UI чатов учителя и ученика

**Дата:** 2026-10-05
**Область:** клиентский интерфейс чата в `app/web` (Next.js 16.3.8, React 19.2.2, Tailwind 4.1.18, shadcn/ui new-york, Radix)
**Общая уверенность:** HIGH по составу пакетов и совместимости (npm registry, файлы shadcn-реестра, MDN BCD, caniuse), MEDIUM по поведению на iOS (прокрутка при подгрузке истории, HEIC из «Фото»).

Уровни: **HIGH** — первоисточник (npm registry, JSON реестра, исходник пакета, BCD/caniuse, официальные доки); **MEDIUM** — официальная страница без проверки кодом или несколько согласных вторичных источников; **LOW** — один вторичный источник.

## Главный вывод

С 26.06.2026 у shadcn/ui есть официальные компоненты чата: `message-scroller`, `message`, `bubble`, `attachment`, `marker` ([changelog 2026-06](https://ui.shadcn.com/docs/changelog/2026-06-chat-components), HIGH). Поведение прокрутки вынесено в headless-пакет `@shadcn/react` (`@shadcn/react/message-scroller`, MIT, 0.3.1 от 2026-08-31, peer `react >=19`, [npm](https://registry.npmjs.org/@shadcn/react), HIGH). Компоненты не владеют транспортом и данными («does not own messages, AI state, transport, persistence», [docs](https://ui.shadcn.com/docs/components/radix/message-scroller), HIGH), поэтому подходят для человеческого чата, а не только AI.

Рекомендация: **брать официальные компоненты shadcn из реестра и дописывать своё** (поле ввода, карточку попытки, пайплайн фото, лайтбокс) на уже имеющихся примитивах. Готовые киты не брать: SaaS-киты привязаны к своему бэкенду лицензией и зависимостями, open-source киты либо заброшены, либо несовместимы с React 19, либо заточены под AI-стриминг. Виртуализация при наших объёмах не нужна.

## 1. Таблица кандидатов

### 1.1 shadcn и экосистема реестров

| Проект | Лицензия | Последний релиз / коммит | Совместимость R19 / TW4 / Next16 | Что даёт | Вердикт |
|---|---|---|---|---|---|
| shadcn/ui `message-scroller` + `@shadcn/react` | MIT | `@shadcn/react` 0.3.1, 2026-08-31; компоненты 2026-06-26 | R19: peer `react >=19`; TW: нужны утилиты TW **4.3** (`inset-s-1/2`, `scrollbar-thin`, `scrollbar-gutter-stable`) и `scroll-fade-b` из `shadcn/tailwind.css`; Next: `"use client"`, без ограничений ([registry JSON](https://ui.shadcn.com/r/styles/new-york-v4/message-scroller.json)) | Открытие снизу, follow-output только когда читатель у низа, `preserveScrollOnPrepend` (история вверх без прыжка), jump-to-message, кнопка «к последнему», `role="log"` + `aria-relevant="additions"`, `content-visibility:auto` на строках | **Брать** (HIGH) |
| shadcn/ui `message`, `bubble`, `marker` | MIT | 2026-06-26 | Только `cn` и `radix-ui` (`Slot`); классы TW 4.1-совместимы ([bubble.json](https://ui.shadcn.com/r/styles/new-york-v4/bubble.json)) | Строка сообщения (аватар, выравнивание start/end, header/footer), пузырь с вариантами и реакциями, маркеры даты и статуса | **Брать** (HIGH) |
| shadcn/ui `attachment` | MIT | 2026-06-26 | `cn`, `radix-ui`, `button`; использует `shimmer`, `scroll-fade-x`, `scrollbar-none` ([attachment.json](https://ui.shadcn.com/r/styles/new-york-v4/attachment.json)) | Плитка файла/картинки, состояния `idle / uploading / processing / error / done`, действия | **Брать** (HIGH) |
| shadcn/ui `empty`, `item`, `spinner` | MIT | в индексе реестра | есть в [r/index.json](https://ui.shadcn.com/r/index.json) | Пустой список чатов, строка диалога в списке, индикатор отправки | Брать по месту (HIGH) |
| `jakobhoeg/shadcn-chat` | MIT | push 2025-08-12 | — | Пузыри, список, ввод | **Нет**: README «I am no longer actively maintaining this library» ([README](https://github.com/jakobhoeg/shadcn-chat)) (HIGH) |
| `Blazity/shadcn-chatbot-kit` | MIT | push 2026-02-26 | — | Чат-бот: подсказки, автоскролл, ввод | Нет: AI-чатбот, обновлений 7 мес. (HIGH по датам, [GitHub API](https://api.github.com/repos/Blazity/shadcn-chatbot-kit)) |
| Vercel AI Elements | Apache-2.0 | push 2026-09-01 | `message` зависит от `ai` + `streamdown`, `prompt-input` от `ai`; `conversation` = обёртка `use-stick-to-bottom` ([registry.ai-sdk.dev](https://registry.ai-sdk.dev/registry.json)) | AI-диалог, стриминг markdown | Нет: привязка к типам AI SDK (HIGH) |
| prompt-kit | MIT | push 2026-09-28 | `message` тянет `react-markdown`, `shiki`, `marked`; `chat-container` = `use-stick-to-bottom` ([prompt-kit c/](https://www.prompt-kit.com/c/registry.json)) | AI-диалог | Нет: тяжёлые зависимости, AI-форма (HIGH) |
| `@assistant-ui/react` | MIT | 0.15.23, 2026-10-02 | peer `react ^18 \|\| ^19` ([npm](https://registry.npmjs.org/@assistant-ui/react)) | Рантайм треда «пользователь—ассистент» | Нет: модель данных AI-ассистента, лишний слой (MEDIUM) |
| Supabase UI `realtime-chat-nextjs` | не проверялась | в реестре | зависит от `@supabase/supabase-js`, `@supabase/ssr` ([JSON](https://supabase.com/ui/r/realtime-chat-nextjs.json)) | Простой чат на Supabase Realtime | Нет: SaaS-бэкенд (HIGH) |
| `@animate-ui` (подключён) | MIT + Commons Clause | push 2025-12-31 | — | Чат-компонентов нет: только иконки `message-*`, `primitives-texts-typing`, фон `bubble` ([registry.json](https://animate-ui.com/r/registry.json)) | Только иконки/анимации при желании (HIGH) |
| `@magicui` (подключён) | MIT | push 2026-09-20 | — | Чат-компонентов нет (`typing-animation`, `scroll-progress`) ([registry.json](https://magicui.design/r/registry.json)) | Не нужен для чата (HIGH) |
| shadcn.io/blocks | коммерческий агрегатор | — | не проверено | Есть блоки `chat-*` (видна ссылка `chat-agent-assignment`) | Не проверено детально, не рассматривать (LOW) |

### 1.2 Не-shadcn React-библиотеки и SaaS-киты

| Проект | Лицензия | Последний релиз | Совместимость | Что даёт | Вердикт |
|---|---|---|---|---|---|
| `@chatscope/chat-ui-kit-react` | MIT | 2.1.1, 2025-05-15 | peer `react ^16…^19`, тянет FontAwesome, `prop-types`, свой SCSS-стиль ([npm](https://registry.npmjs.org/@chatscope/chat-ui-kit-react)) | Полный UI без бэкенда: список, пузыри, ввод, typing | Нет: не Tailwind, чужая дизайн-система, 17 мес. без релиза (HIGH) |
| `react-chat-elements` | MIT | 12.0.18, 2025-03-18 | peer `react ^18.2.0`, `react-dom 18.2.0` — **несовместим с React 19** ([npm](https://registry.npmjs.org/react-chat-elements)) | Пузыри, список | Нет (HIGH) |
| `@minchat/react-chat-ui` | не указана | 1.5.2, 2025-09-12 | peer `styled-components >=6` ([npm](https://registry.npmjs.org/@minchat/react-chat-ui)) | UI-кит MinChat | Нет: styled-components, лицензия не указана (HIGH) |
| `stream-chat-react` | проприетарная Stream | 14.12.1, 2026-09-30 | peer `stream-chat ^9.52` | Полный кит | Нет: лицензия разрешает использование для приложений, «through which data generated by Stream services will be streamed» ([LICENSE](https://unpkg.com/stream-chat-react@14.12.1/LICENSE)); без клиента `stream-chat` компоненты не работают (HIGH) |
| `@sendbird/uikit-react` | `SEE LICENSE IN LICENSE.md` | 3.19.1, 2026-09-17 | dependency `@sendbird/chat` ([npm](https://registry.npmjs.org/@sendbird/uikit-react)) | Полный кит | Нет: жёсткая зависимость от SDK Sendbird; текст лицензии прочитать не удалось (HIGH по зависимости) |
| `@cometchat/chat-uikit-react` | ToS CometChat (URL вместо SPDX) | 7.2.3, 2026-09-29 | peer `@cometchat/chat-sdk-javascript`, `@cometchat/calls-sdk-javascript` ([npm](https://registry.npmjs.org/@cometchat/chat-uikit-react)) | Полный кит со звонками | Нет (HIGH) |
| `@talkjs/react` | MIT (обёртка) | 0.1.12, 2026-02-02 | peer `talkjs` — UI рисуется iframe-ом TalkJS ([npm](https://registry.npmjs.org/@talkjs/react)) | Встраиваемый чат | Нет: UI и данные на стороне TalkJS (MEDIUM) |

Итог по SaaS: UI, отвязываемый от бэкенда, ни у одного из четырёх нет: Stream ограничивает лицензией, Sendbird и CometChat объявляют SDK зависимостями, TalkJS рендерит у себя. Для 152-ФЗ и VPS в России все четыре исключены.

### 1.3 Прокрутка и виртуализация

| Пакет | Лицензия | Релиз | Peer | Обратная прокрутка / история вверх | Вердикт |
|---|---|---|---|---|---|
| `@shadcn/react/message-scroller` | MIT | 0.3.1, 2026-08-31 | `react >=19` | Да, `preserveScrollOnPrepend` по умолчанию; JS-механизм, без опоры на CSS `overflow-anchor` | **Брать**, закрепить точную версию |
| `use-stick-to-bottom` | MIT | 1.1.6, 2026-06-04 | `react ^16.8…^19` | Прилипание к низу, ResizeObserver, пружинная прокрутка; явной подгрузки истории в README нет ([README](https://github.com/stackblitz-labs/use-stick-to-bottom)) | Запасной вариант (MEDIUM) |
| `react-virtuoso` | MIT (npm) | 4.18.16, 2026-09-29 | `react >=16…>=19` | `firstItemIndex`, `followOutput` | Не нужен (HIGH по метаданным) |
| `@virtuoso.dev/message-list` | Commercial | 1.18.1, 2026-09-25 | `react >=16…>=19` | Специализирован под чат | Нет: $14/мес за место ($168/год), Pro $26 ($312/год), 30 дней без лицензии в dev ([pricing](https://virtuoso.dev/pricing/), MEDIUM) |
| `@tanstack/react-virtual` | MIT | 3.14.13, 2026-09-14 (тянет `virtual-core` 3.17.11) | `react ^16.8…^19` | `anchorTo: 'end'`, `followOnAppend`, `scrollToEnd()`, ключи обязательны ([docs Chat](https://tanstack.com/virtual/latest/docs/chat)); `anchorTo` появился в `virtual-core` 3.16.0 от 2026-05-25 (проверено по dist на unpkg) | Резерв, если когда-то понадобится виртуализация (HIGH) |

**Нужна ли виртуализация.** Нет. Диалог 1:1 учителя и ученика — сотни сообщений за учебный год, история грузится страницами по 30–50. Документация `MessageScroller`: «comfortable for the expected range of a chat transcript: hundreds to low thousands of turns», строки рендерятся реальным DOM с `content-visibility:auto` (HIGH, [docs → Performance](https://ui.shadcn.com/docs/components/radix/message-scroller)). Там же приведён рецепт подключения `useVirtualizer` к `MessageScrollerViewport`, если объём вырастет. Реальный DOM, в отличие от виртуализации, сохраняет поиск по странице, выделение текста и чтение скринридером.

`content-visibility`: Chrome 85, Safari/iOS 18.0, Firefox 125 (caniuse, HIGH). На iOS 17 свойство игнорируется, это просто потеря оптимизации.

## 2. Поле ввода: textarea, не Lexical

Рекомендация: `textarea` из `components/ui/textarea` внутри `InputGroup` (уже есть), автоувеличение через `field-sizing: content` (утилита TW `field-sizing-content`) + `max-h-40`, с JS-фолбэком.

- `field-sizing`: Chrome/Chrome Android 123, Safari/iOS **26.2**, Firefox 152 (MDN BCD 8.1.4, HIGH). На iPhone с iOS < 26.2 не работает: нужен фолбэк по `CSS.supports('field-sizing','content')` (подгон `height` по `scrollHeight`) или `react-textarea-autosize` 8.5.9 (MIT, peer `react ^16.8…^19`, [npm](https://registry.npmjs.org/react-textarea-autosize)). Свой фолбэк — 15 строк, пакет не обязателен.
- Против Lexical: в проекте Lexical 0.38.2 при актуальной 0.52.0 (2026-09-28, [npm](https://registry.npmjs.org/lexical)) — чат окажется привязан к отложенному апгрейду редактора. Для чата 1:1 не нужны упоминания и форматирование. Contenteditable на мобильных хуже textarea в автокоррекции, IME и диктовке (MEDIUM, общеизвестные проблемы contenteditable, отдельно не проверялось). Сообщения хранятся как plain text, ссылки распознаются при рендере.
- Вставка изображения из буфера: `onPaste` на textarea, `event.clipboardData.files` → тот же пайплайн, что и выбор файла. Lexical для этого не нужен.
- Enter: на устройствах с `(pointer: fine)` Enter отправляет, Shift+Enter — перенос; на `(pointer: coarse)` Enter — перенос, отправка кнопкой. Проверять `event.nativeEvent.isComposing`, чтобы не отправлять во время набора через IME. Атрибуты `enterKeyHint="send"`, `autoCapitalize="sentences"`, `inputMode="text"`.
- Шрифт поля не меньше 16px на мобильных, иначе iOS зумит страницу при фокусе (MEDIUM).

## 3. Фото-вложения

Пайплайн на клиенте, свой код без пакета сжатия:

1. `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>` и отдельная кнопка «Камера» с `capture="environment"`. `capture` работает в Chrome Android 25+ и Safari iOS 10+, на десктопе игнорируется (MDN BCD, HIGH). Явный список MIME вместо `image/*` важен для HEIC (п. 4).
2. `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth/resizeHeight })`: опции поддерживаются с Chrome 52/54, Safari и iOS 15, Firefox 93/98 (BCD, HIGH). Ориентация из EXIF применяется при декодировании.
3. Отрисовка в `canvas` (или `OffscreenCanvas` в воркере: Chrome 69, Safari 16.2, Firefox 105 — caniuse, HIGH), длинная сторона ≤ 2048px, `toBlob('image/jpeg', 0.85)`. **WebP не использовать на клиенте**: `toBlob` с `image/webp` в Safari не поддерживается (BCD `type_parameter_webp: false`, HIGH). Перекодирование через canvas удаляет весь EXIF, включая GPS: геометка не уходит с устройства.
4. Превью — `URL.createObjectURL` в плитке `Attachment` со `state="uploading"`, `revokeObjectURL` при размонтировании.

`browser-image-compression` 2.0.2 (MIT) не брать: последний релиз 2023-03-06, репозиторий без изменений с 2024-03 ([npm](https://registry.npmjs.org/browser-image-compression), [GitHub](https://github.com/Donaldcwl/browser-image-compression)); то же самое делает `createImageBitmap` + canvas.

**Сервер.** `uploadImage` в `app/server/src/services/assets/images.ts` перекодирует в WebP через `sharp` 0.35.5 без `.rotate()`/`autoOrient`. У `sharp` `autoOrient` по умолчанию `false` (`node_modules/sharp/dist/input.cjs`), метаданные при выводе отбрасываются, значит теряется и тег ориентации. Если файл придёт без клиентской нормализации (старый браузер, обход клиента), фото с iPhone ляжет боком. Для чата серверная обработка должна вызывать `.rotate()` (или `sharp(buf, { autoOrient: true })`) до ресайза. EXIF/GPS сервер и так отбрасывает: это второй рубеж (HIGH, проверено по коду).

**HEIC.**
- Сервер HEIC не декодирует: в установленном `sharp` формат `heif` принимает только `.avif` (`sharp.format.heif.input.fileSuffix === ['.avif']`, HIGH, проверено локально).
- Браузеры: HEIC в `<img>` поддерживает только Safari 17+ / iOS 17+. Chrome, Edge, Firefox, Chrome Android и Samsung не поддерживают (caniuse `heif`, HIGH). `createImageBitmap` от HEIC в Chrome упадёт.
- iOS при выборе из «Фото» перекодирует HEIC в JPEG, если `accept` перечисляет конкретные типы без `image/heic`. Если указать `image/heic`, Safari 17+ может отдавать HEIC даже для JPEG ([Apple Developer Forums](https://developer.apple.com/forums/thread/743049), [HN](https://news.ycombinator.com/item?id=23261216); MEDIUM). Проверить на живом iPhone в UAT.
- Остаётся HEIC из приложения «Файлы» или с ПК. Решение: распознать по сигнатуре `ftypheic/ftypmix1` и показать понятную ошибку «Сохраните фото как JPEG» с инструкцией. Тяжёлые декодеры не тащить: `heic-to` 1.6.5 весит 25 МБ unpacked, `libheif-js` 1.23.5 — 8.8 МБ, обе под LGPL-3.0; `heic2any` 0.0.4 (2.6 МБ, MIT) не обновлялся с 2023-03 (npm, HIGH). Если в UAT HEIC окажется частым, подключать `heic-to` динамическим `import()` только при обнаружении HEIC (LGPL допускает динамическую линковку, но это нужно согласовать).

**Лайтбокс.** `yet-another-react-lightbox` 3.32.2 (MIT, 2026-07-30, peer `react ^16.8…^19`, 236 КБ unpacked, плагин Zoom с pinch на мобильных; [npm](https://registry.npmjs.org/yet-another-react-lightbox), HIGH). Альтернатива без зависимости — `Dialog` + `<img>` без зума, но для фото тетрадей зум обязателен: учитель разглядывает почерк. `react-photo-view` 1.2.7 (Apache-2.0, 2025-01) — запасной вариант (HIGH по метаданным).

## 4. Доступность и мобильная вёрстка (375px)

- Лента: `MessageScrollerViewport` уже даёт `role="region"`, `aria-label="Messages"` (заменить на «Сообщения»), `tabIndex={0}`; `MessageScrollerContent` — `role="log"` (неявный `aria-live="polite"`) и `aria-relevant="additions"`; неактивная кнопка «к последнему» получает `inert` и `tabIndex=-1` (HIGH, docs). Пока грузится старая история, ставить `aria-busy` на контент, чтобы скринридер не зачитывал 50 старых сообщений. Счётчик непрочитанных и «собеседник печатает» — в отдельном `role="status"`, не внутри `log`.
- Фокус: после отправки фокус остаётся в поле ввода; при открытии диалога фокус на поле, но на `(pointer: coarse)` не ставить автофокус, иначе выскочит клавиатура. Пузыри не делать фокусируемыми; действия над сообщением доступны через `DropdownMenu` у пузыря (на мобильных — долгое нажатие через `ContextMenu`, он уже есть).
- Клавиатура: `interactive-widget=resizes-content` поддерживает только Chrome Android 108+; в Safari и iOS — `false` (MDN BCD, HIGH). WebKit реализовал его в исходниках, но на 11.09.2026 ни в Safari, ни в Technology Preview его нет ([bram.us](https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/), MEDIUM). Нужны оба механизма: `viewport.interactiveWidget = 'resizes-content'` в `app/web/app/layout.tsx` (тип есть в Next: `extra-types.d.ts`, HIGH) для Android и хук на `window.visualViewport` (`resize`/`scroll`, Safari 13+) для iOS. Хук выставляет CSS-переменную высоты контейнера чата и держит низ ленты у поля ввода.
- Высота: контейнер чата `h-dvh` (viewport units `dvh`: Chrome 108, Safari 15.4, caniuse, HIGH), а не `h-screen`.
- Безопасные зоны: `env(safe-area-inset-bottom)` работает только при `viewport-fit=cover`. Сейчас в `viewport` (layout.tsx) задан только `themeColor`, нужно добавить `viewportFit: 'cover'` и `pb-[env(safe-area-inset-bottom)]` у панели ввода. Это пригодится и для PWA standalone.
- Раскладка 375px: список диалогов и диалог — два отдельных экрана (маршрут `/chats` → `/chats/[id]`), а не `Sheet` поверх списка: так работают кнопка «назад» и ссылки из Web Push. На `lg:` — две колонки. Пузырь `max-w-[80%]` (дефолт `bubble`), аватары в 1:1 скрыть на мобильных.
- Цели нажатия ≥ 44px: у `InputGroupButton size="icon-sm"` ≈ 32px, на мобильных нужен `size="icon"` или увеличенная зона нажатия.

## 5. Рекомендованный набор

Добавить из официального реестра (стиль `new-york` резолвится в `r/styles/new-york-v4`, примитивы на `radix-ui`, HIGH):

```bash
npx shadcn@latest add message-scroller message bubble attachment marker empty item spinner
```

Зависимости:

| Пакет | Версия | Зачем |
|---|---|---|
| `@shadcn/react` | `0.3.1` (точно, без `^`: 0.x и 3 месяца от первого релиза) | поведение `MessageScroller` |
| `yet-another-react-lightbox` | `^3.32.2` | просмотр фото с зумом |
| `react-textarea-autosize` | `^8.5.9` | только если не писать свой фолбэк для iOS < 26.2 |
| `@tanstack/react-virtual` | `^3.14.13` | **не ставить сейчас**; резерв на случай длинных лент |

Решения перед установкой (выбрать одно в каждом пункте):
- **Tailwind.** Вариант А (рекомендован): отдельным изменением поднять `tailwindcss` и `@tailwindcss/postcss` с 4.1.18 до `^4.3.3` (2026-07-16). `inset-s-*` и `scrollbar-thin` есть в 4.3.0, но отсутствуют в 4.2.0 и 4.1.18 (проверено по `dist/lib.js`, HIGH). Вариант Б: заменить при установке ~5 классов (`inset-s-1/2` → `left-1/2`, `scrollbar-*` → свои утилиты).
- **`scroll-fade-*` и `shimmer`.** Это `@utility`-блоки из `shadcn/tailwind.css` (пакет `shadcn` 4.21.1 в проекте не установлен). Файл (637 строк в 4.21.1) содержит `@theme inline` с keyframes `accordion-down/up` (пересекаются с `tw-animate-css`), 9 `@custom-variant` (`data-open`, `data-disabled` и др.; `data-disabled:` уже используется 6 раз в `components/ui/dropdown-menu.tsx` и `context-menu.tsx`, семантика у shadcn та же: `[data-disabled]` без `="false"`) и утилиты. `scroll-fade-*` — 5 `@property` и ~13 `@utility` (около 430 строк), `shimmer` — ещё ~90. Рекомендация: скопировать в `app/web/styles/globals.css` только `@property --scroll-fade-*`, `scroll-fade-b`, `scroll-fade-x` и `shimmer` с зависимыми переменными (~150–200 строк), без keyframes и custom-variant. Альтернатива: `shadcn` в devDependencies и `@import "shadcn/tailwind.css"` целиком (документированный путь), но тогда нужна визуальная проверка аккордеонов и меню.
- **`cn`.** Компоненты реестра импортируют `cn` из npm-пакета `cn` (0.4.0, MIT, shadcn-ui) и объявляют его зависимостью ([changelog 2026-09](https://ui.shadcn.com/docs/changelog/2026-09-cn)); CLI ставит пакет рядом с локальным хелпером. В проекте алиас `@/lib/utils/cn`. Рекомендация: при установке переписать импорт на `@/lib/utils/cn`, переход на пакет (`npx shadcn@latest migrate cn`) — отдельной задачей, если вообще понадобится.

Своё поверх примитивов:
- `ChatComposer` — `InputGroup` + `textarea` (`field-sizing-content` + фолбэк), кнопки «Фото» / «Камера» / «Отправить», вставка из буфера, плитки `Attachment` до отправки.
- `useImagePipeline` — `createImageBitmap` → canvas → JPEG, проверка сигнатуры HEIC, лимит размера.
- `AttemptCard` — карточка «обсудить попытку» на `Item`/`Card`: тест, балл, дата, ссылка на разбор; вставляется в пузырь через `BubbleContent asChild`.
- `useVisualViewportHeight` — хук клавиатуры iOS.
- Маркеры даты («Сегодня», «Вчера») и «Новые сообщения» — `Marker`; «печатает…» — `Marker` + `shimmer`.

## 6. Риски и открытые вопросы

1. **`@shadcn/react` молодой (0.x).** API может меняться между минорами, отсюда точная версия и e2e на прокрутку. Если пакет сломается, запасной путь — `use-stick-to-bottom` плюс своя компенсация `scrollTop` при подгрузке истории (MEDIUM).
2. **Подгрузка истории на iOS не проверена.** CSS `overflow-anchor` в iOS Safari не поддерживается (caniuse: `ios_saf: no`, Safari только TP, HIGH). `MessageScroller` по документации сохраняет позицию сам, но реальную проверку на iPhone не делал. Нужен спайк или ранний UAT: 200 сообщений, прокрутка вверх, подгрузка, отсутствие прыжка.
3. **Апгрейд Tailwind до 4.3** может задеть существующую вёрстку. Делать отдельным коммитом с `yarn verify` и визуальной проверкой ключевых страниц до работы над чатом.
4. **HEIC.** Доля HEIC, который не перекодирует iOS, неизвестна. Решить после UAT, нужен ли ленивый `heic-to` (25 МБ пакета, LGPL-3.0).
5. **Ориентация фото на сервере.** `uploadImage` не вызывает `.rotate()`. Для чатового эндпоинта это обязательно, иначе фото ложатся боком при обходе клиентского пайплайна.
6. **Модерация и несовершеннолетние.** К UI относится только частично: кнопка «Пожаловаться» / «Удалить сообщение» в меню пузыря и возможность скрыть фото. Требования определяет этап discuss.
7. **Sendbird.** Текст лицензии прочитать не удалось (404 на unpkg и GitHub raw). Вердикт держится на зависимости от `@sendbird/chat` и от этого не меняется.
8. **`interactive-widget` в Safari.** Если появится в Safari 27.x, хук `visualViewport` останется нужен для iOS ниже этой версии ещё минимум год.

## Источники (сводно)

- shadcn/ui: [changelog чат-компонентов](https://ui.shadcn.com/docs/changelog/2026-06-chat-components), [Message Scroller docs](https://ui.shadcn.com/docs/components/radix/message-scroller), [cn](https://ui.shadcn.com/docs/changelog/2026-09-cn), [r/index.json](https://ui.shadcn.com/r/index.json), `r/styles/new-york-v4/{message,message-scroller,bubble,attachment,marker}.json` — HIGH
- npm registry (`registry.npmjs.org/<pkg>`): версии, даты, лицензии, peerDependencies всех пакетов из таблиц — HIGH
- GitHub API (`api.github.com/repos/...`): даты последнего push, лицензии репозиториев — HIGH
- MDN browser-compat-data 8.1.4 (2026-10-01): `field-sizing`, `interactive-widget`, `capture`, `createImageBitmap` options, `toBlob` webp — HIGH
- caniuse (Fyrd/caniuse main): `heif`, `css-overflow-anchor`, `offscreencanvas`, `css-content-visibility`, `viewport-unit-variants` — HIGH
- [TanStack Virtual Chat](https://tanstack.com/virtual/latest/docs/chat), [Virtuoso pricing](https://virtuoso.dev/pricing/), [bram.us про interactive-widget](https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/) — MEDIUM
- Код проекта: `app/web/package.json`, `app/web/components.json`, `app/web/app/layout.tsx`, `app/server/src/services/assets/images.ts`, установленный `sharp` 0.35.5 — HIGH
