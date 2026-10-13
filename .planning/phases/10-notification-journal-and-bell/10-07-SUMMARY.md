---
phase: 10-notification-journal-and-bell
plan: 07
subsystem: web
tags: [notifications, deep-link, access-denied, breadcrumbs, e2e]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: GET /api/notifications/:id/open (10-04), NotificationBell, NotificationList, refreshNotifications (10-06)
provides:
  - Страница перехода /notifications/[id] с повторной проверкой доступа
  - openNotification, parseOpenNotification, OpenNotificationResult (lib/notifications/api.ts)
  - isInternalHref (lib/notifications/format.ts)
  - необязательный headingRef у AccessDeniedState
  - /notifications в NON_PAGE_PATHS, шаблон крошки «Уведомление»
affects: [10-08]

requirements-completed: [NOTIF-02]

actuals:
  tokens: 16000
  tasks: 3
  commits: 0
plan_head_before: 7f7c647
plan_head_after: 7f7c647

key-files:
  created:
    - app/web/app/(internal)/(protected)/notifications/[id]/page.tsx
    - app/web/app/(internal)/(protected)/notifications/[id]/NotificationOpenClient.tsx
  modified:
    - app/web/lib/notifications/api.ts
    - app/web/lib/notifications/api.test.ts
    - app/web/lib/notifications/format.ts
    - app/web/lib/notifications/format.test.ts
    - app/web/components/auth/AccessDeniedState.tsx
    - app/web/lib/navigation/paths.ts
    - app/web/lib/navigation/paths.test.ts
    - app/web/lib/navigation/crumbs.ts
    - app/web/lib/navigation/crumbs.test.ts
    - e2e/tests/notifications.spec.ts

key-decisions:
  - "Подпись крошки - статический шаблон LABEL_PATTERNS, а не SetBreadcrumbsLabels: проверяется юнитом и не мигает (как /admin/attempts/[id])"
  - "open вызывается только из клиентского эффекта; флаг в useRef хранит id, для которого вызов уже был, поэтому строгий режим и смена id не дают двойного вызова"
  - "Чужой href (не путь внутри приложения) превращается в no_access ещё в openNotification"
---

# Phase 10 Plan 07: страница перехода /notifications/[id] Summary

Ссылка уведомления ведёт на тонкую серверную оболочку, клиентский компонент один раз вызывает `GET /api/notifications/:id/open`: успех - `router.replace(href)`, отказ - экран «Нет доступа к материалу» без данных объекта, сбой - `LoadErrorAlert` с повтором.

## Что сделано

- Task 1 (tracer): `isInternalHref`, `parseOpenNotification`, `openNotification` (403 с `error: 'NO_ACCESS'` и чужой `href` дают `no_access`, остальное `failed`), `page.tsx` (`metadata.title = 'Уведомление'`, без запросов), `NotificationOpenClient` (загрузка `role="status"`, `refreshNotifications`, экраны отказа и ошибки), спек: открытие первой непрочитанной строки, адрес `/notifications/<uuid>`, поповер закрыт, текст экрана отказа, нет «Строение клетки» и «Клетка» в `main`, число в имени колокольчика на 1 меньше (читается до и после, от порядка строк не зависит).
- Task 2: `headingRef` у `AccessDeniedState` (при переданном ref у `h1` ставятся `ref`, `tabIndex=-1`, `outline-none`, иначе разметка прежняя), фокус на заголовок при отказе, `/^\/notifications$/` в `NON_PAGE_PATHS`, шаблон `/^\/notifications\/[^/]+$/` -> «Уведомление» в `LABEL_PATTERNS`, строки в существующих тестах `paths.test.ts` и `crumbs.test.ts`.
- Task 3: таблицы `isInternalHref` и `parseOpenNotification`, спеки: фокус, крошка и заголовок вкладки, `/notifications/not-a-uuid` и «Назад» -> `/dashboard`, 500 и «Повторить», чужой `href` `//evil.example/x`, 375/768/1280 без `horizontalOverflow` и `lowContrastTexts`.

## CodeGraph

- `codegraph impact AccessDeniedState`: 26 символов (`SectionGate`, страницы админки, `TestMissingState` и др.); новый проп необязательный, другие вызовы не меняются, их разметка прежняя.
- `codegraph impact parentPagePath`: 12 символов (`backAction`, `crumbTrail`, `Breadcrumbs`, `BackButton`, `not-found.tsx`); меняется только список непрозрачных сегментов, `paths.test.ts` зелёный.
- `codegraph impact staticCrumbLabel`: 6 символов (`Breadcrumbs`, `AppLayout`, тест); добавлен один шаблон.
- `codegraph affected` по файлам плана: `crumbs.test.ts`, `paths.test.ts`, `sections.test.ts`, `api.test.ts`, `format.test.ts` и файлы, импортирующие `AccessDeniedState`; все прогнаны (vitest, typecheck, e2e гонялись явно).

## Проверки

- `yarn workspace @bio-exam/web vitest run` по `lib/navigation/{paths,crumbs,sections}.test.ts` и `lib/notifications/{format,api}.test.ts`: 5 файлов, 83 passed.
- `yarn workspace @bio-exam/web typecheck`: чисто.
- `yarn workspace @bio-exam/web lint`: новых предупреждений нет (оставшееся `react(purity)` в `NotificationList` - из 10-06; два предупреждения от моих правок, `no-useless-escape` в regexp и `react(refs)` на `headingRef` в `AccessDeniedState`, устранены).
- `yarn e2e tests/notifications.spec.ts tests/navigation.spec.ts tests/sitemap.spec.ts`: 86 passed на `chromium-desktop` и `chromium-mobile`, без failed и flaky (отдельный прогон одного `notifications.spec.ts`: 56 passed).
- `yarn format:check`: зелёный.
- `yarn verify`: `yarn verify: OK`.
- `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-07`: `10-07 changed only its files`.

## Deviations from Plan

- В `AccessDeniedState` внутреннее имя деструктурированного пропа `heading` (публичное имя пропа `headingRef`), а классы собираются тернарным выражением: иначе `react(refs)` ругается на чтение ref-пропа при рендере. Поведение как в плане.
- `INTERNAL_HREF` записан как `/^\/(?![/\\])/` (без лишнего экранирования `/` в классе символов, тот же набор отвергаемых значений).
- Остальное выполнено как написано.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: T-10-28 закрыт `isInternalHref` и спеком с подменённым ответом, T-10-29 - оболочкой без запросов и флагом в `useRef`, T-10-30 - фиксированными текстами и проверкой отсутствия названий в `main`. Новых пакетов нет.

## Файлы к коммиту

- Создано: `app/web/app/(internal)/(protected)/notifications/[id]/page.tsx`, `app/web/app/(internal)/(protected)/notifications/[id]/NotificationOpenClient.tsx`
- Изменено: `app/web/lib/notifications/api.ts`, `api.test.ts`, `format.ts`, `format.test.ts`, `app/web/components/auth/AccessDeniedState.tsx`, `app/web/lib/navigation/paths.ts`, `paths.test.ts`, `crumbs.ts`, `crumbs.test.ts`, `e2e/tests/notifications.spec.ts`

## Self-Check: PASSED
