# Squad review — phase 5

- Дата: 2026-10-04
- Планы: 05-01 … 05-11
- Порядок проверки:
  1. Критики: plan-critic (gsd-plan-checker), code-critic, risk-critic.
  2. devils-advocate (opus).
  3. Один цикл ревизии gsd-planner (opus).
  4. Перепроверка gsd-plan-checker (opus): VERIFICATION PASSED.
- Outcome: **REVISED**, открытых BLOCKER нет.

## Surviving findings

| id | severity | verdict | статус | где |
|---|---|---|---|---|
| R1 | MAJOR | CONFIRMED | fixed | D-25 и 05-11 T3: тихое окно (SQL п.1 = 0); миграции непосредственно перед деплоем; web, сразу за ним server; откат только парой server → web. Если тихого окна нет — STOP, решает пользователь (один релиз server с необязательным `sessionId`). |
| R2 | MAJOR | CONFIRMED | fixed | 05-06: просрочку решает только `precheckSubmit` на входе, транзакция проверяет только «сдана» и «закрыта». CONTEXT D-08 п.3 поправлен. |
| C1 | MAJOR | CONFIRMED | fixed | 05-10: `summaryText` только у `sequence_digits`; `getCorrectLines` вне моделей снимка; sha256 снимка 05-02 сверяется. |
| C2 | MAJOR | CONFIRMED | fixed | 05-09 T3: сравнение с литералом `'Без оценки'`, без `getQuestionStatus`. |
| Стык с фазой 7 | MAJOR | CONFIRMED | fixed | Без `vi.mock` хранилища, in-memory адаптер 07-01 через `memoryStorage()`; предусловие — порт хранилища в `dev`; `rg`-проверки в 05-01/04/05/06/07/08. |
| R3 | MINOR | DOWNGRADED | fixed | 05-06: superseded → 404 `Session not found`; CONTEXT D-03 поправлен. |
| R4 | MINOR | DOWNGRADED | fixed | 05-07: `toStorableFact` с `safeParse`, понижение до null вместо броска. |
| P1/R6 | MINOR | DOWNGRADED | fixed | 05-08: read-only SQL с `jsonb_typeof`. |
| R5 | MINOR | — | fixed | 05-03: `SET LOCAL lock_timeout = '5s'` в 0022. |
| R8 | MINOR | — | fixed | 05-07/05-08: правило слияния общих с фазой 7 файлов. |
| C4–C8 | MINOR | — | fixed | Вопрос без вида; `AnyPgColumn` и typecheck до generate; льгота параметром; `testAssignments` только в `access.ts`; поиск значений в кавычках. |

## Refuted

- C3: параллельные волны. Планы исполняются строго по одному.
