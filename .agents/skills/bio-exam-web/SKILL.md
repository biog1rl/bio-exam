---
name: bio-exam-web
description: Факты веб-клиента bio-exam (Next.js, app/web). Применять перед правкой app/web - запросы к API и веб-сессия, гейты по правам в интерфейсе, прохождение теста учеником, автосохранение черновика вопроса, web-тесты.
---

# bio-exam web

Данные и решения о доступе принадлежат Express (`docs/adr/0001-express-owns-data-and-access-policy.md`). Web показывает и отправляет, а не решает.

## Запросы и сессия

- Запрос к API из клиента идёт через модуль запросов `app/web/lib/http/request.ts`: `request` возвращает исход `{ ok: true, status, data }` или отказ с `kind` (`auth`, `http`, `malformed`, `network`, `aborted`), `requestJson` бросает `RequestError`, `requestBlob` скачивает файл. `parse` проверяет конверт ответа 2xx, несовпадение даёт `malformed`.
- SWR: ключ — строка из `*Keys` доменного слоя, фетчер — `swrFetcher` или `fetcherWith(parse)` из `app/web/lib/http/swr.ts`, объявленный на уровне модуля. Глобального `SWRConfig` нет.
- Тексты отказов: `failureMessage`, `loadErrorView`, `readApiError` в `app/web/lib/http/errors.ts`. Блок ошибки загрузки на экране: `app/web/components/feedback/LoadErrorAlert.tsx`.
- Доменные слои запросов: `app/web/lib/users/api.ts`, `app/web/lib/groups/api.ts`, `app/web/lib/tests/admin-api.ts`, `app/web/lib/tests/api.ts`, `app/web/lib/rbac/api.ts`, `app/web/lib/settings/api.ts`, `app/web/lib/charts/api.ts`, `app/web/lib/assets/api.ts`. Сегменты пути кодируются `encodeURIComponent`.
- Цепочкой 401 владеет `apiFetch` (`app/web/lib/session/client.ts`): ответ 401 → один общий `refreshOnce()` → один повтор запроса. Отказ refresh или повторный 401 уводят на `/login` и бросают `AuthExpiredError`; недоступный refresh возвращает исходный 401 без выхода. `apiFetch` импортируют только модуль сессии `app/web/lib/session` и модуль запросов `app/web/lib/http`.
- Параллельные 401 ждут один и тот же refresh, второй не запускается.
- Серверные страницы читают API через `serverRequest` и `requireServerData` (`app/web/lib/session/server.ts`).
- Свой `fetch` с другим поведением при 401 есть только у входа (`app/web/app/(internal)/login/LoginPageClient.tsx`, разбор в `app/web/lib/session/login-errors.ts`) и приглашения (`app/web/app/(internal)/invite/[token]/InviteClient.tsx`, разбор в `app/web/lib/auth/invite-flow.ts`). Правило держит `scripts/web-requests-guards.test.mjs`.
- Продление до истечения access-токена: `createKeepAlive` (`app/web/lib/session/keep-alive.ts`), подключён в `app/web/components/providers/AuthProvider.tsx`.
- Страницы: `app/web/proxy.ts` обновляет сессию до рендера, когда access-токен истекает, и уводит на `/login`, если refresh отклонён или кук сессии нет.

## Гейты по правам

- Раздел по пути и нужные права: `SECTION_PERMISSIONS`, `sectionForPath`, `canAccessSection`, `canOpenPath` живут в `packages/rbac/src/sections.ts` (их же использует Express), web импортирует их из `@bio-exam/rbac`.
- Layout раздела оборачивает страницу в `SectionGate` (`app/web/components/auth/SectionGate.tsx`, доступ — `sectionAccess` в `app/web/lib/navigation/section-access.ts`): нет прав → экран «Нет доступа к разделу», HTTP 200. Это UX, а не граница данных: страница под layout выполняется параллельно, поэтому данные она берёт только через Express с правами пользователя или проверяет права сама.
- В клиенте права берутся из `useAuth().can(...)` (`app/web/components/providers/AuthProvider.tsx`), проверка по ключу права из `@bio-exam/rbac`, а не по строке роли. В web нет `pg`, `jsonwebtoken` и чтения секретов: это держит `scripts/auth-no-role-string-checks.test.mjs`.

## Навигация

- Реестр разделов: `NAV_SECTIONS` в `app/web/lib/navigation/sections.ts` — одно название на адрес, группа, иконка, описание. Из него строятся боковое меню (`app/web/components/AppSidebar.tsx`), карта сайта, панель `/admin`, плитки `/admin/settings`, быстрые ссылки дашборда и категория «Разделы» в поиске.
- Новая страница без параметров в адресе добавляется в реестр, а её `metadata.title` совпадает с названием раздела: иначе падает `app/web/lib/navigation/sections.test.ts`.
- Хлебные крошки идут по цепочке родительских страниц (`app/web/lib/navigation/crumbs.ts`, `app/web/lib/navigation/paths.ts`); сегменты без страницы перечислены в `paths.ts`. Подпись страницы с параметром — `SetBreadcrumbsLabels` или шаблон в `crumbs.ts`.
- Фильтры списков, на которые ссылаются другие экраны, живут в адресе: состояние читается из `useSearchParams`, смена — `window.history.replaceState` в обработчике, не в эффекте (`app/web/lib/tests/attempts-url.ts`, `app/web/lib/users/users-url.ts`).
- Страницы прокручиваются не окном, а внутренним блоком `app/web/components/AppLayout/MainScrollArea.tsx` (у `<html>` `overflow: hidden`): он открывает новую страницу сверху и восстанавливает положение при «Назад»; `window.scrollTo` и `scrollRestoration` до контента не доходят.
- Банк заданий `/admin/tests` и `/admin/tests/[topic]` — один компонент `app/web/app/(internal)/(protected)/admin/tests/components/bank/BankExplorer.tsx` (темы слева, таблица тестов справа); фильтры, поиск и сортировка — в адресе (`app/web/lib/tests/bank-table.ts`).
- Диалоги и боковые панели из `components/ui` (`dialog`, `alert-dialog`, `sheet`) сами возвращают фокус на элемент, который их открыл (`components/ui/use-return-focus.ts`); у Radix без этого фокус возвращается только на `*Trigger`.
- Настройки типа вопроса для одного теста — одна строка `test_question_type_overrides`, PUT заменяет её целиком: страница баллов меняет только формулу, страница типа — только название и отключение, каждая отправляет чужие поля как есть (`testOverrideSteps` в `app/web/lib/tests/admin-api.ts`).
- Цвета оболочки — токены `app/web/styles/globals.css`; контраст пар токенов держит `app/web/styles/token-contrast.test.ts`, контраст и переполнение страниц — `e2e/tests/navigation.spec.ts`.

## Страница: шапка и таблица

Образец — банк заданий (`app/web/app/(internal)/(protected)/admin/tests/components/bank/BankExplorer.tsx`, `BankTestsTable.tsx`).

- Шапка — `PageHeader` (`app/web/components/page/PageHeader.tsx`): небольшой заголовок `h1` (serif, `text-2xl`/`text-3xl`) слева и в том же ряду справа панель: поиск `ToolbarSearch` (`app/web/components/page/ToolbarSearch.tsx`, `bg-card`, `rounded-full`) и иконочные кнопки `ToolbarButton` (`app/web/components/page/ToolbarButton.tsx`, круглые `size-10`; главное действие «+» — `tone="primary"`, остальные — контурные на `bg-card`, подсказка — `ToolbarTooltip`). Меню настроек страницы — `DropdownMenu` с `ToolbarButton` и иконкой `Settings2`.
- В шапке нет надзаголовков, абзацев описания, плиток статистики и счётчиков. Сведения, без которых страница непонятна, — одна строка `meta` под заголовком. Отдельная карточка-обёртка вокруг шапки не ставится: отступы страницы даёт `AppLayout`.
- Пустой список и «ничего не найдено» — `EmptyState` (`app/web/components/page/EmptyState.tsx`).
- Блок страницы с заголовком (профиль, график, настройки) — `Panel` (`app/web/components/page/Panel.tsx`): карточка `rounded-3xl`, `h2` `text-lg`, подпись `meta` под заголовком, действия `actions` справа; `titleRef` даёт фокус на заголовок после ошибки.
- Список сущностей — таблица `app/web/components/ui/table.tsx` внутри `TableCard` (`app/web/components/table/TableCard.tsx`), `table-fixed`, у строки шапки `hover:bg-transparent`, первый столбец `pl-4`, столбец действий `w-14 pr-3`. Карточек-строк и отдельной мобильной разметки нет: на узком экране второстепенные столбцы скрываются (`hidden tab-sm:table-cell`), их значения уходят строкой `text-xs text-muted-foreground` под главную ячейку.
- Сортировка — щелчок по заголовку, три шага (по возрастанию, по убыванию, сброс): `cycleSort` (`app/web/lib/utils/table-sort.ts`) и `SortableHead` (`app/web/components/table/SortableHead.tsx`). Числа и даты — справа, `tabular-nums`.
- Фильтр по значениям столбца — кнопка в заголовке столбца, `ColumnFilterMenu` (`app/web/components/table/ColumnFilterMenu.tsx`): чекбоксы со счётчиками, пустой выбор значит «все»; несколько групп — `groups`, длинный список с поиском — `searchPlaceholder`, у нескольких групп обязателен общий сброс `onReset`. Сортируемый столбец с фильтром — `SortableHead` с `filter`. Пока столбец скрыт, тот же фильтр стоит в панели шапки и скрывается на той же ширине, где появляется столбец (столбец `hidden lg:table-cell` — копия `lg:hidden`).
- Строка таблицы открывает сущность щелчком в любом месте — `useRowLink` (`app/web/components/table/use-row-link.ts`); ссылка в главной ячейке остаётся для клавиатуры и Ctrl/Cmd. Действия строки — меню «⋯» (`MoreHorizontal`, `size-8 rounded-full`), удаление в нём последним, `text-destructive`.
- Поиск, фильтры и сортировка списка, на который ссылаются другие экраны, — в адресе (см. «Навигация»).

## Графики

- Графики: «Публикации и наполнение» и «Активность учеников» на главной учителя и администратора, «Пройденные тесты» на главной ученика, «Мои результаты» на странице теста, «Попытки ученика» в профиле ученика. Ключи, типы, значения по умолчанию и подписи настроек — `app/web/lib/charts/config.ts` (`CHART_DEFINITIONS`).
- Настройки всех графиков задаёт администратор на `/admin/settings/chart` («Графики»): тип (столбцы, линия, область), ось X, метрика Y, цвет, период по умолчанию, подписи и легенда; превью на демо-данных (`app/web/lib/charts/demo.ts`, детерминированные) или на попытках выбранного ученика. Читает настройки любой вошедший (`useChartConfigs` в `app/web/lib/charts/api.ts`, при ошибке — значения по умолчанию); период, выбранный на самом графике, живёт в адресе (`range`, `from`, `to`) и перекрывает период из настроек.
- Графики попыток строятся из строк `ProgressAttempt` одним модулем `buildAttemptChart` (`app/web/lib/charts/attempt-series.ts`, тест рядом): группировка по оси X (каждая попытка, день, неделя, месяц, тема, тест; дни — по местному времени), метрика по группе, ряды по цвету. Ряды главной — `app/web/lib/charts/dashboard-series.ts`. Отрисовка — один `SeriesChart` (`app/web/components/charts/SeriesChart.tsx`) с обёртками `AttemptChart` и `DashboardCharts`; фигура графика имеет `role="figure"` и `aria-label`.

## Прохождение теста

- Модуль жизненного цикла попытки: `app/web/components/tests/attempt-lifecycle/`. Ядро `createAttemptLifecycle` (`lifecycle.ts`) без React: старт, ответы, навигация, таймер и автосдача по дедлайну, телеметрия времени на вопросе, отправка, восстановление после перезагрузки.
- Хук `useAttemptLifecycle` (`app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts`) создаёт модуль с `localStorage` и событиями видимости браузера и отдаёт снимок через `useSyncExternalStore`. `app/web/components/tests/TestRunner.tsx` только рисует снимок и вызывает команды модуля.
- Локальная копия ответов: `wal.ts`; восстановление: `restore.ts`; строка состояния сохранения: `save-indicator.ts`; ключи хранилища: `storage-keys.ts`.
- Ответы и телеметрия уходят через очередь `createSaveQueue` (`app/web/lib/drafts/save-queue.ts`) с паузой `ATTEMPT_SAVE_DEBOUNCE_MS` и пределом ожидания `ATTEMPT_SAVE_MAX_WAIT_MS`; при `pagehide` очередь досылается с `keepalive`.
- Схемы ответов и сессии попытки берутся из `@bio-exam/exam-core`.

## Результат попытки

- Что показывать, решает только `attemptResultView` в `app/web/lib/tests/attempt-result-view.ts`: результат с итогом или «на проверке». Процент и баллы - `number | null`, запасного нуля нет, `null` показывается как «—» или меткой.
- Метки результата - только компоненты `app/web/components/tests/attempt-result/`: `ReviewStatusChip`, `TeacherCheckedMark`, `AttemptReviewLine`. Ячейка результата в таблице - `AttemptScore` (процент со значком вердикта, баллы «x из y» через `formatPoints`, отметка учителя или строка «на проверке»). Экран не рисует процент, вердикт или «на проверке» мимо них.
- Фильтр `review` (`all`, `pending`, `graded`) списка попыток живёт в адресе: `app/web/lib/tests/attempts-url.ts`.

## Уведомления

- Компоненты `app/web/components/notifications/`: `NotificationBell` в шапке `AppLayout` (кнопка с числом и поповер), `NotificationList` (грузится через `next/dynamic`, у загрузки `NotificationListSkeleton`), `UnreadTitlePrefix` (префикс «(N) » в заголовке вкладки, держит `MutationObserver`).
- Запросы и ключи SWR - `app/web/lib/notifications/api.ts`: `notifications/unread-count/<userId>` и `notifications/list/<userId>` (с `userId`, чтобы смена пользователя не показывала чужие данные), `refreshNotifications` обновляет оба. Число обновляется раз в 60 секунд, по фокусу окна и при открытии поповера.
- Тексты и форматы: `format.ts` (число, «9+», имя кнопки, префикс, `isInternalHref`), `time.ts` (относительное время). Число приходит только с сервера, «9+» только в интерфейсе; имя кнопки несёт точное число.
- Страница `app/web/app/(internal)/(protected)/notifications/[id]/` вызывает `GET /api/notifications/:id/open` один раз из клиентского эффекта: внутренний `href` (`isInternalHref`) открывается через `router.replace`, отказ показывает «Нет доступа к материалу» без данных объекта, сбой - ошибку с повтором. Чужой `href` считается отказом.

## Черновик вопроса

- Автосохранение: `createQuestionDraftAutosave` (`app/web/lib/drafts/question-draft-autosave.ts`) поверх `createSaveQueue` с `lockVersion` сервера.
- Локальная копия черновика до подтверждения сервером: `app/web/lib/drafts/question-draft-copy.ts`; защита ухода со страницы: `app/web/lib/drafts/before-unload.ts`; тексты тостов: `app/web/lib/drafts/draft-ui.ts`; запросы: `app/web/lib/drafts/question-draft-api.ts`.
- Хук `useQuestionDraftAutosave` (`app/web/lib/drafts/use-question-draft-autosave.ts`) регистрирует досылку в `app/web/store/unsavedChanges.store.ts`.

## Web-тесты

- Vitest в environment `node`, только `*.test.ts` (`app/web/vitest.config.ts`): React не рендерится, DOM нет.
- Логика живёт в фабрике без React со швами в параметрах (`now`, `setTimer`, `clearTimer`, `doc`) по образцу `app/web/lib/session/keep-alive.ts`; тест подставляет швы, хук остаётся тонкой обёрткой.
- Фикстуры модуля попытки: `app/web/components/tests/attempt-lifecycle/testing.ts`.

```bash
yarn workspace @bio-exam/web test
yarn workspace @bio-exam/web typecheck
yarn workspace @bio-exam/web lint
yarn e2e
```
