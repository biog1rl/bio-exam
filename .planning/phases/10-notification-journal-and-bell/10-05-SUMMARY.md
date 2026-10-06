---
phase: 10-notification-journal-and-bell
plan: 05
subsystem: web
tags: [notifications, bell, swr, document-title, e2e-seed]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: GET /api/notifications/unread-count, recordNotifications (планы 10-01, 10-03)
provides:
  - notificationKeys, parseUnreadCount, loadUnreadCount (lib/notifications/api.ts)
  - badgeLabel, titlePrefix, withTitlePrefix, bellAccessibleName (lib/notifications/format.ts)
  - NotificationBell и UnreadTitlePrefix в шапке AppLayout
  - сид e2e: тема e2e-notif, bell-student-<p>, notify-student-<p>, notify-test-<p>, блок notifications
affects: [10-06, 10-07, 10-08]

requirements-completed: [NOTIF-02, NOTIF-05]

actuals:
  tokens: 5600
  tasks: 3
  commits: 0
plan_head_before: 2f2d44f
plan_head_after: 2f2d44f

key-files:
  created:
    - app/web/lib/notifications/api.ts
    - app/web/lib/notifications/api.test.ts
    - app/web/lib/notifications/format.ts
    - app/web/lib/notifications/format.test.ts
    - app/web/components/notifications/NotificationBell.tsx
    - app/web/components/notifications/UnreadTitlePrefix.tsx
    - e2e/tests/notifications.spec.ts
  modified:
    - app/web/components/AppLayout/AppLayout.tsx
    - app/server/src/scripts/e2e-seed.ts
    - e2e/fixtures/seed.json

key-decisions:
  - "Число одно на шапку и вкладку: NotificationBell держит единственный useSWR и передаёт count в UnreadTitlePrefix, отдельного запроса нет"
  - "Колокольчик пока кнопка без поповера; 10-06 сделает её триггером Popover"
  - "Контраст числа на колокольчике измеряется в спеке по вычисленным стилям (lowContrastTexts пропускает aria-hidden), порог 4,5:1"
---

# Phase 10 Plan 05: колокольчик с числом и префикс заголовка вкладки Summary

Колокольчик с числом непрочитанных (0 - нет числа, 1...9, «9+») и точным именем с `Intl.PluralRules('ru')` в шапке `AppLayout` перед поиском, число в заголовке вкладки через `MutationObserver`, сид e2e с учениками колокольчика и уведомлений и спек, который проверяет всё это на desktop и mobile.

## Что сделано

- Task 1 (tracer): сид (тема `e2e-notif`, аккаунты `bell-student-<p>` и `notify-student-<p>` в конце `accounts`, тест `notify-test-<p>` без назначений), `api.ts`, `format.ts`, `NotificationBell`, `<NotificationBell />` перед `<SearchButton />`, первый спек: администратор назначает тест через API, ученик на `/dashboard` видит `Уведомления, 1 непрочитанное` и текст `1`.
- Task 2: `SeedNotification` и блок `notifications` в `e2e-seed.ts` (динамический импорт `recordNotifications` после проверки окружения, одна транзакция на проект, неизвестный получатель - ошибка сида), 21 событие `bell-student-<p>` (18 обычных названий, длинное 178 знаков со словом 44 знака, с кавычками, и `chat.message`), `format.test.ts` и `api.test.ts` таблицами `test.each`, спек `9+` и имя `Уведомления, 21 непрочитанное`.
- Task 3: `titlePrefix`, `withTitlePrefix`, `UnreadTitlePrefix` (запись только при отличии строки, `disconnect()` при смене префикса, отдельный эффект снимает префикс при размонтировании), спеки префикса после клиентского перехода `/sitemap` -> `/tests` и шапки на 375 px.

## CodeGraph

- `codegraph impact AppLayout`: 3 символа - сам `AppLayout` и `RootLayout` в `app/web/app/layout.tsx` (файл не менялся). В `AppLayout` добавлены импорт и один элемент в правой группе шапки.
- Функции сида не менялись по сигнатурам: добавлены тип, импорт и блок перед итоговой строкой в `main`.
- `codegraph affected` по файлам плана: `app/web/lib/notifications/format.test.ts` (серверные и e2e-файлы он не видит; e2e гонялись явно).

## Вывод сида

```
e2e-seed: users=128 tests=24 questions=38 prompts=38 attempts=4 notifications=42
```

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/notifications`: 2 файла, 30 passed.
- `node --test scripts/web-requests-guards.test.mjs`: 4 passed.
- `yarn e2e tests/notifications.spec.ts`: 22 passed (14 setup + 4 теста на `chromium-desktop` + 4 на `chromium-mobile`), без failed и flaky.
- `yarn e2e tests/notifications.spec.ts tests/navigation.spec.ts tests/reduced-motion.spec.ts`: 50 passed, без failed и flaky.
- `yarn workspace @bio-exam/web build` и `yarn editor:budget`: `editor bundle OK`, оба маршрута raw 2566230, gzip 720906 при бюджете raw 2732396, gzip 769896; `next/dynamic`-облегчение не понадобилось, `scripts/editor-bundle-budget.json` не менялся.
- `yarn format:check`: зелёный. `yarn verify`: `yarn verify: OK`.
- `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-05`: `10-05 changed only its files`.
- `git diff HEAD --quiet -- app/web/app/layout.tsx scripts/editor-bundle-budget.json`: код 0.
- Контраст числа на колокольчике измерен в спеке по вычисленным цветам, порог 4,5:1, зелёный.

## Deviations from Plan

Минимальные:

- Добавлена проверка контраста числа в спеке (`badgeContrast`): `lowContrastTexts` пропускает `aria-hidden`, а число скрыто для чтения с экрана, поэтому правило проекта о замере по вычисленным стилям иначе не покрывало бы число. Файл `e2e/fixtures/page-checks.ts` не тронут.
- `e2e/fixtures/accounts.ts` не менялся: спеку нужные названия из сида не требовались (пункт плана «если нужно»).
- Коммитов нет по правилу пользователя: изменения в рабочем дереве, `actuals.commits: 0`, `plan_head_after = plan_head_before`.
- Токены в `actuals` - оценка chars/4 по реальному diff (22 тыс. знаков), а не по ходу диалога.

## Known Stubs

Нет. Кнопка колокольчика пока без поповера и без обработчика нажатия: это сделает 10-06 (список, «Прочитать все»), в плане это зафиксировано.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: ключ SWR содержит `userId` (T-10-22), запись заголовка только при отличии строки и e2e после клиентского перехода (T-10-23), сид по-прежнему за `assertE2eEnvironment` и динамическими импортами (T-10-24).

## Файлы к коммиту

- Создано: `app/web/lib/notifications/api.ts`, `api.test.ts`, `format.ts`, `format.test.ts`, `app/web/components/notifications/NotificationBell.tsx`, `UnreadTitlePrefix.tsx`, `e2e/tests/notifications.spec.ts`
- Изменено: `app/web/components/AppLayout/AppLayout.tsx`, `app/server/src/scripts/e2e-seed.ts`, `e2e/fixtures/seed.json`

## Self-Check: PASSED
