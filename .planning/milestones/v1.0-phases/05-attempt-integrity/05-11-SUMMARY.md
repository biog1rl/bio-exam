---
phase: 05-attempt-integrity
plan: 11
subsystem: verification
tags: [node-test, guard-test, access-policy, exam-core, readme, runbook]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-04
    provides: "доступ к попытке через canReadTest и testScope из services/access-policy/scope.ts, services/attempt-sessions"
  - phase: 05-06
    provides: "контракт submit: SubmitAttemptRequestSchema, SUBMIT_ERROR_CODES, 409 и 422, повтор по clientAttemptId"
  - phase: 05-08
    provides: "services/scored-attempt: readAttemptView, readAdminAttemptView, чтение версии 1, canReviewAttempt в разборе администратора"
  - phase: 05-10
    provides: "web без computeVerdicts и догадок о ключе, AttemptReviewData = AdminAttemptView"
provides:
  - "scripts/attempt-integrity-guards.test.mjs: охранный тест целостности попытки в шаге script-tests yarn verify, с пробой на копии во временном каталоге"
  - "scripts/exam-core-no-private-copies.test.mjs: группа имён Phase 5 D-16 (14 имён)"
  - "app/server/README.md: подраздел «Попытка теста» в «Правилах доступа»"
  - "runbook выкатки фазы 5 (D-25) в этом SUMMARY"
affects: [06, 07, 07.1, 08]

estimate:
  tokens: 60000
  tasks: 3
actuals:
  tokens: 4500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Функции охранного теста принимают корень сканирования: тот же код проверяет репозиторий и копию во временном каталоге"
    - "Срез обработчика маршрута от строки пути до следующего router. или конца файла"

key-files:
  created:
    - scripts/attempt-integrity-guards.test.mjs
  modified:
    - scripts/exam-core-no-private-copies.test.mjs
    - app/server/README.md

key-decisions:
  - "Охранный тест на коде фазы 5 нашёл 0 нарушений, включая hasPermission(req, 'tests.read') вне access-policy; область проверок не сужалась"
  - "public.ts импортирует canReadTest и testScope из services/access-policy/index.js, а index.ts реэкспортирует их из ./scope.js; тест проверяет оба звена, public.ts не менялся"
  - "Все 14 имён группы Phase 5 D-16 объявлены только в packages/exam-core/src; ни одно имя из группы не убиралось"
  - "Проба охранного теста оформлена отдельным test в том же файле и идёт в yarn verify"

requirements-completed: [ATT-01, ATT-06, SCORE-02, SCORE-04]

duration: 45min
completed: 2026-10-04
---

# Phase 5 Plan 11: Охранный тест целостности попытки, README попытки и runbook выкатки D-25 Summary

Результат фазы 5 теперь держит охранный тест `scripts/attempt-integrity-guards.test.mjs`, он входит в шаг `script-tests` команды `yarn verify`. Тест проверяет четыре вещи. Web не считает вердикты, не угадывает видимость ключа и не выбирает статус сам. В маршрутах `testAttempts.results` читает только `services/scored-attempt`, а `answer_keys` не читается ни в маршрутах попытки, ни в обработчике разбора. Назначения в маршрутах запрашиваются только в управлении назначениями. Вне `access-policy` нет `hasPermission(req, 'tests.read')`. Проверка приватных копий `exam-core` знает 14 новых имён фазы. В `app/server/README.md` появился подраздел «Попытка теста» с правилом доступа, сессией, сроком и контрактом submit, а также с хранением фактов и чтением старых попыток. Runbook выкатки D-25 записан ниже и не выполнялся.

## Коммит

Коммит не выполнялся (правило пользователя), изменения лежат в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

- `scripts/attempt-integrity-guards.test.mjs` (новый)
- `scripts/exam-core-no-private-copies.test.mjs`
- `app/server/README.md`

## Отпечаток

- До первой правки: `fingerprint 05-11: 0 paths` (`.planning/commit-snapshots/before-05-11/fingerprint.json`), дерево чистое на `583a0e0`.
- После плана в `git status` три файла плана, других изменений нет (проверка ниже, раздел «Итоговые гейты»).

## Задачи

### Task 1 (tracer): охранный тест и новые имена

`scripts/attempt-integrity-guards.test.mjs` (node:test, без комментариев). Обход каталогов и пропуск `*.test.*`, `*.spec.*`, `node_modules`, `.next` и прочих каталогов сборки такой же, как в `exam-core-no-private-copies.test.mjs`. Каждая проверка — отдельный `test` со списком нарушений `путь:строка: метка: текст`:

| Тест | Что проверяет |
| --- | --- |
| детекторы | образцы запрещённых и разрешённых строк для каждой проверки, срез обработчика |
| web | в `app/web` нет `computeVerdicts(`, `getQuestionStatus`, `results: unknown[]` (просканировано не меньше 100 файлов) |
| видимость ключа | в `app/web/components/tests` и `app/web/lib/tests` нет `correctAnswer != null \|\|`, `isCorrect ? studentAnswer`, `showCorrectAnswer={`, `showCorrectAnswer ?`, `showCorrectAnswer &&` |
| TestRunner | нет `earnedPoints > 0 ?` |
| results | `testAttempts.results` в `app/server/src` только в `services/scored-attempt/`, и там чтение есть |
| маршруты попытки | `routes/tests/public.ts` не упоминает `answerKeys` и `testAssignments` |
| разбор администратора | в теле обработчика `'/admin/attempts/:attemptId'` (до следующего `router.` или конца файла) нет `answerKeys`, есть `canReviewAttempt(` |
| назначения | `.from(testAssignments)` в `app/server/src/routes` только в `routes/tests/assignments.ts` и `routes/users/index.ts` |
| tests.read | в `app/server/src` вне `services/access-policy/` нет `hasPermission(req, 'tests.read')` |
| scope | `public.ts` импортирует `canReadTest` и `testScope` из `services/access-policy`, `access-policy/index.ts` реэкспортирует их из `./scope.js`, `public.ts` вызывает `canReadTest(` и `testScope(` |
| проба | см. ниже |

На коде фазы 5 находок нет ни по одной проверке, в том числе по `hasPermission(req, 'tests.read')`. Область не сужалась.

`scripts/exam-core-no-private-copies.test.mjs`: в `PRIVATE_COPY_NAMES` добавлена группа `Phase 5 D-16` из 14 имён: `SubmitAttemptRequestSchema`, `SubmitAttemptErrorSchema`, `SUBMIT_ERROR_CODES`, `ATTEMPT_GRACE_PERIOD_MINUTES`, `QuestionVerdictsSchema`, `QuestionStatusSchema`, `ScoredQuestionFactSchema`, `AttemptFactsSchema`, `LegacyAttemptResultItemSchema`, `LegacyAttemptResultsSchema`, `AttemptQuestionViewSchema`, `AttemptViewSchema`, `AdminAttemptViewSchema`, `scoreQuestionFacts`. До правки проверено: каждое имя объявлено только в `packages/exam-core/src` (`attempt-result.ts`, `scoring.ts`). Совпадений с локальными переменными в `app/web` и `app/server/src` нет, ни одно имя не убиралось. `questionStatus` в группу не входит.

`node --test scripts/attempt-integrity-guards.test.mjs scripts/exam-core-no-private-copies.test.mjs`: `tests 16`, `pass 16`, `fail 0`.

#### Проба охранного теста

Проба — тест «проба: вставка запрещённой строки в копию файла во временном каталоге даёт нарушение с путём файла». Он создаёт каталог через `fs.mkdtempSync(os.tmpdir())`, копирует туда три файла с теми же относительными путями и дописывает в конец каждого запрещённую строку. Затем вызывает функции проверки с корнем во временном каталоге. Каталог удаляется в `finally`, а повторный вызов на репозитории возвращает пустой список. Рабочее дерево не менялось: после пробы `git status` показывал только файлы плана. Вывод нарушений (снят разовым прогоном с `console.log` на копии теста в scratchpad):

- web, `computeVerdicts(`: `app/web/components/tests/TestRunner.tsx:1036: вызов computeVerdicts(: вердикты приходят в виде попытки с сервера: const probeVerdicts = computeVerdicts({})`
- server, `hasPermission(req, 'tests.read')`: `app/server/src/routes/tests/public.ts:685: hasPermission(req, 'tests.read') вне access-policy: доступ к тесту через canReadTest и testScope: const probeAccess = await hasPermission(req, 'tests.read')`
- сверх плана, разбор администратора: `app/server/src/routes/tests/index.ts:2696: answerKeys в обработчике разбора: разбор строит services/scored-attempt: const probeKeys = answerKeys`

Тест проверяет, что нарушение ровно одно и начинается с пути файла.

### Task 2: README и итоговые гейты

В `app/server/README.md`, раздел «Правила доступа», добавлен подраздел «Попытка теста». Он написан по коду `services/attempt-sessions`, `services/scored-attempt`, `routes/tests/public.ts` и `packages/exam-core/src/attempt-result.ts`, сухо и без истории. Содержание:

- правило «назначен или право `tests.read`», функции `canReadTest`, `testScope`, `canReviewAttempt`, 404 и 403;
- одна открытая сессия на пару (`test_sessions_open_uniq`);
- черновик и его 404;
- просрочка: `now()` БД, лимит плюс 2 минуты (`ATTEMPT_GRACE_PERIOD_MINUTES`), проверка на момент прихода submit до оценки, закрытие `expired` при submit или `start`, `superseded` от миграции 0022;
- контракт submit: 400, 403, 404 (в том числе `superseded`), 409 `ATTEMPT_ALREADY_SUBMITTED`, 422 `TIME_EXPIRED`, 200 и повтор по `clientAttemptId`, `test_attempts_session_id_uniq`;
- факты `results_version = 2` и вид студента и администратора;
- чтение версии 1 без перезаписи, `AttemptResultsShapeError`.

Новых команд `yarn` нет. `check-docs-commands: OK`. В README есть `ATTEMPT_ALREADY_SUBMITTED`, `TIME_EXPIRED`, `canReadTest`, `results_version`.

Сверка с кодом: сессия `superseded` на submit даёт 404 (`rejectClosedSession` → `sessionNotFound`), `expired` даёт 422. Текст плана с этим совпадает.

#### Итоговые гейты

Все прогоны выполнены в worktree `wt-phase-05` после последней правки файлов плана.

- **`yarn verify` — `yarn verify: OK`.** Все восемь шагов `passed`: `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`. Тестовые файлы Vitest: rbac 1, exam-core 11, web 24, server 35. В `script-tests` 158 тестов, все прошли, `fail 0`, новый охранный тест входит в их число.
- **`yarn e2e`.** Первый прогон: 131 тест прошёл, 1 упал. Упал `[chromium-mobile] auth.spec.ts:88 student logs in and logs out @flow1`: через 5 с страница осталась на `/login`, кнопка в состоянии «Вход…» `[disabled]`, то есть вход не успел завершиться. В это же время на машине шёл чужой Playwright-прогон другого проекта (`/Volumes/T7/personal/ielts`, `test-with-db.mjs e2e`). План не меняет код, который исполняется в e2e: два скрипта `node:test` и README. Полный повтор `yarn e2e` дал **132 passed (1.6m)**, exit 0, по 64 теста на `chromium-desktop` и `chromium-mobile`.
- `rg -n "@known-defect|test\.fail\(" e2e/tests` ничего не нашёл, вывод: `no expected failures`.
- **`cd app/server && node vercel-build.cjs`** — exit 0, строка `=== Build completed successfully! ===`.
- **Проверка отпечатка** с allow-list из трёх файлов плана: `05-11 changed only its files`.

## CodeGraph (D-23)

`codegraph affected` (индекс основного дерева `/Users/kdvornichenko/bio-exam/.codegraph`, он отстаёт от worktree) по `git diff --name-only 93de4ad HEAD` (64 файла фазы 5 от коммита перед 05-01 до `583a0e0`). Файлы этого плана не входят: два скрипта `node:test` и README в графе зависимостей не участвуют. Результат — 83 файла:

- server, 33 файла:
  - DB-тесты: `answer-keys-jsonb`, `attempt-session-migration`, `session-backfill`, `timestamps`;
  - `logger.test.ts`, `question-type-resolver.ts`;
  - auth: `auth-characterization`, `auth-known-defects`, `login-throttle`, `me-requirePerm-parity`, `refresh-rotation`, `session-revocation`;
  - tests: `access-routes`, `assignments.ts`, `attempt-access-matrix`, `attempt-known-defects`, `attempt-races`, `attempt-review`, `attempt-submit`, `attempt-time-limit`, `attempt-view-leak`, `exam-flow`, `index.ts`, `public.ts`;
  - прочее: `uploads.test.ts`, `access-policy/policy.test.ts`, `access-policy/scope.test.ts`, `scored-attempt/legacy.test.ts`, `scored-attempt/view.test.ts`, `session/cookies.test.ts`, три теста `storage`;
- web admin, 12 файлов: `TestsClient`, `TopicTestsClient`, `QuestionEditorPageClient`, `NewQuestionDraftPageClient`, `QuestionEditor`, `TopicFormDialog`, `test-editor-api`, `useTestEditorModel`, `QuestionTypesPageClient`, `QuestionTypeDetailsPageClient`, `question-validation`, `types/index`;
- web попытки и разбора, 24 файла: `AttemptReview`, `MdxRenderer`, `TestRunner`, восемь файлов `attempt-review/*` и снимок, `attempt-submit-flow` и тест, `client-attempt-id` и тест, `runner-result-card` и тест, `lib/tests/api.ts`, `lib/tests/types.ts`, `lib/session/{client,keep-alive,server}.test.ts`, `proxy.test.ts`;
- e2e, 5 файлов: `fixtures/exam.ts`, `auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`, `session.spec.ts`;
- exam-core, 6 файлов: `answer`, `attempt-result`, `authoring`, `invariants`, `review`, `scoring` (тесты);
- scripts: `check-migrations.test.mjs`.

Все unit- и DB-тесты из списка идут в `yarn verify`, e2e — в `yarn e2e`. Оба прогона ниже.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Литерал кавычки в охранном тесте**
- **Found during:** Task 1
- **Issue:** при записи файла `'''` превратился в `'''`, `oxfmt` упал на незакрытой строке.
- **Fix:** константа `q` возвращена к `'''`, как в `auth-no-role-string-checks.test.mjs`.
- **Files modified:** `scripts/attempt-integrity-guards.test.mjs`

**2. [Rule 1 - Bug] Проверка импорта scope.ts**
- **Found during:** Task 1
- **Issue:** первая версия ждала импорт из `services/access-policy/scope.js`, а `public.ts` импортирует `canReadTest` и `testScope` из `services/access-policy/index.js`, который реэкспортирует их из `./scope.js`.
- **Fix:** тест принимает импорт из `index.js` или `scope.js` и отдельно проверяет реэкспорт в `access-policy/index.ts`. `public.ts` не менялся: он вне файлов плана, и правило «доступ только через функции scope.ts» соблюдено.
- **Files modified:** `scripts/attempt-integrity-guards.test.mjs`

### Решения исполнителя (автономно)

1. **Проба внутри охранного теста.** План разрешал пробу разовым запуском. Чтобы проверки не перестали срабатывать незаметно, проба оформлена отдельным `test` и идёт в `yarn verify`. Отдельный helper-модуль не создавался: его нет в списке файлов плана.
2. **Третья проба сверх плана.** Кроме двух обязательных проверок проба покрывает `answerKeys` в обработчике разбора администратора, чтобы проверить и срез обработчика.
3. **`getQuestionStatus` ловится по любому упоминанию идентификатора**, а не только по объявлению. Это строже плана, на текущем дереве находок нет.
4. **`hasPermission` с двойными кавычками** тоже считается нарушением.

## Known Stubs

Нет.

## Threat Flags

Нет: план добавляет только тесты и документацию.

## Deferred human verification

**Не выполнено, ждёт пользователя; исполнитель не одобрял.** Task 3 плана (`checkpoint:human-verify`, `gate="blocking-human"`) не выполнялся и не одобрялся. Агент к проду не подключался, миграции не применял, ничего не деплоил.

### Runbook выкатки фазы 5 (D-25, ревью R1)

Порядок строгий: read-only SQL → preview → одно тихое окно → миграции непосредственно перед деплоем → web → сразу server. Откат только парой: server, затем web.

1. **Read-only SQL на проде** (ничего не меняют):
   - `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3;` — верхняя строка `created_at = 1791095839799` (0021). Иначе STOP и решение по истории миграций до применения 0022 (05-03).
   - `05-CONTEXT.md` `<specifics>` п. 1: `active_open_sessions`, используется в шаге 3.
   - п. 2: `groups`, `extra_open`, `older_with_fresher_draft`, `attempts_shared_by_sessions`. Если `older_with_fresher_draft > 0`, решить до миграций: более свежий черновик останется в строке закрытой `superseded` сессии, приложение к нему не вернётся.
   - п. 3: `stuck_expired_sessions`.
   - п. 4: `attempts_without_assignment`.
   - п. 6: `key_stored`, `key_from_history`, `key_unknown`, `attempts_with_key_changed_after_submit` и запрос R2 из `03-11-SUMMARY.md`.
   - п. 7 и проверка типов полей элементов `results` из 05-08: ожидается одна комбинация `object`, `string`, `boolean`, `number`, `number`, все `questionId` — uuid. Иначе разбор такой попытки ответит 500, решить до выкатки.
   - Проверка формы `telemetry` старых попыток из 05-08: ожидается одна строка `number, number, number, true`. Иначе разбор такой попытки ответит 500.
   - Решения по `older_with_fresher_draft` и по форме старых `results` и `telemetry` принимаются до шага 3.
2. **Preview до прода** (удобно вместе с отложенными preview фаз 2-4 из `STATE.md`). Проверить:
   - старт, черновик, submit и повтор submit (тот же результат, вторая попытка не создаётся);
   - 409 из второй вкладки и 422 после лимита плюс 2 минуты с кнопкой «Начать заново»;
   - разбор администратора старой (версия 1) и новой (версия 2) попытки, пометки разбора старой попытки;
   - «Без оценки» у вопроса с 0 баллов.
3. **Одно тихое окно.** `active_open_sessions` за последние 3 часа (`<specifics>` п. 1) равно 0. Миграции, web и server выкатываются в это одно окно. **STOP: если окна с нулём нет, выкатка не начинается.** Отдельный релиз server с необязательным `sessionId` (чтобы прежний web не получал 400) — решение пользователя. Планами фазы он не покрыт, исполнитель его не готовил и не выбирал.
4. **В окне, непосредственно перед деплоем:** `yarn workspace @bio-exam/server drizzle:migrate` с 0022 и 0023 на проде. Обе миграции аддитивны, текущие server и web с ними работают. Первый оператор 0022 — `SET LOCAL lock_timeout = '5s'`. Если таблица занята, миграция падает с 55P03, откатывается целиком и повторяется позже в том же окне. Без применённых 0022 и 0023 деплой не начинается. Миграция фазы 7 (0024) применяется после них.
5. **Деплой web, сразу за ним server**, в том же окне. Порядок такой, потому что новый web на прежнем server работает: прежняя схема тела submit (`z.object`) отбрасывает лишний `sessionId`. Прежний web на новом server получает 400 на каждый submit.
   - В промежутке «web раньше server» экран результата неполный: прежний server отвечает прежней формой без полей вида, карточки вопросов показывают «Без оценки», разбор идёт без подсветки. Попытки при этом сохраняются.
   - Вкладка, открытая до деплоя web (прежний JS без `sessionId`), после деплоя server получает 400 и восстанавливается перезагрузкой: ответы лежат в WAL и в черновике сервера. Контракт D-03 не меняется.
6. **Откат только парой: прежний server, затем прежний web** (Instant Rollback). Web отдельно не откатывается: прежний web на новом server получает 400 на каждый submit.
   - Между откатом server и откатом web новый web на прежнем server работает с неполным экраном результата, как в п. 5.
   - Прежний server читает строки версии 2 как старые `results`: разбор администратора снова подставит текущий ключ, повтор submit отдаст сырые факты. Риск ограничен окном отката.
   - Миграции не откатываются. Новых env-ключей нет.
7. **Визуальные проверки UI-SPEC на 375px:**
   - плашка ошибки на странице прохождения: текст переносится, кнопка под текстом;
   - диалоги 409 и 422: кнопки подвала в столбец, без горизонтального скролла;
   - пометка разбора старой попытки в `/admin/attempts/<id>`: текст переносится, `KeyRound` у первой строки, без горизонтального скролла;
   - подтверждение пунктов UI-SPEC **[авто]** (список ниже).

### Сводка подтверждений из 05-01…05-10 и `<specifics>`

Каждый пункт требует решения или проверки пользователя.

- **`<specifics>` п. 1 и 05-06 (D-03, D-09):**
  - `sessionId` и `clientAttemptId` обязательны для всех тестов;
  - 409 `ATTEMPT_ALREADY_SUBMITTED` вместо второй попытки той же сессии;
  - 422 `TIME_EXPIRED`;
  - `TIME_EXPIRED_ALREADY_SUBMITTED` удалён;
  - поведение вкладки, открытой до деплоя (400, перезагрузка).
- **05-06, уточнение R2 к D-08 п. 3:** просрочку решает только предпроверка по часам БД на момент прихода запроса. Отправка, принятая на входе, не получает 422 из-за долгой оценки.
- **05-06, уточнение R3 к D-03/D-08:** сессия `superseded` на submit даёт 404 `Session not found`, а не 422. WAL сохраняется, после перезагрузки ответы уходят в открытую сессию.
- **`<specifics>` п. 2 и 05-03 (D-06):** политика чистки. В паре остаётся самая новая открытая сессия (`started_at DESC, id DESC`), остальные закрываются как `superseded`, данные не удаляются.
- **`<specifics>` п. 3 и 05-05 (D-05):** `/start` закрывает просроченную сессию и открывает новую, автосдачи нет, черновик закрытой сессии остаётся в строке.
- **`<specifics>` п. 4 и 05-04 (D-01, D-02):** неназначенный пользователь без `tests.read` получает 403 на `/start`, PATCH черновика, submit, `/attempts/me` и `/chart-data`. Снятие назначения посреди попытки даёт 403 на черновик и submit.
- **`<specifics>` п. 5 и 05-07 (D-15):** видимость ключа студенту зависит от текущего `showCorrectAnswer` теста, сам ключ — сохранённый при сдаче.
- **`<specifics>` п. 6 и 05-08 (D-19):** старые попытки не переписываются. Ключ берётся из `correctAnswer` или из истории `answer_keys` на момент сдачи, вердикты показываются только при совпадении пересчёта. Скрипт перевода в версию 2 — отдельное решение.
- **`<specifics>` п. 7 и 05-08 (D-16):** форма старых `results` и `telemetry` на проде (запросы в шаге 1).
- **`<specifics>` п. 8 и 05-09 (D-17):** «Без оценки» в карточке `TestRunner` при 0 баллов. Визуально подтвердить на тесте с вопросом весом 0.
- **`<specifics>` п. 9 и 05-07 (D-14, D-16):** ответ submit и разбор получают поля `status`, `keyVisible`, `mistakes`, `verdicts`. Новые попытки хранят ключ и вердикты, `results_version = 2`.
- **`<specifics>` п. 10:** 0022 и 0023 — вторая и третья боевые миграции после фазы 1, порядок из runbook.
- **05-07, для планировщика:**
  - поправить формулировку must_have truth № 2 плана 05-07: для single_choice и multi_choice `errorUnits(verdicts) === mistakes` не выполняется по решению фазы 3;
  - решить учёт `attempt-submit.test.ts` в allow-list 05-07.
- **05-09, UI-SPEC [авто]:**
  - высота `h-8` у кнопок плашки;
  - вес 500 у заголовков диалогов 409 и 422;
  - поведение 404 (WAL остаётся);
  - замена ответов при другом `sessionId`;
  - повторное открытие «Начать тест?» после неудачного «Начать»;
  - проверка просрочки по часам клиента;
  - тело 403 без машинного кода.
- **05-09, UI-SPEC unresolved:**
  - 403 при открытии страницы теста показывает «Тест не найден»;
  - PATCH черновика с 403 или 404 проходит молча, индикатор сохранения будет в Phase 6;
  - вкладка, открытая до деплоя, получает старую плашку, помогает перезагрузка.
- **05-10, UI-SPEC [авто]:** текст пометки «Разбор по частям недоступен: правила проверки изменились после сдачи. Показаны ключ на момент сдачи и сохранённые баллы.» и размещение карточки «Правильный ответ» у выбора и сопоставления. Пометка появляется в двух случаях: пересчёт не совпал или у вопроса нет настроенного типа.
- **Коммиты:** файлы планов 05-01…05-10 закоммичены оркестратором (последний `583a0e0`). Файлы этого плана (три, список выше) коммитит пользователь или оркестратор.

## Self-Check: PASSED

- Файлы на месте: `scripts/attempt-integrity-guards.test.mjs`, `scripts/exam-core-no-private-copies.test.mjs`, `app/server/README.md`, `.planning/commit-snapshots/before-05-11/fingerprint.json`, этот SUMMARY.
- Коммитов плана нет (правило пользователя), HEAD `583a0e0`, `actuals.commits: 0`, изменения в рабочем дереве.
