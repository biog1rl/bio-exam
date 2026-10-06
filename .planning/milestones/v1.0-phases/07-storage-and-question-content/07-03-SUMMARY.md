---
phase: 07-storage-and-question-content
plan: 03
subsystem: question-content
tags: [characterization, known-defects, storage, in-memory, questions, d-23, d6]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-01: in-memory адаптер по умолчанию в изоляции, test-support/storage.ts (memoryStorage()), failOn/clearFailures"
provides:
  - "question-content.characterization.test.ts: характеризация /save, чтения администратора (by-slug, /:id, view=summary), чтения прохождения (по slug и по id), POST/PATCH/PUT reorder вопроса через app.ts"
  - "KNOWN_DEFECTS = STOR-D6a, STOR-D6b, STOR-save-order-holes (test.fails), переключает 07-10"
affects: [07-07, 07-10]

actuals:
  tokens: 3800
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Характеризация маршрутов вопроса на startAuthApp + memoryStorage() без vi.mock: засев, проверка и инъекция сбоев через адаптер"
    - "Отдельный тест через /save на каждый разрушающий сценарий (удаление объекта, сбой, дефект)"

key-files:
  created:
    - app/server/src/routes/tests/question-content.characterization.test.ts
  modified: []

key-decisions:
  - "failOn использует префикс без завершающего слэша: 'topics' и topics/<тема>/<тест>/questions/<qid>"
  - "Каждый разрушающий сценарий и каждый дефект работают на своём тесте, созданном через /save"
  - "Пустой promptText при отсутствующем файле проверяется у обоих блоков чтения администратора (/:id и by-slug)"

requirements-completed: []

coverage:
  - id: D1
    description: "Создание, чтение, правка и порядок вопроса через app.ts на test_* и in-memory адаптере: /save, by-slug (полный и view=summary), /:id, чтение прохождения по slug и id, POST /:id/questions, PATCH, PUT reorder, 403 студента"
    requirement: QCON-01
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#POST /api/tests/save → хранилище → чтение"
        status: pass
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#создание с позицией, правка, порядок"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ответы by-slug и /:id администратора равны по массиву questions (promptText, explanationText, correct, order)"
    requirement: QCON-01
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#POST /api/tests/save → хранилище → чтение > чтение администратора: by-slug и /:id отдают одинаковый массив questions с отправленными полями"
        status: pass
    human_judgment: false
  - id: D3
    description: "Указатели промпта и пояснения по регулярке с необязательной ревизией (D-09)"
    requirement: QCON-01
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#POST /api/tests/save → хранилище → чтение > создание: два вопроса, указатели на канонические ключи, тексты в хранилище, поисковые документы"
        status: pass
    human_judgment: false
  - id: D4
    description: "Сбой чтения хранилища → 503 у прохождения и администратора; отсутствующий файл → пустой promptText (D-03, D-08)"
    requirement: QCON-01
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#чтение при отсутствии файла и при недоступном хранилище"
        status: pass
    human_judgment: false
  - id: D5
    description: "Красные test.fails STOR-D6a, STOR-D6b (QCON-04) и STOR-save-order-holes (QCON-03); переключает 07-10"
    requirement: QCON-04
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#известные дефекты записи вопроса"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 7238351
plan_head_after: 7238351
---

# Phase 7 Plan 03: Характеризация CRUD и порядка вопроса Summary

**Один тестовый файл закрепляет через app.ts на `test_*` и in-memory адаптере создание вопроса через `/save`, оба блока чтения администратора (массивы `questions` равны), чтение для прохождения, 503 при сбое чтения хранилища, пустой `promptText` без файла, вставку с позицией, PATCH с версией 2 ключа и reorder. D6a, D6b и дыры в порядке `/save` воспроизведены как `test.fails`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T10:51:10Z
- Конец: 2026-10-04T10:57:20Z
- Задач: 2
- Файлов: 1 (новый)

## Accomplishments

- Tracer (Task 1): `/save` → in-memory хранилище → чтение администратора по slug и по id проходит на текущем коде.
- Указатели промпта и пояснения проверяются регулярками `^topics/<тема>/<тест>/questions/<id>/prompt(-[0-9a-f]+)?\.md$` и `explanation(-[0-9a-f]+)?\.md`. Тест переживёт ключи с ревизией (D-09).
- Паритет `GET /by-slug/...` и `GET /:id` у администратора: `deepEqual` массивов `questions`, поля `promptText`, `explanationText`, `correct`, `order` совпадают с отправленными (база для D-13).
- `failOn({ op: 'read', prefix: 'topics' })` даёт 503 и строку `error` на `GET /api/tests/public/tests/:id` и `GET /api/tests/:id` (D-03, D-08).
- Ошибочные ответы (403, 503, ≥500) проверяются по статусу и полю `error`, тело целиком не сравнивается.

## Состав файла

| Блок | Тесты |
|------|-------|
| `POST /api/tests/save → хранилище → чтение` | создание (2 вопроса, указатели, тексты в `mem`, `question_search_documents` = 2); паритет by-slug и /:id; `view=summary` → `questionsCount` = 2; чтение прохождения по slug и id |
| чтение при отсутствии файла и сбое | удалённый объект промпта → `promptText: ''` в /:id и by-slug; сбой чтения → 503 у прохождения и администратора |
| создание с позицией, правка, порядок | `POST /:id/questions` с `order: 0` → 201 `{ ok, questionId, order: 0 }`, порядок 0, 1, 2 с новым первым; `PATCH` → 200 `{ ok: true, questionId }`, новый текст, ключи v1 неактивна, v2 активна; `PUT reorder` с обратным порядком → 200, `order` по массиву; студент → 403 |
| известные дефекты записи вопроса | `STOR-D6a`, `STOR-D6b`, `STOR-save-order-holes` |

## KNOWN_DEFECTS

`KNOWN_DEFECTS = new Set<string>(['STOR-D6a', 'STOR-D6b', 'STOR-save-order-holes'])`. Все три воспроизвелись.

Контрольный прогон с пустым набором (до финальной версии файла) показал, что каждая проверка падает на утверждении «после исправления», а не на подготовке:

| ID | Где падает сейчас | Что видно |
|----|-------------------|-----------|
| `STOR-D6a` | `stored(legacy)` | `null` вместо `'Прежний промпт D6a'`: PATCH удалил объект по устаревшему ключу до записи нового, запись упала (≥500), в БД уже канонический `prompt_path` |
| `STOR-D6b` | `keyRows` | v1 `is_active: false`, v2 `{ is_active: true, key: 'c' }`: транзакция ключа зафиксирована до сбоя записи промпта |
| `STOR-save-order-holes` | порядок | `[0, 5, 7]` вместо `[0, 1, 2]`: `/save` пишет `order` из запроса как есть |

07-10 переключает их удалением ID из набора.

## codegraph impact (D-24, до правок)

Индекс основного дерева, код приложения в плане не менялся.

- `buildQuestionMarkdownCandidates` (public.ts:55): 6 символов. Маршруты `GET /api/tests/public/topics/:topicSlug/tests/:testSlug`, `GET /api/tests/public/tests/:id`, `POST /api/tests/public/tests/:id/submit`; `routes/index.ts`.
- `readFirstMarkdown` (public.ts:82): 6 символов, те же три маршрута и `routes/index.ts`.
- `upsertQuestionSearchDocument` (services/search/question-documents.ts:60): 11 символов. `POST /api/tests/save`, `POST /api/tests/:id/questions`, `PATCH /api/tests/:id/questions/:questionId`; `scripts/e2e-seed.ts` (`main`), `scripts/backfill-question-search.ts` (`main`), `services/search/index.ts`, `routes/index.ts`.

## codegraph affected (Task 2)

В worktree индекса нет (`CodeGraph not initialized`). Запуск из основного дерева: `Affected test files (1): app/server/src/routes/tests/question-content.characterization.test.ts`. Файл в индексе ещё не существует, вывод совпадает с ожидаемым: затронут только он сам.

## Решения исполнителя (автономно)

1. Префикс `failOn` без завершающего слэша. План пишет `prefix: 'topics/'` и `topics/<тема>/<тест>/questions/<qid>/`. `underPrefix` в `adapters/memory.ts` проверяет `key.startsWith(prefix + '/')`, поэтому префикс со слэшем не совпал бы ни с одним ключом. В файле: `'topics'` и `topics/<тема>/<тест>/questions/<qid>`. Смысл сбоя тот же, что в плане.
2. Разрушающие сценарии (удаление промпта, сбой чтения, вставка, PATCH, reorder, студент, три дефекта) работают каждый на своём тесте через `/save`, чтобы порядок тестов не влиял на результат.
3. `KNOWN_DEFECTS` и `defectTest` взяты по образцу `storage-known-defects.test.ts`: в `auth-known-defects.test.ts` из контекста плана набора больше нет, все дефекты фазы 4 закрыты.
4. Пустой `promptText` проверяется у `/:id` и by-slug, план называет «чтение администратора» без уточнения.
5. `requirements-completed` пуст: план закрепляет поведение и воспроизводит дефекты, но QCON-01, QCON-03 и QCON-04 не закрывает. Их закрывают 07-07 и 07-10, отметку требований делают они.
6. Для D6a перед PATCH проверяется, что администратор читает прежний текст по устаревшему указателю. Внутри `test.fails` эта подготовка маскируется, поэтому место падения подтверждено контрольным прогоном с пустым набором (таблица выше).

## Deviations from Plan

None - план выполнен как написан. Префикс `failOn` (решение 1) — поправка записи плана под семантику адаптера, не изменение замысла.

## Verification

- Task 1 и Task 2: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/question-content.characterization.test.ts` → `Test Files 1 passed (1)`, `Tests 10 passed | 3 expected fail (13)`.
- Проверка набора: `known defects: 'STOR-D6a', 'STOR-D6b', 'STOR-save-order-holes'`.
- Проверка `vi.mock(`: выход 0.
- `yarn oxfmt` по файлу применён.
- `yarn verify` → `yarn verify: OK`, все 8 шагов `passed`. server: 27 файлов, exam-core: 11, web: 20, rbac: 1.
- Сверка с отпечатком `.planning/commit-snapshots/before-07-03/fingerprint.json` → `07-03 changed only its files`. `git status`: только новый тестовый файл.
- После `yarn verify` в тесте сбоя переименована переменная `forStudent` → `forPublic` (запрос идёт от администратора к маршруту прохождения). Повторно: файл `10 passed | 3 expected fail (13)`, `oxfmt --check` чистый, lint сервера без замечаний по файлу.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Коммит файла плана делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет. Код приложения не менялся. T-7-06 закреплён красными `STOR-D6a` и `STOR-D6b`, чинит 07-10. Установок пакетов нет (T-7-SC).

## Файлы к коммиту

```
app/server/src/routes/tests/question-content.characterization.test.ts
```

## Self-Check: PASSED

- Файл `app/server/src/routes/tests/question-content.characterization.test.ts` существует (`?? ` в `git status`).
- Отпечаток `.planning/commit-snapshots/before-07-03/fingerprint.json` существует.
- Коммитов нет по правилу пользователя, HEAD = 7238351 до и после.
