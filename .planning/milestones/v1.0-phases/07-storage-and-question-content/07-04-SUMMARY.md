---
phase: 07-storage-and-question-content
plan: 04
subsystem: question-content
tags: [characterization, known-defects, storage, in-memory, zip, relocation, d-23]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-01: in-memory адаптер по умолчанию в изоляции, test-support/storage.ts (memoryStorage()), failOn/clearFailures"
provides:
  - "question-relocation.characterization.test.ts: характеризация переименования теста (slug и тема), переноса вопроса (в тест и в тему без теста), удаления вопроса, теста и темы, экспорта теста и темы через app.ts"
  - "KNOWN_DEFECTS = STOR-rename-topic-files, STOR-rename-test-rollback, STOR-zip-no-images, STOR-export-writes-answer-keys (test.fails); переключают 07-12 и 07-14"
  - "test-support/zip.ts: readZipEntries(buffer) → Map<имя записи, Buffer> на node:zlib"
affects: [07-10, 07-12, 07-13, 07-14]

actuals:
  tokens: 5689
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Чтение ZIP в тестах через центральный каталог и inflateRawSync, без пакетов"
    - "Экспорт скачивается сырым fetch с cookie, тело — arrayBuffer"
    - "Каждый случай создаёт свою тему и тест, порядок тестов на результат не влияет"

key-files:
  created:
    - app/server/src/routes/tests/question-relocation.characterization.test.ts
    - app/server/src/test-support/zip.ts
  modified: []

key-decisions:
  - "failOn для STOR-rename-test-rollback — префикс без завершающего слэша: topics/<тема>/<тест>"
  - "Регулярка имени промпта в ZIP и в указателях — prompt(-[0-9a-f]+)?\\.md, settings.json не проверяется"
  - "answer_keys.json сравнивается как множество по questionId: порядок строк в выборке не задан"

requirements-completed: []

coverage:
  - id: D1
    description: "PATCH /:id/settings со сменой slug и со сменой topicId: 200, assetsMoved true, указатели под новым префиксом, объекты перенесены, чтение по новому slug отдаёт прежние тексты"
    requirement: QCON-02
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#переименование теста и смена темы"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /:id/questions/:questionId/move в существующий тест и в тему без теста: форма ответа, порядок источника без дыр, объект под префиксом цели, question_search_documents.test_id = цель, автосоздание неопубликованного теста"
    requirement: QCON-02
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#перенос вопроса"
        status: pass
    human_judgment: false
  - id: D3
    description: "DELETE вопроса, теста и темы: объекты под префиксом удалены, порядок без дыр, строки удалены, images/keep.webp на месте"
    requirement: QCON-02
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#удаление вопроса, теста и темы"
        status: pass
    human_judgment: false
  - id: D4
    description: "Экспорт теста и темы: заголовки, записи промптов по регулярке, answer_keys.json только при withAnswers=true с формой [{ questionId, correct }]"
    requirement: STOR-05
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#экспорт теста и темы"
        status: pass
    human_judgment: false
  - id: D5
    description: "Красные test.fails STOR-rename-topic-files, STOR-rename-test-rollback (07-12), STOR-zip-no-images, STOR-export-writes-answer-keys (07-14)"
    requirement: QCON-05
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#известные дефекты переноса и экспорта"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 53072dd
plan_head_after: 53072dd
---

# Phase 7 Plan 04: Характеризация переноса, удаления и экспорта Summary

**Тестовый файл закрепляет через app.ts на `test_*` и in-memory адаптере переименование теста (slug и тема), перенос вопроса, удаление вопроса, теста и темы, экспорт теста и темы. Четыре дефекта D-23 воспроизведены как `test.fails`. Помощник `readZipEntries` читает ZIP встроенным `node:zlib`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T11:00:38Z
- Конец: 2026-10-04T11:06:03Z
- Задач: 2
- Файлов: 2 (новые)

## Accomplishments

- Tracer (Task 1): `/save` → `PATCH /:id/settings` со сменой slug → `GET /by-slug/<тема>/<новый slug>` отдаёт прежние тексты. Проходит на текущем коде, повторный прогон перед Task 2 зелёный.
- `readZipEntries` идёт от записи конца центрального каталога, размеры берёт из центрального каталога (archiver пишет data descriptor). Поддерживает метод 0 и 8. На ZIP64 и неизвестный метод бросает ошибку. Проверяет размер распакованных данных.
- Экспорт проверяется по именам записей и по содержимому промпта, `settings.json` не проверяется (D-13, D-18).

## Состав файла

| Блок | Тесты |
|------|-------|
| переименование теста и смена темы | смена `slug`; смена `topicId`. Оба: 200, `assetsMoved: true`, указатели по `^topics/<тема>/<тест>/questions/<id>/prompt(-[0-9a-f]+)?\.md$`, тексты по новым ключам, по старым ключам `null`, под старым префиксом пусто, by-slug по новому адресу отдаёт прежние тексты |
| перенос вопроса | в существующий тест: ответ `{ ok, questionId, target: { topicId, topicSlug, testId, testSlug } }`, порядок источника `[0, 1]`, промпт под префиксом цели, под старым каталогом вопроса пусто, `question_search_documents.test_id` = цель; в тему без теста: создан один тест с тем же slug, `is_published = false`, вопрос в нём, источник пуст |
| удаление вопроса, теста и темы | вопрос: `{ ok: true, questionId, assetsDeleted: true }`, порядок `[0, 1]`, каталог вопроса пуст, `images/keep.webp` на месте; тест: префикс пуст, строк теста и вопросов нет, `images/keep.webp` на месте; тема: `topics/<slug>` пуст, строк темы и тестов нет |
| экспорт теста и темы | тест: 200, `application/zip`, `attachment; filename="<тема>-<тест>.zip"`, запись промпта на каждый вопрос с тем же текстом, `answer_keys.json` нет; `withAnswers=true`: `answer_keys.json` = `[{ questionId, correct }]` по вопросам теста; тема: `<testSlug>/questions/<id>/prompt…md` для каждого вопроса двух тестов |
| известные дефекты переноса и экспорта | четыре `defectTest` ниже |

## KNOWN_DEFECTS

`KNOWN_DEFECTS = new Set<string>(['STOR-rename-topic-files', 'STOR-rename-test-rollback', 'STOR-zip-no-images', 'STOR-export-writes-answer-keys'])`. Все четыре воспроизвелись.

Контрольный прогон с пустым набором (`4 failed | 10 passed (14)`, файл после прогона восстановлен из копии, `cmp` чистый) показал, что каждая проверка падает на утверждении «после исправления», а не на подготовке:

| ID | Где падает сейчас | Что видно | Переключает |
|----|-------------------|-----------|-------------|
| `STOR-rename-topic-files` | `prompt_path` начинается с `topics/<новый slug>/` | указатель остался `topics/reloc-topic-old/…/prompt.md`: `PATCH /topics/:id` не трогает ни файлы, ни указатели | 07-12 |
| `STOR-rename-test-rollback` | статус | `200` вместо `503`: `moveDirectory` ловится, ответ `assetsMoved: false`, транзакция с новыми slug и указателями уже зафиксирована (`index.ts:1604-1661`) | 07-12 |
| `STOR-zip-no-images` | запись `images/<32 hex>.webp` | записи нет: `createZip` листает только префикс теста | 07-14 |
| `STOR-export-writes-answer-keys` | `mem.get('topics/<тема>/<тест>/answer_keys.json')` | объект `application/json` в хранилище: экспорт пишет ключи ответов перед сборкой архива | 07-14 |

Перед финальной проверкой в `STOR-export-writes-answer-keys` утверждается, что `answer_keys.json` есть в архиве. После исправления это должно остаться верным.

## codegraph impact (D-24, до правок)

Индекс основного дерева. Код приложения в плане не менялся.

- `moveDirectory` (storage.ts:124): 6 символов. `PATCH /api/tests/:id/settings` (index.ts:1546), `POST /api/tests/:id/questions/:questionId/move` (index.ts:2016), `routes/index.ts`, `storage.local.test.ts`.
- `deleteDirectory` (storage.ts:118): 7 символов. `DELETE /api/tests/:id/questions/:questionId` (2190), `DELETE /api/tests/:id` (2264), `DELETE /api/tests/topics/:id` (387), `routes/index.ts`, `storage.local.test.ts`.
- `createZip` (storage.ts:139): 6 символов. `GET /api/tests/:id/export` (2358), `GET /api/tests/topics/:slug/export` (2412), `routes/index.ts`, `storage.local.test.ts`.

## codegraph affected (Task 2)

Запуск из основного дерева по двум файлам плана: `Affected test files (1): app/server/src/routes/tests/question-relocation.characterization.test.ts`. Новые файлы есть только в worktree, затронут только сам тестовый файл.

## Решения исполнителя (автономно)

1. Префикс `failOn` без завершающего слэша: `topics/<тема>/<тест>` вместо `topics/<тема>/<тест>/` из плана. `underPrefix` в `adapters/memory.ts` проверяет `key.startsWith(prefix + '/')`, со слэшем сбой не сработал бы. Так же сделано в 07-03.
2. `KNOWN_DEFECTS` и `defectTest` по образцу `storage-known-defects.test.ts` и `question-content.characterization.test.ts`. В `auth-known-defects.test.ts` набора больше нет, дефекты фазы 4 закрыты.
3. `PATCH /:id/settings` отправляет `isPublished: true`: схема по умолчанию ставит `false`, и без поля тест снимался бы с публикации. На проверки это не влияет.
4. `answer_keys.json` сравнивается после сортировки по `questionId`: выборка ключей в экспорте без `ORDER BY`.
5. Помимо требований плана проверяются: тексты промптов по новым ключам при переименовании и переносе, совпадение текста записи ZIP с объектом хранилища, удаление строк темы и тестов при удалении темы. Эти утверждения закрепляют текущее поведение и не противоречат D-10, D-12 и D-18.
6. `requirements-completed` пуст: план закрепляет поведение и воспроизводит дефекты, но QCON-02, QCON-05 и STOR-05 не закрывает. Отметку делают 07-12, 07-13 и 07-14.

## Deviations from Plan

None - план выполнен как написан. Префикс `failOn` (решение 1) — поправка записи плана под семантику адаптера, замысел тот же.

## Verification

- Task 1 и Task 2: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/question-relocation.characterization.test.ts` → `Test Files 1 passed (1)`, `Tests 10 passed | 4 expected fail (14)`.
- Импорты `zip.ts`: проверка из acceptance_criteria выходит с кодом 0 (только `node:zlib`).
- Проверка набора: `relocation defects present`.
- `yarn oxfmt` по двум файлам применён.
- `yarn verify` → `yarn verify: OK`, все 8 шагов `passed`. server: 28 файлов, `604 passed | 7 expected fail (611)`; exam-core: 498; web: 454; rbac: 2.
- Сверка с отпечатком `.planning/commit-snapshots/before-07-04/fingerprint.json` (на старте 0 путей, дерево чистое) → `07-04 changed only its files`. `git status`: только два новых файла.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Коммит файлов плана делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет. Код приложения не менялся. T-7-07 закреплён красной `STOR-export-writes-answer-keys`, чинит 07-14. Установок пакетов нет, ZIP читается встроенным `node:zlib` (T-7-SC).

## Файлы к коммиту

```
app/server/src/routes/tests/question-relocation.characterization.test.ts
app/server/src/test-support/zip.ts
```

## Self-Check: PASSED

- Оба файла существуют (`?? ` в `git status`).
- Отпечаток `.planning/commit-snapshots/before-07-04/fingerprint.json` существует.
- Коммитов нет по правилу пользователя, HEAD = 53072dd до и после.
