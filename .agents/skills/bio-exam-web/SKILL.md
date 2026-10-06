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
- Доменные слои запросов: `app/web/lib/users/api.ts`, `app/web/lib/groups/api.ts`, `app/web/lib/tests/admin-api.ts`, `app/web/lib/tests/api.ts`, `app/web/lib/rbac/api.ts`, `app/web/lib/settings/api.ts`, `app/web/lib/assets/api.ts`. Сегменты пути кодируются `encodeURIComponent`.
- Цепочкой 401 владеет `apiFetch` (`app/web/lib/session/client.ts`): ответ 401 → один общий `refreshOnce()` → один повтор запроса. Отказ refresh или повторный 401 уводят на `/login` и бросают `AuthExpiredError`; недоступный refresh возвращает исходный 401 без выхода. `apiFetch` импортируют только модуль сессии `app/web/lib/session` и модуль запросов `app/web/lib/http`.
- Параллельные 401 ждут один и тот же refresh, второй не запускается.
- Серверные страницы читают API через `serverRequest` и `requireServerData` (`app/web/lib/session/server.ts`).
- Свой `fetch` с другим поведением при 401 есть только у входа (`app/web/app/(internal)/login/LoginPageClient.tsx`, разбор в `app/web/lib/session/login-errors.ts`) и приглашения (`app/web/app/(internal)/invite/[token]/InviteClient.tsx`, разбор в `app/web/lib/auth/invite-flow.ts`). Правило держит `scripts/web-requests-guards.test.mjs`.
- Продление до истечения access-токена: `createKeepAlive` (`app/web/lib/session/keep-alive.ts`), подключён в `app/web/components/providers/AuthProvider.tsx`.
- Страницы: `app/web/proxy.ts` обновляет сессию до рендера, когда access-токен истекает, и уводит на `/login`, если refresh отклонён или кук сессии нет.

## Гейты по правам

- Раздел по пути и нужные права: `SECTION_PERMISSIONS`, `sectionForPath`, `canAccessSection`, `canOpenPath` живут в `packages/rbac/src/sections.ts` (их же использует Express); `app/web/lib/session/route-permissions.ts` только реэкспортирует.
- Layout раздела оборачивает страницу в `SectionGate` (`app/web/components/auth/SectionGate.tsx`, доступ — `sectionAccess` в `app/web/lib/session/section-access.ts`): нет прав → экран «Нет доступа к разделу», HTTP 200. Это UX, а не граница данных: страница под layout выполняется параллельно, поэтому данные она берёт только через Express с правами пользователя или проверяет права сама.
- В клиенте права берутся из `useAuth().can(...)` (`app/web/components/providers/AuthProvider.tsx`), проверка по ключу права из `@bio-exam/rbac`, а не по строке роли. В web нет `pg`, `jsonwebtoken` и чтения секретов: это держит `scripts/auth-no-role-string-checks.test.mjs`.

## Навигация

- Реестр разделов: `NAV_SECTIONS` в `app/web/lib/navigation/sections.ts` — одно название на адрес, группа, иконка, описание. Из него строятся боковое меню (`app/web/components/AppSidebar.tsx`), карта сайта, панель `/admin`, плитки `/admin/settings`, быстрые ссылки дашборда и категория «Разделы» в поиске.
- Новая страница без параметров в адресе добавляется в реестр, а её `metadata.title` совпадает с названием раздела: иначе падает `app/web/lib/navigation/sections.test.ts`.
- Хлебные крошки идут по цепочке родительских страниц (`app/web/lib/navigation/crumbs.ts`, `app/web/lib/navigation/paths.ts`); сегменты без страницы перечислены в `paths.ts`. Подпись страницы с параметром — `SetBreadcrumbsLabels` или шаблон в `crumbs.ts`.
- Фильтры списков, на которые ссылаются другие экраны, живут в адресе: состояние читается из `useSearchParams`, смена — `window.history.replaceState` в обработчике, не в эффекте (`app/web/lib/tests/attempts-url.ts`, `app/web/lib/users/users-url.ts`).
- Страницы прокручиваются не окном, а внутренним блоком `app/web/components/AppLayout/MainScrollArea.tsx` (у `<html>` `overflow: hidden`): он открывает новую страницу сверху и восстанавливает положение при «Назад»; `window.scrollTo` и `scrollRestoration` до контента не доходят.
- Списки сущностей — таблицы `app/web/components/ui/table.tsx` в рамке-карточке с `table-fixed`; сортировка по заголовку в три шага — `cycleSort` (`app/web/lib/utils/table-sort.ts`) и `SortableHead` (`app/web/components/table/SortableHead.tsx`); фильтр значений столбца — `ColumnFilterMenu` (`app/web/components/table/ColumnFilterMenu.tsx`); строка-ссылка — `useRowLink` (`app/web/components/table/use-row-link.ts`); поля поиска — `bg-card`.
- Банк заданий `/admin/tests` и `/admin/tests/[topic]` — один компонент `app/web/app/(internal)/(protected)/admin/tests/components/bank/BankExplorer.tsx` (темы слева, таблица тестов справа); фильтры, поиск и сортировка — в адресе (`app/web/lib/tests/bank-table.ts`).
- Диалоги и боковые панели из `components/ui` (`dialog`, `alert-dialog`, `sheet`) сами возвращают фокус на элемент, который их открыл (`components/ui/use-return-focus.ts`); у Radix без этого фокус возвращается только на `*Trigger`.
- Настройки типа вопроса для одного теста — одна строка `test_question_type_overrides`, PUT заменяет её целиком: страница баллов меняет только формулу, страница типа — только название и отключение, каждая отправляет чужие поля как есть (`testOverrideSteps` в `app/web/lib/tests/admin-api.ts`).
- Цвета оболочки — токены `app/web/styles/globals.css`; контраст пар токенов держит `app/web/styles/token-contrast.test.ts`, контраст и переполнение страниц — `e2e/tests/navigation.spec.ts`.

## Прохождение теста

- Модуль жизненного цикла попытки: `app/web/components/tests/attempt-lifecycle/`. Ядро `createAttemptLifecycle` (`lifecycle.ts`) без React: старт, ответы, навигация, таймер и автосдача по дедлайну, телеметрия времени на вопросе, отправка, восстановление после перезагрузки.
- Хук `useAttemptLifecycle` (`app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts`) создаёт модуль с `localStorage` и событиями видимости браузера и отдаёт снимок через `useSyncExternalStore`. `app/web/components/tests/TestRunner.tsx` только рисует снимок и вызывает команды модуля.
- Локальная копия ответов: `wal.ts`; восстановление: `restore.ts`; строка состояния сохранения: `save-indicator.ts`; ключи хранилища: `storage-keys.ts`.
- Ответы и телеметрия уходят через очередь `createSaveQueue` (`app/web/lib/drafts/save-queue.ts`) с паузой `ATTEMPT_SAVE_DEBOUNCE_MS` и пределом ожидания `ATTEMPT_SAVE_MAX_WAIT_MS`; при `pagehide` очередь досылается с `keepalive`.
- Схемы ответов и сессии попытки берутся из `@bio-exam/exam-core`.

## Результат попытки

- Что показывать, решает только `attemptResultView` в `app/web/lib/tests/attempt-result-view.ts`: результат с итогом или «на проверке». Процент и баллы - `number | null`, запасного нуля нет, `null` показывается как «—» или меткой.
- Метки результата - только компоненты `app/web/components/tests/attempt-result/`: `ReviewStatusChip`, `TeacherCheckedMark`, `AttemptReviewLine`. Экран не рисует процент, вердикт или «на проверке» мимо них.
- Фильтр `review` (`all`, `pending`, `graded`) списка попыток живёт в адресе: `app/web/lib/tests/attempts-url.ts`.

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
