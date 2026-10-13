---
phase: 07-storage-and-question-content
plan: 13
subsystem: question-content
tags: [question-content, storage, move, delete, reorder, access-policy, d-08, d-10, d-11, d-12, qcon-01, qcon-02, qcon-03]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-12: relocate.ts (planRelocation, switchPointers, relocateQuestionObjects с failureMessage)"
  - phase: 07-storage-and-question-content
    provides: "07-10: order.ts (lockTest, resequenceQuestions), write.ts (CONTENT_CHANGED_MESSAGE, QUESTION_NOT_IN_TEST_MESSAGE, updateQuestion)"
  - phase: 07-storage-and-question-content
    provides: "07-04: характеризация переноса и удаления (question-relocation.characterization.test.ts)"
provides:
  - "services/question-content/move.ts: moveQuestion, MOVE_FAILED_MESSAGE, MOVE_SAME_TARGET_MESSAGE"
  - "services/question-content/remove.ts: deleteQuestion, deleteTest, deleteTopic, reorderQuestions, collectContentKeys, REORDER_SET_MISMATCH_MESSAGE"
  - "Пять маршрутов состава теста делегируют модулю, доступ через canWriteTest и canWriteTopic"
affects: [07-14, phase-05]

actuals:
  tokens: 17000
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Удаление: ключи под префиксом собираются list до транзакции, указатели удаляемых строк — в транзакции до DELETE; после commit удаляются только ключи без ссылок из оставшихся строк"
    - "Перенос вопроса: copy → транзакция (lockTest источника и цели по id, FOR SHARE тем, создание приёмника, switchPointers, смена test_id, resequenceQuestions обоих тестов, документ поиска) → удаление источников после commit"

key-files:
  created:
    - app/server/src/services/question-content/move.ts
    - app/server/src/services/question-content/remove.ts
    - app/server/src/services/question-content/move-remove.test.ts
  modified:
    - app/server/src/services/question-content/index.ts
    - app/server/src/routes/tests/index.ts

key-decisions:
  - "Удаление собирает только ключи пространства topics/: images/ и avatars/ не удаляются даже по указателю; невалидный ключ-указатель отбрасывается, чтобы не сорвать пакетный remove"
  - "Перед удалением объекты сверяются с оставшимися строками questions: ключ, на который ещё ссылается другой вопрос, не удаляется"
  - "deleteQuestion и deleteTest сверяют slug теста и темы под lockTest, deleteTopic блокирует тесты темы по id, затем тему FOR UPDATE и сверяет slug; расхождение → 409 «Содержимое изменилось, повторите»"
  - "Перенос: тест, исчезнувший или переименованный между копированием и транзакцией, даёт 409; занятый slug приёмника (SELECT или 23505) — 409"

requirements-completed: [QCON-01, QCON-02, QCON-03]

coverage:
  - id: D1
    description: "Удаление вопроса: строка удалена, порядок 0…n-1, объекты под префиксом вопроса удалены, images/ на месте; сбой remove → assetsDeleted: false и лог сирот"
    requirement: QCON-03
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/move-remove.test.ts#удаление вопроса"
        status: pass
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#DELETE /:id/questions/:questionId"
        status: pass
    human_judgment: false
  - id: D2
    description: "Удаление теста и темы — сначала БД: сбой DELETE (триггер) оставляет объекты и строки; questions/**, settings.json, answer_keys.json и указатели вне префикса удаляются; assets/, images/, avatars/ остаются; сценарий «переименование → тот же slug → удаление»"
    requirement: QCON-02
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/move-remove.test.ts#удаление теста и темы"
        status: pass
    human_judgment: false
  - id: D3
    description: "PUT reorder: полный набор — порядок как передан, неполный или чужой — 400"
    requirement: QCON-03
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/move-remove.test.ts#порядок вопросов"
        status: pass
    human_judgment: false
  - id: D4
    description: "Перенос вопроса: в тест и в тему с созданием приёмника, сбой копирования 503, сбой транзакции, тот же тест 400, параллельное создание вопроса в цели, гонки правки и переименования цели → 409"
    requirement: QCON-02
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/move-remove.test.ts#перенос вопроса"
        status: pass
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#перенос вопроса"
        status: pass
    human_judgment: false
  - id: D5
    description: "Доступ: студент и администратор с deny tests.write получают 403 на пяти маршрутах, в том числе для несуществующего id; БД и хранилище не меняются"
    requirement: QCON-01
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/move-remove.test.ts#доступ через scope.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "<specifics> п. 8: тесты с дырами в порядке на проде выравниваются при удалении, переносе и reorder"
    requirement: QCON-03
    verification: []
    human_judgment: true

duration: 20min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: bce8e4b
plan_head_after: bce8e4b
---

# Phase 7 Plan 13: Перенос и удаление вопроса Summary

**Перенос вопроса, удаление вопроса, теста и темы и reorder идут через `services/question-content`: перенос копирует объекты под префикс цели и в одной транзакции блокирует оба теста, создаёт тест-приёмник, условно переключает указатели и перенумеровывает оба теста; удаление сначала удаляет строки, потом объекты, никогда не трогая `assets/`, `images/` и `avatars/`; порядок везде поддерживает `resequenceQuestions`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T12:42Z
- Конец: 2026-10-04T13:02Z
- Задач: 3
- Файлов: 5 (3 новых, 2 изменённых)

## Accomplishments

- `remove.ts`:
  - `collectContentKeys(rows, { kind, prefix })` — один `storage().list(prefix, { recursive: true })`; для вопроса берутся все ключи, для теста `topics/<t>/<s>` — `questions/**`, `settings.json`, `answer_keys.json`, для темы то же для каждого `topics/<t>/<s>/`. Ключ вне `topics/` или с сегментом `assets` не собирается никогда. Указатели строк добавляются, если ключ валиден для хранилища.
  - `deleteQuestion` — 404 теста и «Вопрос не найден в текущем тесте»; ключи под префиксом вопроса до транзакции; транзакция: `lockTest` со сверкой slug теста и темы, `DELETE … RETURNING` указателей, `resequenceQuestions`, `tests.updatedAt/updatedBy`, отбор ключей без ссылок; после commit удаление, сбой → `console.warn('[question-content] orphan objects', keys)` и `assetsDeleted: false`.
  - `deleteTest` и `deleteTopic` — то же без перенумерации: указатели всех вопросов читаются в транзакции до `DELETE`, строки удаляются каскадом. Сбой транзакции не трогает объекты.
  - `reorderQuestions` — транзакция: `lockTest` (404), проверка набора (400 «Неверный набор вопросов для сортировки»), `resequenceQuestions(tx, testId, () => questionIds)`, `tests.updatedAt/updatedBy`.
- `move.ts`: `moveQuestion` по must_haves. Цель определяется до копирования: тест по `targetTestId`, иначе тест темы с slug источника, иначе свободный slug (`s`, `s-2`, …) для приёмника. `planRelocation` под префикс цели, `relocateQuestionObjects(…, { failureMessage: 'Не удалось перенести файлы, перенос отменён' })`. В транзакции: `lockTest` источника и существующей цели по id со сверкой slug и темы, `FOR SHARE` обеих тем со сверкой slug, создание приёмника (порядок в теме — `max + 1`), `switchPointers`, `UPDATE questions SET test_id … WHERE test_id = <источник>` (0 строк → 409), `resequenceQuestions` источника, `resequenceQuestions` цели с вопросом в конце, `updateQuestionSearchDocumentLocation(…, tx)`. `relocate.ts` не менялся.
- `index.ts` модуля реэкспортирует `moveQuestion`, `deleteQuestion`, `deleteTest`, `deleteTopic`, `reorderQuestions`, `collectContentKeys`, константы и типы.
- `move-remove.test.ts`: 21 тест (`test_qcon_move_remove`, `memoryStorage()`, администратор, студент, администратор с deny `tests.write`).
- Tracer (Task 1): удаление вопроса — строка удалена, порядок без дыр, объекты под префиксом удалены после commit. `<verify>` Task 1 прогнан, удаление, reorder и доступ зелёные; красными были только тесты переноса, написанные заранее для Task 2 (RED). Отдельного `blocking-human` нет.

## Изменённые обработчики `routes/tests/index.ts` (для слияния с фазой 5)

Регистрация всех пяти — `validateUUID(…), sessionRequired(), async …` без `requirePerm`; отказ — `403 { error: 'Forbidden' }`.

- `DELETE /topics/:id`: `canWriteTopic(req, id)` → `deleteTopic({ topicId })` → `{ ok: true }`.
- `PUT /:id/questions/reorder`: `canWriteTest(req, testId)` → `ReorderQuestionsSchema` (400 с `details`) → `reorderQuestions` → `{ ok: true }`.
- `POST /:id/questions/:questionId/move`: `canWriteTest(req, sourceTestId)` → `MoveQuestionSchema` (400 с `details`) → `canWriteTest(req, targetTestId)` или `canWriteTopic(req, targetTopicId)` → `moveQuestion` → `{ ok: true, questionId, target }`.
- `DELETE /:id/questions/:questionId`: `canWriteTest(req, testId)` → `deleteQuestion` → `{ ok: true, questionId, assetsDeleted }`.
- `DELETE /:id`: `canWriteTest(req, id)` → `deleteTest` → `{ ok: true }`.
- Импорты: удалены `gt` и `updateQuestionSearchDocumentLocation`; добавлены пять функций модуля. `requirePerm`, `storageService`, `path` используются другими обработчиками. Вызовов `moveDirectory` и `deleteDirectory` в файле нет.

## codegraph impact (D-24, до правок)

Индекс построен по основному дереву, номера строк — до 07-07…07-12.

- `deleteDirectory` (storage.ts:118): 7 символов — `DELETE /api/tests/:id/questions/:questionId`, `DELETE /api/tests/:id`, `DELETE /api/tests/topics/:id`, `routes/tests/index.ts`, `routes/index.ts`, `storage.local.test.ts`.
- `moveDirectory` (storage.ts:124): 6 символов — `PATCH /api/tests/:id/settings` (уже переписан в 07-12), `POST /api/tests/:id/questions/:questionId/move`, `routes/tests/index.ts`, `routes/index.ts`, `storage.local.test.ts`.
- `moveQuestion` (Task 2): символа нет в индексе (новый). Вызывающий — только `POST /api/tests/:id/questions/:questionId/move`.
- Сами методы `deleteDirectory` и `moveDirectory` в `storage.ts` остаются (вне allow-list плана); в `routes/tests/index.ts` вызовов нет.

## codegraph affected (Task 3)

`codegraph affected` по пяти изменённым файлам: `app/server/src/routes/tests/index.ts`, `app/server/src/services/question-content/move-remove.test.ts`. Серверные тесты прогнаны целиком в `yarn verify`.

## TDD (Task 2)

- RED: `move-remove.test.ts` с разделом переноса прогнан против старого обработчика (Task 1 уже сделана) → `Tests 5 failed | 28 passed`; из них 3 — перенос: сбой копирования (старый код отдавал 503 «Хранилище недоступно»), гонка правки и гонка переименования цели (старый код отвечал 200). Два других красных — тесты удаления с указателем вне `topics/` (исправлено в Task 1, см. отклонения). Против старого кода проходили: перенос в тест и в тему, сбой транзакции (старый откат `moveDirectory`), тот же тест, параллельное создание, доступ.
- GREEN: `move.ts` и новый обработчик → `src/services/question-content src/routes/tests`: `Test Files 8 passed`, `Tests 205 passed | 2 expected fail (207)`.
- Коммиты RED/GREEN не делались (правило пользователя).

## Решения исполнителя (автономно)

1. Удаление собирает только ключи пространства `topics/`; указатели на `images/` и `avatars/` не удаляются (`images/` — медиатека D-12, `avatars/` — не содержимое вопроса).
2. Указатель, который не проходит `normalizeKey`, отбрасывается: один невалидный ключ иначе сорвал бы весь пакетный `remove` (`StorageKeyError` в обёртке хранилища), и объекты вопроса остались бы сиротами.
3. Перед удалением объектов ключи сверяются с оставшимися строками `questions` в той же транзакции (как `unreferencedKeys` 07-10 и 07-12): объект, на который ссылается другой вопрос, не удаляется.
4. `deleteQuestion` и `deleteTest` под `lockTest` сверяют slug теста и темы, `deleteTopic` — slug темы под `FOR UPDATE`: при параллельном переименовании ключи, собранные до транзакции, устарели бы. Расхождение → 409 «Содержимое изменилось, повторите».
4a. Порядок блокировок как в 07-12: сначала тесты по id, затем тема. `deleteTopic` перед `FOR UPDATE` темы блокирует `lockTest` каждый тест темы по id; иначе удаление темы и перенос или переименование в ней образовали бы цикл (тема → тест против тест → тема) и одна из транзакций падала бы с 40P01.
5. Указатели удаляемых строк читаются в транзакции до `DELETE`, а не до неё: так учитывается вопрос, перенесённый в удаляемый тест между сбором ключей и транзакцией.
6. Перенос: исчезнувший или переименованный между копированием и транзакцией тест (источник или цель) → 409. Slug приёмника, занятый к моменту транзакции (проверка `SELECT` и нарушение `tests_topic_slug_uniq`, код 23505) → 409.
7. Перенос не меняет `tests.updatedAt` источника и цели, как и прежний обработчик.
8. `reorderQuestions` проверяет набор сам до `resequenceQuestions`, иначе несовпадение дало бы 500.
9. Ответ удаления теста и темы — `{ ok: true }` без `assetsDeleted` (форма D-08 не меняется); сбой удаления объектов пишется в лог сирот.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Пакетный remove срывался из-за ключа вне пространств хранилища**
- **Found during:** Task 1
- **Issue:** указатель вне `images/`, `topics/`, `avatars/` делал `storage().remove(keys)` невалидным целиком: `StorageKeyError`, ни один объект теста не удалялся.
- **Fix:** указатели фильтруются по `normalizeKey` и пространству `topics/`; тест удаления теста проверяет, что `avatars/…` по указателю остаётся.
- **Files modified:** app/server/src/services/question-content/remove.ts, move-remove.test.ts
- **Commit:** не выполнялся (правило пользователя)

## Изменения поведения

- Удаление теста и темы сначала удаляет строки: сбой БД оставляет файлы (раньше файлы удалялись до строк).
- Удаление теста и темы оставляет `topics/<t>/<s>/assets/**`, служебные файлы вне `questions/`, `settings.json`, `answer_keys.json` (например `notes.txt`) и `topics/<t>/assets/**` (раньше удалялся весь префикс).
- Сбой удаления файлов вопроса пишется `console.warn('[question-content] orphan objects', …)` (раньше `console.error('[tests] …')`).
- Перенос вопроса: сбой копирования → 503 «Не удалось перенести файлы, перенос отменён» (раньше 503 «Хранилище недоступно» или частично перенесённые файлы); тест-приёмник создаётся в транзакции; гонка с правкой вопроса или переименованием теста → 409.
- Перенос вопроса без `requirePerm`: проверяется право на источник и на цель.
- Reorder и удаление вопроса перенумеровывают тест в 0…n-1 (выравниваются и существующие дыры).

## Threat Flags

Нет новых поверхностей: маршруты прежние, доступ сужен до `canWriteTest`/`canWriteTopic`.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. `<specifics>` п. 8 (продолжение 07-10): на копии прод-данных проверить, что тесты с дырами или дублями в `order` выравниваются в 0…n-1 после удаления вопроса, переноса в тест и из теста и reorder (проверочный SQL — `07-CONTEXT.md` `<specifics>` п. 8).
2. Коммит файлов плана делает пользователь (список ниже).

## Файлы к коммиту

- app/server/src/services/question-content/move.ts
- app/server/src/services/question-content/remove.ts
- app/server/src/services/question-content/index.ts
- app/server/src/services/question-content/move-remove.test.ts
- app/server/src/routes/tests/index.ts

## Verification

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content/move-remove.test.ts src/routes/tests/question-relocation.characterization.test.ts` — зелёный.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/routes/tests` — `Test Files 8 passed`, `Tests 205 passed | 2 expected fail (207)` (ожидаемые падения — известные дефекты ZIP 07-14).
- Проверка делегирования — `move and delete through module`.
- `yarn verify` — финальный прогон после последней правки (порядок блокировок `deleteTopic`): `yarn verify: OK`, server `839 passed | 3 expected fail (842)`, тесты прогнаны без кэша turbo.
- Два прогона из четырёх (`FAILED at lint-typecheck-test`) падали на 2 тестах `src/routes/auth/login-throttle.test.ts`: `Retry-After 28` при ожидании 29…31 и пустой `window_sec`. Это тайминг при load average 20…26 (параллельно шла фаза 5). Файл вне плана и вне `codegraph affected`, отдельный прогон — 24 из 24. Записано в `deferred-items.md`.
- Сверка с отпечатком — `07-13 changed only its files`.

## Self-Check: PASSED

- Файлы плана на месте: move.ts, remove.ts, move-remove.test.ts, index.ts модуля, routes/tests/index.ts.
- Коммитов нет по правилу пользователя; `git status` показывает только пять файлов плана.
