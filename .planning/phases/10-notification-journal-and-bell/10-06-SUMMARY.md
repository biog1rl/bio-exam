---
phase: 10-notification-journal-and-bell
plan: 06
subsystem: web
tags: [notifications, popover, swr, pagination, e2e]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: GET /api/notifications, POST /api/notifications/read-all (10-03), NotificationBell, notificationKeys, e2e-сид (10-05)
provides:
  - Popover со списком последних событий в NotificationBell
  - NotificationList, NotificationListSkeleton (next/dynamic)
  - formatNotificationTime, formatNotificationFullDate (lib/notifications/time.ts)
  - notificationKeys.list, NotificationItem, NotificationsPage, parseNotificationsPage, loadNotificationsPage, markAllNotificationsRead, refreshNotifications
affects: [10-07, 10-08]

requirements-completed: [NOTIF-02]

actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: 77e6260
plan_head_after: 77e6260

key-files:
  created:
    - app/web/lib/notifications/time.ts
    - app/web/lib/notifications/time.test.ts
    - app/web/components/notifications/NotificationList.tsx
    - app/web/components/notifications/NotificationListSkeleton.tsx
  modified:
    - app/web/lib/notifications/api.ts
    - app/web/lib/notifications/api.test.ts
    - app/web/components/notifications/NotificationBell.tsx
    - e2e/tests/notifications.spec.ts

key-decisions:
  - "Шапка поповера (заголовок, Прочитать все) живёт в NotificationBell, список грузится через next/dynamic: date-fns и локаль вне первой загрузки, фокус на заголовок ставится сразу при открытии"
  - "Прочитать все использует aria-disabled, а не disabled: фокус остаётся на кнопке после успеха"
  - "Догруженные страницы привязаны к объекту первой страницы (more.base === data) и сбрасываются при её смене; строки дедуплицируются по id"
---

# Phase 10 Plan 06: список уведомлений в поповере колокольчика Summary

Колокольчик открывает Popover со списком последних 20 событий: точка и вес 500 у непрочитанных, относительное время, «Показать ещё» по курсору, «Прочитать все», состояния загрузки, ошибки и пустоты, клавиатура и фокус по UI-SPEC.

## Что сделано

- Task 1 (tracer): `api.ts` (ключ списка, типы, `parseNotificationsPage`, `loadNotificationsPage`), `time.ts`, Popover в `NotificationBell` (фокус на заголовок через `onOpenAutoFocus`, перезапрос числа при открытии), `NotificationList` со строками-ссылками (`prefetch={false}`), спек: поповер с 20 строками.
- Task 2: `NotificationListSkeleton`, догрузка (`more` с привязкой к первой странице, повтор того же курсора, фокус на первую новую строку, когда страниц больше нет), `LoadErrorAlert` для первой загрузки и догрузки, пустое состояние, «Прочитать все» (`aria-disabled` при 0, `aria-busy` и `Loader2`, игнор повтора через ref, `refreshNotifications`, фокус на кнопке, `toast.error`). Спеки: пустой список у notify-student, «Показать ещё», клавиатура.
- Task 3: таблицы `time.test.ts` и `parseNotificationsPage` в `api.test.ts`; спеки на 1280/768/375 (поповер в окне, список прокручивается, шапка на месте, `horizontalOverflow` и `lowContrastTexts` пусты), длинное название (до 100 px высоты строки, ширина поповера 384 px), контраст числа (>= 4,5) и точки (>= 3, в покое и под наведением) через `elementContrast`, ошибки первой загрузки, догрузки и «Прочитать все» через `page.route`/`unroute`, последний тест «Прочитать все» (имя `Уведомления`, числа нет, префикса нет, поповер открыт, фокус на кнопке, контраст прочитанных строк).

## CodeGraph

- `codegraph impact NotificationBell`: 5 символов - сам `NotificationBell`, `AppLayout` и `RootLayout` (`app/web/app/layout.tsx`, не менялся). Сигнатура компонента не менялась.
- `codegraph affected` по файлам плана: `app/web/lib/notifications/api.test.ts`, `app/web/lib/notifications/time.test.ts` (e2e гонялись явно).

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/notifications`: 3 файла, 54 passed.
- `node --test scripts/web-requests-guards.test.mjs`: 4 passed.
- `yarn e2e tests/notifications.spec.ts tests/navigation.spec.ts`: 70 passed на `chromium-desktop` и `chromium-mobile`, без failed и flaky (три полных прогона подряд после правок).
- `yarn workspace @bio-exam/web build` и `yarn editor:budget`: `editor bundle OK`. Оба маршрута редактора: raw 2569932, gzip 721579 (бюджет raw 2732396, gzip 769896); до плана было raw 2566230, gzip 720906. Облегчение шапки через `next/dynamic` целиком не понадобилось, `scripts/editor-bundle-budget.json` не менялся.
- `yarn workspace @bio-exam/web typecheck`: чисто. `yarn lint`: одно предупреждение `react(purity)` на `new Date()` в `NotificationList` (то же, что в `TestLandingPageClient.tsx:110`; время в плане задано пересчитывать при каждом рендере, без таймера).
- `yarn format:check`: зелёный. `yarn verify`: `yarn verify: OK`.
- `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-06`: `10-06 changed only its files`.

## Deviations from Plan

- [Rule 1 - Bug в плане/сиде] Порядок строк в сиде 10-05 недетерминирован: все 21 событие `bell-student` создаются в одной транзакции с одинаковым `now()`, порядок идёт по `id` (случайный uuid). Поэтому «Новое уведомление» (chat.message) и длинное название не всегда попадают в первые 20 строк. Спеки подстроены: «Новое уведомление» проверяется после «Показать ещё» среди 21 строки; тест длинного названия сначала догружает все 21 строки. Сид (`e2e-seed.ts`) не менялся, он вне `files_modified` этого плана.
- В спеке ожидание размеров поповера идёт после завершения анимации открытия (`settled`, `getAnimations`): при `zoom-in-95` ширина на старте равна 95 % от 384 px.
- В клавиатурном тесте перед Tab ждём загрузки 20 строк: пока виден скелетон, Tab уходит мимо списка.
- Каркас скелетона: `ul` с `aria-busy` и соседний `span role="status"` внутри общего `div`, а не `span` внутри `ul` (недопустимая разметка).
- Коммитов нет по правилу пользователя: изменения в рабочем дереве, `actuals.commits: 0`.

## Known Stubs

Нет. Переход по строке ведёт на `/notifications/<id>`, страница появится в 10-07; спеки здесь переход не проверяют.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: `text` выводится React-узлом (T-10-25), список грузится только при открытом поповере и `prefetch={false}` (T-10-26, T-10-27), новых пакетов нет.

## Файлы к коммиту

- Создано: `app/web/lib/notifications/time.ts`, `time.test.ts`, `app/web/components/notifications/NotificationList.tsx`, `NotificationListSkeleton.tsx`
- Изменено: `app/web/lib/notifications/api.ts`, `api.test.ts`, `app/web/components/notifications/NotificationBell.tsx`, `e2e/tests/notifications.spec.ts`

## Self-Check: PASSED
