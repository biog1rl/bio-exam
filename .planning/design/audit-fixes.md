# Правки по визуальному аудиту 2026-10-16

Дизайн-система bio-exam, версия 8, публикация 2026-10-16: https://claude.ai/artifact/HcCrtwxQnu7ThvwzzgPUPP. Исполнителю она недоступна, этот файл самодостаточен. Замеры — в `.planning/DESIGN-VISUAL-AUDIT-2026-10-16.md`.

Номера строк — по `dev` на 2026-10-16. `TestRunner.tsx`, `QuestionInput.tsx` и блок фото сейчас правят другие сессии, поэтому место ищите по приведённому фрагменту, а не по номеру. Пути — от `app/web`.

## Пометки

- **[одобрено]** — входит в шесть «Предложений» аудита, владелец одобрил карточкой.
- **[владелец]** — решение владельца в чате 2026-10-16.
- **[система]** — решение дизайн-системы; кивок владельца берёт исполняющая сессия.

## Порядок работы

- Группы идут по порядку, группа A — первой: от неё зависят цвета в C4 и E4.
- Один коммит на группу; форматирование отдельным коммитом.

## Стенд для проверки

1. `yarn workspace @bio-exam/rbac build` и `yarn workspace @bio-exam/exam-core build`.
2. Временная база `test_*` (`node scripts/with-test-db.mjs …`), `drizzle:migrate`, e2e-сид.
3. Express на 4177, `next dev` на 3177.
4. Учётные записи из `e2e/fixtures/seed.json`: `admin-desktop`, `teacher-desktop`, `student-desktop`.

Ширины проверки — 375, 768 и 1280. Цвета и размеры смотреть по вычисленным стилям: `getComputedStyle`, цвета `lab()`/`oklab()` переводить в sRGB. После каждой группы — `yarn verify`.

## A. Токены [система]

**A1. `styles/globals.css`.**
- `:root`:
  - `--input: oklch(0.64 0.034 105)`;
  - `--ring: oklch(0.58 0.095 135)`.
- Добавить:
  - `--destructive-foreground: oklch(0.985 0.018 96)`, `--destructive-soft: oklch(0.955 0.025 27)`, `--destructive-border: oklch(0.8 0.08 27)`;
  - `--success: oklch(0.48 0.12 145)`, `--success-soft: oklch(0.95 0.045 145)`, `--success-border: oklch(0.8 0.08 145)`;
  - `--warning: oklch(0.52 0.12 65)`, `--warning-soft: oklch(0.955 0.05 85)`, `--warning-border: oklch(0.82 0.09 80)`;
  - `--highlight: oklch(0.93 0.12 100)`.
- В `@theme` — `--color-*` для каждого нового токена.

**Проверка:** в `styles/token-contrast.test.ts` добавить пары текста ≥ 4,5:1:
- `success` на `card` и `success-soft`;
- `warning` на `card` и `warning-soft`;
- `destructive` на `destructive-soft`;
- `destructive-foreground` на `destructive`;
- `foreground` на `highlight`.

Для `ring` на `background`, `card`, `secondary`, `muted`, `accent` нужен порог 3:1: завести второй список пар с этим порогом. Тест зелёный.

## B. Оболочка и слои

**B1 [одобрено]. Кнопки шапки оболочки.** Файлы: `components/AppLayout/AppLayout.tsx` («Назад»), `MobileMenuButton.tsx`, `notifications/NotificationBell.tsx:72`, `Search/SearchButton.tsx:34`.
- Все четыре: `variant="outline" size="icon"`, `rounded-full bg-card hover:bg-accent`.
- У поиска — `aria-label="Поиск"`.

**Проверка:** на 1280 у всех четырёх 36×36, `border-radius` — половина высоты, фон = `--card`.

**B2 [одобрено]. Крошки до 768px.** Файлы: `components/Breadcrumbs/index.tsx`, `ui/breadcrumb.tsx`.
- `BreadcrumbList` с `flex-nowrap min-w-0`.
- До `tab-sm` видна только текущая страница с `truncate`.
- Промежуточные — в `BreadcrumbEllipsis`: ghost-кнопка 32px `rounded-full`, `aria-label` «Путь: Главная, Банк заданий» и `DropdownMenu` со ссылками.
- От `tab-sm` — вся цепочка, метки `max-w-64 truncate`.

**Проверка:** 375, `/admin/tests/<тема>` — шапка 53px, одна строка, последняя крошка с многоточием. 768 — цепочка целиком, шапка 69px.

**B3 [одобрено]. Всплывающие слои.** Тень `shadow-md` в коде уже есть.
- `NotificationBell.tsx:93` — убрать `rounded-3xl`.
- `NotificationList.tsx:129` — `rounded-2xl` → `rounded-sm`.
- `ui/dropdown-menu.tsx:51` — `shadow-lg` → `shadow-md`.
- `origin-[--radix-…]` → `origin-(--radix-…)` в `ui/popover.tsx:25` и `ui/dropdown-menu.tsx:51,69`.
- `ui/select.tsx:73` — то же плюс `max-h-(--radix-select-content-available-height)`.

**Проверка:** у меню «⋯», фильтра столбца и поповера уведомлений радиус 16px. Длинный Select ограничен по высоте и прокручивается.

**B4 [одобрено]. Один оверлей у Dialog, AlertDialog, Sheet и поиска.**
- `ui/alert-dialog.tsx:24` — `bg-black/80` заменить классами оверлея `ui/dialog.tsx`.
- В `TestRunner.tsx` убрать `overlayClassName="bg-black/60 backdrop-blur-xl"` у диалога старта.
- `Search/SearchDialog.tsx` — тот же оверлей; там же `:334` убрать свою тень `rgba(…)` → `shadow-lg`, `bg-background/95` → `bg-popover`.

**Проверка:** вычисленные `background-image`/`background-color` и `backdrop-filter` оверлея одинаковы у подтверждения удаления, старта теста, поиска и Sheet.

**B5 [система]. Sheet.**
- `ui/sheet.tsx:52` — `bg-background` → `bg-popover`.
- `SheetTitle` (`:87`) — `text-lg font-semibold text-foreground`.

**Проверка:** «Настройки теста» — фон = `--popover`, h2 18px.

**B6 [система]. Меню аккаунта и цвет аватара.**
- `nav-user.tsx` — `SidebarMenuButton size="lg"` получает `rounded-xl`; обёртка `Avatar` `rounded-lg` → `rounded-full`.
- `lib/utils/readable-text.ts:1` — `DEFAULT_AVATAR_COLOR = '#4b6b38'`.
- `components/users/AvatarEditor.tsx:39-50` — палитра `#4b6b38`, `#69954f`, `#c3ac65`, `#68a796`, `#ba7747`, `#457a8e`, `#7d68a2`, `#bd6062`, `#526897`, `#bb79a5`, `#4c673e`. Сохранённые цвета пользователей не трогать.

**Проверка:** в боковом меню радиус активного пункта и кнопки аккаунта одинаковый, 22px. Аватар без цвета — оливковый.

## C. Таблицы

**C1 [одобрено]. Фокус ссылки в главной ячейке.**
- Было: `focus-visible:underline focus-visible:outline-none`.
- Стало: `rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring`.
- Восемь мест:
  - `admin/tests/components/bank/BankTestsTable.tsx:86`;
  - `admin/groups/GroupsClient.tsx:173`;
  - `dashboard/DashboardClient.tsx:86` (`mainLinkClass`);
  - `admin/attempts/AdminAttemptsClient.tsx:437`;
  - `components/users/UsersTable.tsx:175`;
  - `components/users/UserProfileAssignmentsPage.tsx:177`;
  - `admin/tests/question-types/QuestionTypesPageClient.tsx:228`;
  - `admin/tests/components/test-editor/QuestionRow.tsx:108`.
- Строку можно вынести в одну константу в `components/table`.

**Проверка:** Tab до ссылки в таблице — кольцо 3px цвета `--ring`, как у кнопки «⋯» рядом.

**C2 [система]. Кнопка сортировки.** `components/table/SortableHead.tsx:25` — `rounded-lg` → `rounded-full`, фокус `focus-visible:ring-[3px]`.

**Проверка:** в заголовке кнопки сортировки и фильтра одной формы.

**C3 [система]. Поле последнего столбца.** У последнего столбца с данными — `pr-4`, как `pl-4` у первого; у столбца «⋯» — `pr-3`. Содержимое ячейки не шире столбца.

**Проверка:** на 1280 и 768 расстояние от текста последнего столбца до правой рамки — 16px во всех таблицах.

**C4 [владелец]. Таблицы попыток: в ячейке одно значение.** Заменяет прежний пункт про `AttemptScore` и `w-44`.

| Столбец | Ширина | Содержимое | На проверке |
|---|---|---|---|
| «Баллы» | `w-24`, справа | `formatPoints`: «14 из 18» | баллы автопроверки, `text-muted-foreground` |
| «Результат» | `w-26`, справа | только процент `font-medium tabular-nums` | «—» |
| «Статус» | `w-32` | `StatusBadge` «Пройден» / «Не пройден» | «—» |
| «Проверка» | `w-28`, последний, `pr-4`, по центру | иконка 16px с `Tooltip` и `sr-only` | — |

- В ячейке «Результат» нет иконки итога, баллов и `TeacherCheckedMark`. Корень `components/tests/attempt-result/AttemptScore.tsx` — `flex w-full justify-end`, не `inline-flex`.
- Иконки «Проверки»:
  - `Clock3` `text-warning` — «На проверке, баллы предварительные»;
  - `BadgeCheck` `text-success` — «Проверено учителем»;
  - `Minus` `text-muted-foreground` — «Проверка не нужна» (в попытке нет открытых ответов).
- Фильтр проверки — `ColumnFilterMenu` в заголовке «Проверка», фильтр итога — в заголовке «Статус».
- До `tab-sm` «Дата», «Баллы» и «Статус» уходят второй строкой `text-xs text-muted-foreground` под главную ячейку: «6 окт · 14 из 18 · Пройден». «Проверка» остаётся столбцом `w-14` с иконкой `ClipboardCheck` в заголовке и `sr-only` «Проверка».
- Где:
  - `dashboard/DashboardClient.tsx` — «Последние попытки» и «Последние попытки учеников»;
  - `admin/attempts/AdminAttemptsClient.tsx` — группа «Проверка» уходит из фильтра «Результат» в новый столбец;
  - `tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx` — «История попыток»: «5 / 5» → «5 из 5», «Результат» — только процент, «Статус» остаётся, добавить «Проверка».

**Проверка:** на главной ученика с попыткой, проверенной учителем, «100%» отстоит от правой рамки на 16px, а в ячейке «Результат» один элемент. На 375 горизонтальной прокрутки нет.

**C5 [система].** `components/tests/attempt-result/TeacherCheckedMark.tsx:7` — «проверено учителем» → «Проверено учителем».

**C6 [одобрено]. Чипы поиска.** `Search/SearchDialog.tsx:67` — `text-muted-foreground/70` → `text-muted-foreground`, фон чипа `bg-muted/70` → `bg-muted`.

**Проверка:** контраст чипов «Тема» и «Slug» ≥ 4,5:1 (было 2,89).

## D. Контейнеры и пустые состояния [одобрено]

**D1. `EmptyState`.**
- `components/page/EmptyState.tsx` — большой `rounded-4xl` → `rounded-3xl`, маленький `rounded-2xl` → `rounded-md`.
- Убрать переопределения:
  - `className="py-10"` — `DashboardClient.tsx:361,372,387` и `TestLandingPageClient.tsx:114`;
  - `className="h-40 justify-center"` — `tests/[topicSlug]/[testSlug]/TestResultsChart.tsx:76`.
- `DashboardClient.tsx` — «Студенты пока не завершали тесты.» → «Ученики пока не завершали тесты.».

**Проверка:** на странице два вида — 24px на `card`/70 и 16px внутри Panel. Отступы как у компонента по умолчанию.

**D2. Контейнеры 32px → 24px (`rounded-4xl` → `rounded-3xl`).**
- `BankTopicsNav.tsx:45`;
- `ChartSettingsPageClient.tsx:136`;
- `AccessDeniedState.tsx:29`;
- `PageErrorState.tsx:23`;
- `NotificationOpenClient.tsx:67`;
- `AttemptQuestionsList.tsx:35,55`;
- `AttemptReviewNav.tsx:27`;
- `AttemptReviewSummary.tsx:102`;
- `StudentAttemptResult.tsx:38`;
- `UserProfileAssignmentsPage.tsx:587,596`;
- `QuestionEditorPageClient.tsx:474,485`;
- `DialogContent` `:546` — без `rounded-4xl`;
- скелетоны `BankExplorer.tsx:91`, `TestEditorClient.tsx:65,129`.

**Проверка:** поиск по `rounded-4xl` в `app/web` пуст.

**D3. `/tests` ученика — таблица вместо аккордеона.**
- Файлы: `tests/TestsPageClient.tsx`, `_components/PublicTestsTopicSection.tsx`, `_components/PublicTestCard.tsx`.
- Раскладка как у банка: колонка тем от `tab` (256px, 288px от `xl`, «Все тесты» первой, текущая — `bg-secondary`); до `tab` — `Select` `h-10 rounded-full bg-card` «Тема · число».
- Справа `TableCard`:
  - «Тест» — ссылка, второй строкой описание `text-xs`;
  - «Тема» — только в «Все тесты», от `lg`;
  - «Вопросы», «Таймер» («15 мин» или «—»), «Проходной» («60%» или «—») — справа.
- Строка — `useRowLink` на страницу теста. Сортировка по «Тест» и «Тема» — `SortableHead`.
- До `tab-sm` одна колонка «Тест» со строкой «Анатомия · 12 вопросов · 15 мин»; таймера нет — без него.

**Проверка:** 1280, 768, 375 — аккордеона нет, строка открывает тест, без горизонтальной прокрутки.

## E. Прохождение [одобрено]

**E1. Навигатор и прогресс** — ячейки номеров вопросов в боковой панели `TestRunner.tsx`.
- Ячейки `rounded-full`:
  - отвечен — `border-primary bg-primary text-primary-foreground`;
  - без ответа — `border bg-card text-foreground`;
  - текущий — `ring-2 ring-ring ring-offset-2 ring-offset-card`.
- `aria-label` «Вопрос {n}, отвечен» / «Вопрос {n}, без ответа», у текущего `aria-current="step"`.
- Полоса прогресса: `bg-gray-200` → `bg-muted`, `bg-green-500` → `bg-primary`.

**Проверка:** цифра на отвеченной ячейке ≥ 4,5:1 (было 2,22). Ячейки — круги.

**E2. Варианты ответа 16/24.**
- `QuestionInput.tsx`: у `Label` вариантов радио и чекбокса — `text-base leading-6 font-normal` вместо унаследованного `text-sm leading-none`.
- Левая часть сопоставления — тот же класс.
- Строка варианта — от 40px.

**Проверка:** вычисленные `font-size` 16px и `line-height` 24px; длинный вариант переносится без слипания.

**E3. Кнопки.**
- После сдачи, когда есть `snapshot.display.outcome`, не рисовать блок навигации «Назад / Далее / Завершить» под вопросом и «Завершить» в боковой панели.
- «Завершить» на экране одна: в боковой панели `hidden tab:flex`; под последним вопросом вместо «Далее» — «Завершить» только `tab:hidden`.
- Кнопки панели результата «Пройти ещё раз», «К тесту», «Ко всем тестам» — `size="sm" className="rounded-full"`.

**Проверка:** после сдачи отключённых кнопок нет. На 1280 и 375 видна одна «Завершить».

**E4. Панель результата и разбор.**
- Панель — без `border-emerald-200 bg-emerald-50`: `rounded-3xl border bg-card p-4 tab-sm:p-5`, на проверке — та же панель.
- Итог строкой:
  - `CircleCheck` `text-success` «Пройден»;
  - `CircleX` `text-muted-foreground` «Не пройден».
- Тексты «Баллы: 14 из 18», «Процент: 78%».
- `runner-result-card.ts`: `rounded` → `rounded-md`, цвета — `success`/`warning`/`destructive` с `*-soft` и `*-border`.
- Баннер ошибки и `DeadlinePanel` (`rose`) → `bg-destructive-soft border-destructive-border`, `rounded-3xl`.

**Проверка:** при «не пройден» зелёного фона нет. Радиусы вложенности 24 → 16.

**E5. Белое → токены.**
- `ui/button.tsx:18` (outline) `bg-white` → `bg-card`;
- `ui/dialog.tsx:48` и `ui/alert-dialog.tsx:45` `bg-white` → `bg-popover`;
- `QuestionInput.tsx` поле ответа `bg-white` → `bg-card`;
- боковая панель `TestRunner.tsx` `rounded-lg border bg-white` → `rounded-3xl border bg-card`;
- карточка вопроса `rounded-lg border bg-secondary` → `rounded-3xl`.

**Проверка:** нигде в прохождении и диалогах фон не `rgb(255,255,255)`.

## F. Страницы [система]

**F1. Главная.** `DashboardClient.tsx:340` — убрать из `PageHeader` кнопку «Управление тестами» / «Открыть последний тест».

**Проверка:** в шапке главной только h1.

**F2. Строка «Последние попытки» ученика.** На стенде не открылась, хотя `rowLink(attempt.testHref)` есть (`DashboardClient.tsx:154`). Проверить `testHref` у попыток ученика.

**Проверка:** щелчок по строке открывает страницу теста.

**F3. Плитки сводки.** `StatCards` (`DashboardClient.tsx:59-74`):
- плитке `shadow-sm`;
- две группы — «ученики» (3, `grid-cols-3`) и «банк» (4, `grid-cols-2 tab-sm:grid-cols-4`), от `lg` в одну строку (`lg:grid-cols-[3fr_4fr]`);
- ученику — `grid-cols-3`.

**Проверка:** на 375 ряды 3 и 2 + 2, на 768 — 3 и 4, рядов из одной плитки нет.

**F4. Текстовые кнопки в шапке.** Допустимы только «Отмена» и «Сохранить» на странице-форме и «Начать тест».
- `AdminAttemptsClient.tsx:320` «{N} на проверке» → `ToolbarButton` `Clock3` с числом в углу (как у колокольчика), `aria-pressed`, подсказка «Только на проверке: {N}».
- Редактор вопроса: «Перенести» → `ToolbarButton` `ArrowRightLeft` с подсказкой «Перенести вопрос»; «Отмена» — `variant="outline"`; текстовые кнопки `h-10 rounded-full`.

**Проверка:** в шапках нет текстовых кнопок, кроме разрешённых.

**F5. Профиль** (`profile/ProfileClient.tsx`).
- Кнопки форм без `w-full`: своей ширины, справа; до `mob` — во всю ширину.
- «Сменить пароль» — `variant="outline"`.
- Panel «Выход из аккаунта» убрать; выход — `ToolbarButton` `LogOut` «Выйти из аккаунта» в `PageHeader`.

**Проверка:** на экране одна `primary`-кнопка, красной кнопки во всю ширину нет.
