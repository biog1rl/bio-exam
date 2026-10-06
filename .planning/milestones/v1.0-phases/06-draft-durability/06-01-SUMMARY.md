---
phase: 06-draft-durability
plan: 01
subsystem: testing
tags: [playwright, e2e, known-defects, life02, life04]
status: complete
deferred_human_gate: false

requires:
  - phase: 01
    provides: "изолированный yarn e2e, фикстуры e2e/fixtures/exam.ts и accounts.ts, сид all-templates-<p> и authoring-<p>"
provides:
  - "e2e/tests/answer-durability.spec.ts: зелёная подготовка и ожидаемо падающая проверка LIFE-02 (@known-defect @life02)"
  - "e2e/tests/question-draft-durability.spec.ts: зелёная подготовка и две ожидаемо падающие проверки LIFE-04 (@known-defect @life04)"
affects: [06-08, 06-09]

actuals:
  tokens: 2100
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Проверка студента на общем тесте сида закрывает свою открытую сессию в finally: GET теста, POST /start (возвращает открытую сессию), POST /submit с answers {}"
    - "Проверка учителя удаляет свой черновик в finally через DELETE /api/tests/:testId/question-drafts/:draftId (200 или 404)"
    - "Ожидание PATCH черновика фильтруется по формулировке в теле запроса: PATCH гидратации с пустой формулировкой не подходит (C-06)"

key-files:
  created:
    - e2e/tests/answer-durability.spec.ts
    - e2e/tests/question-draft-durability.spec.ts
  modified: []

key-decisions:
  - "Решение исполнителя (автономно): в проверке задержанного PATCH waitForRequest ждёт PATCH этого черновика с формулировкой в теле, а не любой PATCH: иначе ожидание срабатывает на PATCH гидратации"
  - "Решение исполнителя (автономно): в проверке «Отмена» кнопка ищется с exact: true, перед вводом ожидается contenteditable редактора (ожидание до ввода, между вводом и кликом ожиданий нет)"
  - "requirements-completed пуст: план закрепляет дефекты, LIFE-02 и LIFE-04 закрывают 06-09 и 06-08"

requirements-completed: []

duration: 17min
completed: 2026-10-04
---

# Phase 6 Plan 01: Красные e2e-проверки LIFE-02 и LIFE-04 Summary

**Три ожидаемо падающие сквозные проверки под test.fail(): потеря ответов студента при перезагрузке в окне дебаунса 600 мс и потеря последней правки черновика вопроса при мгновенной «Отмене» и при перезагрузке во время задержанного PATCH; каждая с зелёной проверкой подготовки и очисткой данных в finally**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~17 min
- **Started:** 2026-10-04T16:29:39Z
- **Completed:** 2026-10-04T16:46:04Z
- **Tasks:** 3
- **Files modified:** 2 (оба новые)

## Accomplishments

- `e2e/tests/answer-durability.spec.ts`: `describe.serial('LIFE-02: ...')` на `all-templates-<p>`; подготовка «Отвечено: 1 / 5» зелёная; проверка дефекта (ответ 1, «Далее», ответ 2, сразу `page.reload()`, затем «Отвечено: 2 / 5» и выбранный ответ вопроса 1) под `test.fail()`.
- `e2e/tests/question-draft-durability.spec.ts`: `describe.serial('LIFE-04: ...')` на `authoring-<p>`; подготовка (PATCH с формулировкой 200, повторное открытие показывает формулировку) зелёная; проверки «правка и сразу «Отмена»» и «перезагрузка во время задержанного на 5 с PATCH» под `test.fail()`.
- Очистка: `closeOpenAttempt` в `finally` обоих тестов студента, `deleteDraft` (и `unrouteAll`) в `finally` всех тестов учителя. flow2 и flow3 после новых spec зелёные (начинают с «Отвечено: 0 / 5»).

## codegraph impact (D-29)

`codegraph impact TestRunner` (индекс основного дерева):
- `function TestRunner` — `app/web/components/tests/TestRunner.tsx:139`
- `TestPageClient` — `app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx:14`
- `TestPage` — `app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/start/page.tsx:7`

`codegraph impact takeTest`:
- `function takeTest` — `e2e/fixtures/exam.ts:155`
- `e2e/tests/attempt-chart.spec.ts` (тест `seq-d2-<p>`, не пересекается с all-templates)
- `e2e/tests/review.spec.ts` (flow3, all-templates)
- `e2e/tests/take-test.spec.ts` (flow2, all-templates)

План не меняет ни TestRunner, ни takeTest: новые spec только вызывают `answerQuestion`.

## codegraph affected

`codegraph affected e2e/tests/answer-durability.spec.ts e2e/tests/question-draft-durability.spec.ts` (запуск по индексу основного дерева, где этих файлов ещё нет), вывод дословно:

```
Affected test files (2):

  e2e/tests/answer-durability.spec.ts
  e2e/tests/question-draft-durability.spec.ts
```

## Падения без пометки test.fail() (T-6-02)

Прогон `yarn e2e --grep "@life02"` без пометки: подготовка зелёная в обоих проектах, тест дефекта упал на утверждении о дефекте в обоих проектах (cleanup в finally прошёл: иначе его ошибка заменила бы ошибку утверждения):

```
Error: expect(locator).toBeVisible() failed
Locator: getByText('Отвечено: 2 / 5')
Expected: visible
Timeout: 5000ms
Error: element(s) not found
  > 64 | await expect(page.getByText(`Отвечено: 2 / ${count}`)).toBeVisible()
```

Снимок страницы в момент падения (error-context, оба проекта): `paragraph: "Отвечено: 0 / 5"`, на вопросе 1 ни один radio не выбран — после перезагрузки потеряны оба ответа (запись WAL вопроса 1 отменена ответом на вопрос 2 внутри общего дебаунса, запись вопроса 2 не успела).

Прогон `yarn e2e --grep "@life04"` без пометки: подготовка зелёная, проверка «Отмена» упала в обоих проектах; проверка перезагрузки в этом прогоне не выполнялась («2 did not run»: describe.serial пропускает тесты после падения), поэтому прогнана отдельно `yarn e2e --grep "перезагрузка во время задержанного PATCH"`:

```
[«Отмена», chromium-desktop]
Error: expect(locator).toContainText(expected) failed
Locator: getByRole('textbox').first()
Expected substring: "Черновик e2e отмена desktop"
Received string:    ""
  > 82 | await expect(promptEditor(page)).toContainText(prompt)

[«Отмена», chromium-mobile]
Expected substring: "Черновик e2e отмена mobile"
Received string:    ""

[перезагрузка с задержанным PATCH, chromium-desktop]
Error: expect(locator).toContainText(expected) failed
Locator: getByRole('textbox').first()
Expected substring: "Черновик e2e перезагрузка desktop"
Received string:    ""
  > 113 | await expect(promptEditor(page)).toContainText(prompt)

[перезагрузка с задержанным PATCH, chromium-mobile]
Expected substring: "Черновик e2e перезагрузка mobile"
Received string:    ""
```

Все три проверки падают на утверждении о дефекте, не на подготовке. После этого добавлен `test.fail()` первой строкой тела каждой проверки дефекта.

## Verification

| Проверка | Итог |
|----------|------|
| `yarn e2e --grep "@life02"` | exit 0, `8 passed`; два теста дефекта засчитаны как ожидаемые падения (desktop, mobile) |
| `life02 red ok` (acceptance Task 1) | печатает `life02 red ok` |
| `yarn e2e --grep "@life04"` | exit 0, `10 passed`; четыре теста дефекта засчитаны как ожидаемые падения |
| `life04 red ok` (acceptance Task 2) | печатает `life04 red ok` |
| `yarn e2e --grep "@life02\|@life04\|@flow2\|@flow3\|@flow4"` | exit 0, `30 passed`, ни failed, ни flaky; flow2, flow3, flow4 зелёные на обоих проектах |
| `yarn e2e` (весь набор, дополнительно) | exit 0, `148 passed`, ни failed, ни flaky; шесть ожидаемых падений |
| `yarn verify` | `yarn verify: OK` |
| Сверка файлов по отпечатку `before-06-01` | `06-01 changed only its files` |

Все прогоны e2e запускались с `CI=1` (reporter list без html-отчёта); `test-results/` и `playwright-report/` в `.gitignore`.

## Task Commits

Коммиты не выполнялись (правило пользователя): изменения в рабочем дереве worktree `gsd/phase-06`. Порядок «сначала красный прогон без пометки, потом test.fail()» соблюдён по сути для всех трёх проверок.

## Files Created/Modified

- `e2e/tests/answer-durability.spec.ts` — LIFE-02: подготовка и проверка дефекта, помощники `openRunner`, `closeOpenAttempt`, `correctOptionText`
- `e2e/tests/question-draft-durability.spec.ts` — LIFE-04: подготовка и две проверки дефекта, помощники `testPageUrl`, `typeSelect`, `promptEditor`, `openNewDraft`, `testIdOf`, `deleteDraft`

## Файлы к коммиту

- `e2e/tests/answer-durability.spec.ts`
- `e2e/tests/question-draft-durability.spec.ts`

## Decisions Made

- Ожидание PATCH в проверке задержанного PATCH фильтруется по формулировке в теле: иначе оно срабатывает на PATCH гидратации (решение исполнителя, автономно; поведение утверждения не ослаблено).
- `correctOptionText` локален в spec: `optionText` в `e2e/fixtures/exam.ts` не экспортируется, а фикстуры план не меняет.
- `randomUUID` берётся из `node:crypto`.

## Deviations from Plan

Отклонений по содержанию нет. Проверка перезагрузки без пометки прогнана отдельной командой, потому что describe.serial пропустил её после падения проверки «Отмена».

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева `/Users/kdvornichenko/bio-exam`.

## Known Stubs

Нет.

## Deferred human verification

Нет: план только добавляет e2e. Коммит файлов плана делает ведущая сессия.

## Next Phase Readiness

- 06-09 снимает `test.fail()` с `LIFE-02 known defect (чинит 06-09)` в `e2e/tests/answer-durability.spec.ts`.
- 06-08 снимает `test.fail()` с обеих проверок `LIFE-04 known defect (чинит 06-08)` в `e2e/tests/question-draft-durability.spec.ts`. Проверки в describe.serial: при снятии пометки с одной из них без починки следующая будет пропущена.

## Self-Check: PASSED

- FOUND: e2e/tests/answer-durability.spec.ts
- FOUND: e2e/tests/question-draft-durability.spec.ts
- FOUND: .planning/commit-snapshots/before-06-01/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя
