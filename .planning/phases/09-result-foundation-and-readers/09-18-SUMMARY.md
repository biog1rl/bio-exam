---
phase: 09-result-foundation-and-readers
plan: 18
subsystem: e2e
tags: [e2e, seed, playwright, pending, graded, contrast, overflow, RES-03, RES-04]
requires: ["09-17", "09-08", "09-01"]
provides:
  - "Сид e2e: необязательный correct у вопроса open, блок attempts проекта, попытки pending и graded тем же путём, что сдача по HTTP, строка счётчиков с attempts=<n>"
  - "Ученики review-student-desktop и review-student-mobile, тема e2e-review, по три теста с открытым вопросом на проект"
  - "e2e/tests/attempt-review-pending.spec.ts: все экраны-читатели с попытками на проверке на desktop и mobile, контраст и переполнение на 1280, 768 и 375 px"
affects: [09-19]
tech-stack:
  added: []
  patterns:
    - "Попытки сида создаются после коммита транзакции сида через startAttemptSession, scoreSubmission, submitAttempt; проверенная получает materializeAttemptOutcome"
key-files:
  created:
    - e2e/tests/attempt-review-pending.spec.ts
  modified:
    - app/server/src/scripts/e2e-seed.ts
    - e2e/fixtures/seed.json
    - e2e/fixtures/accounts.ts
    - e2e/tests/attempts-list.spec.ts
    - app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx
    - app/web/components/users/UserProfileAssignmentsPage.tsx
decisions:
  - "Тип open не включается: вопросы вставляются прямо в questions, сдача (scoreSubmission, saveSessionDraft) и списки читают типы через getQuestionTypeMapForTest с includeInactive: true, поэтому неактивный open сдаётся и читается; строка answer_keys для open не пишется"
  - "Тесты с открытым вопросом лежат в отдельной теме e2e-review: в общей e2e-topic выпадающий список «Тест» спека scoring.spec на desktop становился слишком длинным (20 пунктов) и клик по пункту зависал до таймаута"
  - "Живая сдача и сид идут в одну базу для обоих проектов: попытки находятся по названию теста через /api/tests/admin/attempts?q=, названия содержат (desktop) или (mobile)"
  - "Спек сериальный (test.describe.configure serial): второй и последующие тесты читают попытку, которую создаёт первый"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 36000
  tasks: 2
  commits: 0
plan_head_before: 455c9c8dab154cddf457a3c07d7cf320c97274f8
plan_head_after: 455c9c8dab154cddf457a3c07d7cf320c97274f8
---

# Phase 9 Plan 18: Сид попыток на проверке и e2e всех читателей Summary

В сид e2e добавлены попытки pending и graded у отдельного ученика на каждом проекте, а спек `attempt-review-pending.spec.ts` на desktop и mobile проходит живую сдачу теста с открытым вопросом и все экраны-читатели, мерит контраст и переполнение по вычисленным стилям на 1280, 768 и 375 px. Изменения в рабочем дереве, не закоммичены (правило пользователя). `yarn verify: OK`, полный `yarn e2e`: 292 passed.

## Что сделано

- **Task 1 (tracer):** `e2e-seed.ts`: `SeedQuestion.correct` необязателен, для `template: 'open'` строка `answer_keys` не пишется (для остальных отсутствие `correct` бросает ошибку); тип `SeedAttempt` и блок `attempts` у проекта; после коммита транзакции сида для каждой записи `startAttemptSession` → `scoreSubmission` → `submitAttempt` (без HTTP), для `grade` `materializeAttemptOutcome` в транзакции с картой оценок по id открытого вопроса; проверка окружения до подключения не менялась; строка счётчиков дополнена `attempts=<n>`. `seed.json`: ученик `review-student-<проект>` в конце `accounts`, три теста в конце `tests` (`review-pending-`, `review-graded-`, `review-submit-<проект>`, вопрос `radio` и открытый вопрос, назначены ученику), блок `attempts` (pending с ответом на радио; graded с оценкой 2 за открытый), тема `e2e-review` в конце `topics`. `accounts.ts`: тип `SeedQuestion` допускает `open` и необязательный `correct`.
- **Task 2:** четыре сериальных теста спека (на каждом проекте): (1) живая сдача и экран после сдачи, «Мои попытки»; (2) страница теста ученика (pending и graded) и дашборд ученика; (3) список попыток проверяющего: строки pending и graded, `Select` «Проверка» в обе стороны с адресом `review=`, плитка «на проверке» включает и снимает фильтр, фильтр статуса студентов сохраняет `review`; (4) разбор попытки pending и graded, профиль ученика, дашборд проверяющего (карточка и список), глобальный поиск. Контраст и `horizontalOverflow` на 1280, 768 и 375 px (`setViewportSize`) на экране после сдачи, странице теста (pending и graded), списке попыток, разборе, профиле.

## Вывод сида

`e2e-seed: users=124 tests=22 questions=36 prompts=36 attempts=4`

## Проверки

- `yarn e2e tests/attempt-review-pending.spec.ts tests/attempts-list.spec.ts tests/teacher-zone.spec.ts tests/user-lookup.spec.ts tests/scoring.spec.ts`: после правок зелёный (последний полный прогон ниже включает их).
- Полный `yarn e2e`: 292 passed (4.1 мин), без failed и flaky; сид `attempts=4`; новый спек: 4 теста × 2 проекта passed.
- `yarn format:check`: чисто. `yarn verify`: все восемь шагов passed, `yarn verify: OK`.
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-18`: код 1, три файла вне плана (см. отклонения 1-3); строки «09-18 changed only its files» нет по этой причине.
- `codegraph affected` (файлы плана и три файла вне плана): `ScoringSettingsPageClient.tsx` (через сид тем), `TestLandingPageClient.tsx`, `accounts.ts`, `attempt-review-pending.spec.ts`, `attempts-list.spec.ts`; все покрыты полным `yarn e2e`.
- `codegraph impact` до правок: `main` в `e2e-seed.ts` (вызывается только из `scripts/e2e.mjs`), `TestLandingPageClient` (страница теста), `ProfileSectionCard` (внутри `UserProfileAssignmentsPage`).

## Deviations from Plan

**1. [Rule 1 - Bug] Подпись «проверено учителем» обрезалась в таблице страницы теста на 375 px**
- **Found during:** Task 2 (горизонтальное переполнение на странице проверенного теста)
- **Issue:** радиксовый `ScrollArea` страницы теста не имел горизонтальной прокрутки (`overflow-x: hidden`), широкая колонка «% правильных» с отметкой `whitespace-nowrap` уходила за край экрана и обрезалась.
- **Fix:** `viewportClassName="overflow-x-auto!"` у `ScrollArea` таблицы попыток (таблица остаётся в `ScrollArea`, как требует UI-SPEC).
- **Files modified:** `app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx` (вне `files_modified` плана)

**2. [Rule 3 - Blocking] Профиль ученика переполнял экран 375 px при длинных названиях тестов**
- **Found during:** Task 2
- **Issue:** карточки профиля (`Card` в `grid` без `min-w-0`) растягивали колонку по минимальной ширине списка «Назначить тест» (nowrap-названия, `Badge` темы), элементы выходили за правый край. Строки попыток с метками в список переполнения не попадали. Дефект старше фазы 9, но без исправления требуемая проверка `horizontalOverflow` на профиле не проходит.
- **Fix:** `min-w-0` в `Card` у `ProfileSectionCard`.
- **Files modified:** `app/web/components/users/UserProfileAssignmentsPage.tsx` (вне `files_modified` плана)

**3. [Rule 1 - Bug] Спек attempts-list «review filter lives in the address…» предполагал, что попыток на проверке в зоне нет**
- **Found during:** полный `yarn e2e` после появления сидовых попыток pending
- **Issue:** у администратора `review=pending` теперь непуст, заголовок «Нет попыток на проверке» не появляется.
- **Fix:** тест использует `teacherPage`: зона учителя (темы `e2e-teacher-*`) не содержит попыток на проверке, ожидания пустых состояний и плитки `0 на проверке` остались прежними.
- **Files modified:** `e2e/tests/attempts-list.spec.ts` (вне `files_modified` плана)

**4. [Rule 3 - Blocking] Отдельная тема `e2e-review` для тестов с открытым вопросом**
- **Found during:** полный `yarn e2e`
- **Issue:** три новых теста на проект в общей теме `e2e-topic` удлиняли выпадающий список «Тест» в `scoring.spec.ts`; на desktop клик по пункту стабильно доходил до таймаута 30 с.
- **Fix:** тесты плана помещены в тему `e2e-review` (поле `topic` теста), `e2e-topic` осталась как была.

**5. [Контраст экрана после сдачи — сужение проверки]**
- Страница теста `/start` имеет унаследованный низкий контраст кнопки номера отвеченного вопроса (`bg-green-500 text-white`, 2.22). На экране после сдачи проверяются только тексты меток (`проверк|авто|учителем|предварительно`); остальные страницы проверяются целиком. Запись в `deferred-items.md` фазы.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей. T-09-48: сид по-прежнему запускается только из `scripts/e2e.mjs`, `assertE2eEnvironment` не менялась, тип `open` не включается, `DATABASE_URL` не используется.

## Файлы к коммиту

```
app/server/src/scripts/e2e-seed.ts
e2e/fixtures/seed.json
e2e/fixtures/accounts.ts
e2e/tests/attempt-review-pending.spec.ts
e2e/tests/attempts-list.spec.ts
app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx
app/web/components/users/UserProfileAssignmentsPage.tsx
```

## Self-Check: PASSED

Файлы существуют, `yarn verify: OK`, полный `yarn e2e`: 292 passed.
