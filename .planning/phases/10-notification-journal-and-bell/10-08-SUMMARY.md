---
phase: 10-notification-journal-and-bell
plan: 08
subsystem: e2e-docs
tags: [notifications, e2e, skills, phase-gates]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: журнал и производители (10-02, 10-09), маршруты (10-04), колокольчик и список (10-05, 10-06), страница перехода (10-07)
provides:
  - Сквозная проверка критериев успеха 1-3 фазы в браузере на живом назначении
  - Сквозной случай D-18 (черновик: уведомление только после публикации)
  - Разделы навыков bio-exam-api, bio-exam-data, bio-exam-web и строки app/server/README.md
affects: []

requirements-completed: [NOTIF-01, NOTIF-02, NOTIF-05]

actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: 46e91d8
plan_head_after: 46e91d8

key-files:
  created: []
  modified:
    - e2e/tests/notifications.spec.ts
    - e2e/fixtures/seed.json
    - .agents/skills/bio-exam-api/SKILL.md
    - .agents/skills/bio-exam-data/SKILL.md
    - .agents/skills/bio-exam-web/SKILL.md
    - app/server/README.md

key-decisions:
  - "Периодическое обновление проверяется часами Playwright: два шага fastForward(3_000), затем fastForward(61_000) (см. отклонения)"
  - "Тест notify-draft-<p> создаёт сид, а не спек: повтор теста Playwright не упирается в занятый slug"
---

# Phase 10 Plan 08: сквозные проверки, навыки и ворота фазы Summary

Критерии успеха 1-3 фазы доказаны в браузере на настоящем назначении через API администратора; D-18 проверен на неопубликованном тесте; журнал уведомлений описан в трёх навыках и в README сервера; ворота фазы зелёные.

## Что сделано

- Task 1 (tracer): `describe` «notify-student» дополнен тестом перехода: ученик открывает поповер, нажимает строку `Вам назначен тест «Тест для уведомлений (<p>)»` и попадает на `/tests/e2e-notif/notify-test-<p>` с заголовком теста; у колокольчика имя `Уведомления` без числа, префикса `(` во вкладке нет; `goBack()` возвращает на `/dashboard`, `/notifications/` в истории нет. Помощники назначения и снятия (`notifyTestId`, `currentUserId`, `assignTo`, `unassignFrom`, `readAll`) остались в спеке, `e2e/fixtures/exam.ts` не менялся.
- Task 2: тесты `reassignment updates the bell on tab focus` (`expect.poll` с событием `focus` каждую секунду, без `reload`, строка непрочитанная и одна для теста, `Непрочитанное:` ровно один), `periodic refresh updates the bell without focus` (часы `page.clock.install()` до `goto`, без `reload` и без `focus`), отказ после снятия назначения (`Нет доступа к материалу`, `Возможно, назначение снято.`, названия теста в `main` нет), D-18 (`notify-draft-<p>`: после назначения `{ count: 0 }`, после `PATCH /api/tests/<id>/settings` с `isPublished: true` и перезагрузки `Уведомления, 1 непрочитанное`, строка ведёт на `/tests/e2e-notif/notify-draft-<p>`). В `seed.json` добавлен `notify-draft-desktop` и `notify-draft-mobile` (тема `e2e-notif`, не опубликован, один вопрос `single_choice`); прежние записи и порядок не менялись.
- Task 3: разделы `## Уведомления` в `bio-exam-api` и `bio-exam-web`, `## Журнал уведомлений` и последняя миграция 0027 в `bio-exam-data`, строка `/api/notifications` в таблице областей и правило доступа в `app/server/README.md`. Новых команд yarn в документах нет.

## Критерии успеха ROADMAP и где они доказаны

- Критерий 1 (назначение -> число -> строка -> тест, число и префикс уходят, «Назад» без `/notifications/<id>`): `notify-student` в `notifications.spec.ts`, два теста подряд.
- Критерий 2, обновление без перезагрузки: тест фокуса вкладки и тест часов (периодический опрос, 60 с).
- Критерий 2, «после входа»: покрыт первой загрузкой `/dashboard` под сессией из `e2e/auth.setup.ts` (настоящий `POST /api/auth/login`), тест 10-05 Task 1, шаг 6 (describe «notify-student»: новый контекст ученика, `goto('/dashboard')` после назначения -> `Уведомления, 1 непрочитанное` без ожидания опроса и без фокуса). Вход через форму в e2e не выполняется.
- Критерий 3: отказ после снятия назначения (`Нет доступа к материалу`, названия теста на странице нет).

## Расхождение критерия успеха 3 ROADMAP с D-09

В ROADMAP критерий 3 говорит о потере права при выходе ученика из группы («student left the group»). По D-09 выход из группы доступ не снимает, пока у ученика есть назначение: доступ определяет назначение, а не членство в группе (тест 10-04 фиксирует это поведение). Поэтому e2e снимает назначение, а не выводит ученика из группы. Формулировка ROADMAP не правилась (запрет плана).

## Заметка об ADR-0006

`docs/adr/0006-enforce-authorization-by-construction.md` не принят (файл остаётся неотслеживаемым, принадлежит другой сессии, не читался как правило). При его принятии маршруты `/api/notifications/:id/*` описываются как `self` (проверка владельца события через `ownedBy`, а доступ к объекту `open` проверяет заново).

## Проверки

- `yarn e2e tests/notifications.spec.ts tests/teacher-zone.spec.ts tests/navigation.spec.ts tests/reduced-motion.spec.ts tests/attempt-review-pending.spec.ts tests/sitemap.spec.ts`: 124 passed (оба проекта), без failed и flaky.
- `yarn e2e tests/notifications.spec.ts` после последней правки (`expect.poll` в одну строку): 66 passed (33 на проект).
- `node --test scripts/check-docs-structure.test.mjs`: 11 pass, 0 fail. `node scripts/check-docs-commands.mjs`: `check-docs-commands: OK`.
- `node scripts/check-migrations.mjs`: `check-migrations: OK`.
- `yarn verify`: `yarn verify: OK`.
- `yarn workspace @bio-exam/web build && yarn editor:budget`: `editor bundle OK` (raw 2571318, gzip 722395), строк `> budget` нет.
- Полный `yarn e2e`: второй прогон 348 passed (174 на `chromium-desktop` и 174 на `chromium-mobile`), failed и flaky нет. Первый прогон: 347 passed и один failed, `question-draft-durability.spec.ts:98` (LIFE-04, `chromium-desktop`): после `page.reload()` не нашёлся `getByRole('textbox')` редактора за 5 с. Спек и код редактора этим планом не затронуты, повторный полный прогон зелёный, изолированной причины не найдено (единичная нестабильность загрузки редактора после перезагрузки; наблюдать).
- `yarn format:check`: зелёный. `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-08`: `10-08 changed only its files`.
- `codegraph affected` по `e2e/tests/notifications.spec.ts` и `e2e/fixtures/seed.json`: два файла (сами спек и сид; тестов, которые их импортируют, нет). Серверные и web-тесты фазы (10-01...10-07, 10-09) прошли в `yarn verify`.
- Критерии приёмки: `grep -c "services/notifications"` в API-навыке 2, `0027_notification_journal` в навыке данных 2, `NotificationBell` в web-навыке 1, `/api/notifications` в README 2, строка «последняя - ...0027_notification_journal.sql» 1, «про `Request` не знает» 1; `reload(` в тестах фокуса и часов 0, `new Event('focus')` в тесте часов 0 и один раз в спеке (тест фокуса), `expect.poll`, `isPublished: true`, `page.clock.install()`, `fastForward(61_000)`, `goBack` на месте; `grep -c '"notify-draft-' e2e/fixtures/seed.json` = 2.

## Deviations from Plan

**1. [Rule 1 - Bug] fastForward в один шаг не запускает опрос SWR**
- **Found during:** Task 2
- **Issue:** одиночный `page.clock.fastForward(61_000)` не вызывал повторный запрос `unread-count`: запрос в окне дедупликации SWR (2 с, таймер очистки `FETCH[key]` тоже под часами) не стартует, пока таймер очистки не сработает отдельным шагом. С `runFor(61_000)` и с двумя шагами запрос уходит.
- **Fix:** сначала `fastForward(3_000)`, затем `fastForward(61_000)` (критерий приёмки по `fastForward(61_000)` сохранён); до этого тест ждёт первый ответ `unread-count` (`waitForResponse` до `goto`), чтобы таймер SWR уже был создан.
- **Files modified:** e2e/tests/notifications.spec.ts

**2. [Формат] `expect.poll` в одну строку**
- oxfmt переносил `expect\n.poll(`, а приёмка ищет `expect.poll`; опрос собран в переменную `bellName = expect.poll(...)`, затем `await bellName.toBe(...)`. Поведение прежнее.

Остальное выполнено как в плане. `e2e/fixtures/exam.ts` не менялся (помощники нужны только одному спеку).

## Шаги пользователя

Вне репозитория, после коммита плана (агенты доступа к серверу не имеют; ничего из этого не выполнялось):

1. До слияния определить, на какой миграции стоит прод: запрос из `10-01-PLAN.md` «User steps», шаг 1 (последняя строка `public.__drizzle_migrations`; 0026 - `created_at = 1791239364196` или `hash` 0026 из `app/server/drizzle/migrations-manifest.json`).
2. Слить в master после зелёных ворот. Прод не на 0026 (путь по умолчанию: фаза 9 ещё не выкачена): фазы 9 и 10 сливаются одним пакетом и выкатываются по правилам 0026 из профиля сервера (`10-01-PLAN.md` «User steps», шаг 3): `deploy.sh` вручную вне окна сдач, до выкатки репетиция на свежем дампе под ролью `bio_exam`; при `DEPLOY_FAILED` после переключения или «откат выполнен» не оставаться на прошлом образе, а восстановить `predeploy-*.dump` этой выкатки или выкатить исправление вперёд. Откат одного образа недопустим.
3. Прод уже на 0026: автовыкатка пропускает коммиты с миграциями, `deploy.sh` вручную вне окна сдач; 0027 только добавляет таблицы, поэтому откат одного образа на `$PREV` (с 0026) после неё допустим.
4. Образ без 0027 не выкатывать: маршруты назначения теста падают, а `GET /api/notifications/unread-count` отвечает 500 на каждой странице у каждого вошедшего пользователя.
5. После выкатки проверки из `10-01-PLAN.md` «User steps», шаг 5, затем назначить тест пробному ученику и увидеть колокольчик с числом.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: изменены спек, сид e2e и документы.

## Файлы к коммиту

- `e2e/tests/notifications.spec.ts`
- `e2e/fixtures/seed.json`
- `.agents/skills/bio-exam-api/SKILL.md`
- `.agents/skills/bio-exam-data/SKILL.md`
- `.agents/skills/bio-exam-web/SKILL.md`
- `app/server/README.md`

## Self-Check: PASSED

Все шесть файлов изменены (`git status --short`), HEAD `46e91d8` на `dev`, коммитов плана нет (`commits: 0` по правилу пользователя).
