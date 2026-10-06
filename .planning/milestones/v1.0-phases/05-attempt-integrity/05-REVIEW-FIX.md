---
phase: 05-attempt-integrity
fixed_at: 2026-10-04T20:55:00Z
review_path: .planning/phases/05-attempt-integrity/05-REVIEW.md
disposition_path: .planning/phases/05-attempt-integrity/05-REVIEW-DISPOSITION.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Фаза 5: исправление находок ревью

**Источник:** `05-REVIEW-DISPOSITION.md`, таблица «Чинить в фазе 5»: CR-01(а), CR-02, NQ-06, NQ-03, NQ-02.
**Где выполнено:** worktree `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/bde259ee-d6cb-4f21-8450-32718d096f81/scratchpad/wt-phase-05`, ветка `gsd/phase-05`, база `106a949`. Правки, тесты, `yarn verify` и `yarn e2e` выполнены в этом worktree.
**Коммит:** не выполнялся (правило пользователя), изменения в рабочем дереве.

Остальные разделы разбора (решения пользователя, отложенное, опровергнутое) не трогались. Логика восстановления просроченной попытки (CR-01(б,в), CR-04, CR-05) не менялась, её делает фаза 6.

## Итог

| id | Статус | Файлы | Тест | Красный до правки |
|---|---|---|---|---|
| CR-01(а) | fixed: requires human verification | `app/web/components/tests/TestRunner.tsx` | нет (шва нет) | — |
| CR-02 | fixed | `app/web/components/tests/runner-result-card.ts`, `app/web/components/tests/runner-result-card.test.ts` | 2 новых | да, 2 падения |
| NQ-06 | fixed (тест) | `app/server/src/routes/tests/attempt-submit.test.ts` | 1 новый | нет, сразу зелёный; мутация ловится |
| NQ-03 | fixed (тест) | `app/server/src/routes/tests/attempt-view-leak.test.ts` | 2 новых | нет, сразу зелёные; мутация ловится |
| NQ-02 | fixed (тест) | `app/server/src/routes/tests/attempt-view-leak.test.ts` | 1 новый | нет, сразу зелёный; мутация ловится |

## Исправленные находки

### CR-01(а): очистка хранилища до паузы автосдачи

**Файлы:** `app/web/components/tests/TestRunner.tsx`
**Правка:** в `doSubmit` вызовы `debouncedSaveAnswer.cancel()` и `clearAttemptStorage('success')` перенесены сразу после успешного `submitPublicTestAnswers(...)`, до паузы 1,5 с с экраном «Время вышло». `setSession(null)` остался на прежнем месте, после `setSubmitResult`. Если вкладку закрыть во время паузы, в `localStorage` уже нет `session`, `frozen`, `clientAttemptId` и WAL сданной попытки.
**Тест:** не добавлен. Web-тесты идут в `environment: 'node'` без DOM и React (`app/web/vitest.config.ts`), а новые пакеты добавлять нельзя. Шва для проверки порядка внутри компонента нет. По разбору e2e-проверка `localStorage` после автосдачи не обязательна, в e2e нет теста с лимитом времени.
**Ручная проверка:** тест с лимитом 1 минута, дождаться автосдачи, в первые 1,5 с экрана «Время вышло» посмотреть в DevTools, что ключей `test-session-*`, `test-frozen-*`, `test-answers-wal-*` и `clientAttemptId` теста уже нет.
**Замечание исполнителя (не исправлялось, вне находки):** обработчик `visibilitychange` вызывает `applyTelemetry`, который пишет телеметрию в WAL. Если скрыть вкладку во время паузы или на экране результата, WAL с пустыми ответами и телеметрией появляется снова. Так было и до правки после любой сдачи.

### CR-02: «Без оценки» при отсутствующем или неизвестном статусе

**Файлы:** `app/web/components/tests/runner-result-card.ts`, `app/web/components/tests/runner-result-card.test.ts`
**Правка:** параметр `runnerResultCard` — `QuestionStatus | undefined`. Карточка берётся из таблицы только при собственном ключе (`Object.hasOwn`), иначе `ungraded` («Без оценки»). Вызов в `TestRunner.tsx:812` не менялся.
**Тесты:**
- `runnerResultCard: статус отсутствует, карточка «Без оценки»`;
- `runnerResultCard: неизвестный статус даёт «Без оценки»`.

**Красный до правки:** `Tests 2 failed | 5 passed (7)`, получено `{}` вместо `{ label: 'Без оценки', className: 'rounded border bg-muted/30 p-3 text-sm' }`. После правки `Tests 7 passed (7)`.

### NQ-06: PATCH черновика после submit той же сессии

**Файлы:** `app/server/src/routes/tests/attempt-submit.test.ts`
**Тест:** `POST submit: сдача и повтор` › `PATCH черновика в сданную сессию отвечает 404, черновик остаётся пустым`. Черновик сохраняется, сессия сдаётся, затем PATCH ответа и телеметрии в ту же сессию: 404 `{ error: 'Session not found or already submitted' }`; у сессии `attempt_id` сданной попытки, `draft_answers`, `draft_last_question_id`, `draft_telemetry`, `draft_updated_at` — NULL.
**Результат:** сразу зелёный, поведение уже верное. Проверка мутацией: без `isNull(testSessions.submittedAt)` в `openSessionOf` (`sessions.ts`) тест падает на `AssertionError`; файл восстановлен из копии, `git diff` по `services/` пуст.

### NQ-03: повтор submit после смены showCorrectAnswer

**Файлы:** `app/server/src/routes/tests/attempt-view-leak.test.ts`
**Тесты:** `повтор submit после смены showCorrectAnswer`:
- `ключ был открыт при сдаче, затем скрыт: повтор без ключа и вердиктов`: сдача при `show_correct_answer = true` (в ответе ключи `2314` и `Митоз`), затем `UPDATE tests SET show_correct_answer = false`, повтор того же конверта: 200, тот же `attemptId`, в теле нет `"2314"` и `"Митоз"`, у вопросов `keyVisible: false`, `correctAnswer`, `verdicts`, `mistakes` — null, статусы `partial` и `wrong` прежние;
- `ключ был скрыт при сдаче, затем открыт: повтор показывает сохранённый ключ и вердикты`: обратный случай; первый ответ без ключа, после `UPDATE ... = true` повтор показывает сохранённый ключ `2314`, вердикты `sequence_digits`, одну ошибку и ключ `Митоз`, баллы те же. Ожидание по D-15: видимость по текущей настройке, ключ — сохранённый при сдаче.

**Результат:** сразу зелёные.

### NQ-02: radio, checkbox, matching при скрытом ключе на уровне HTTP

**Файлы:** `app/server/src/routes/tests/attempt-view-leak.test.ts`
**Тест:** `скрытый ключ для radio, checkbox и matching` › `ответ submit не содержит ключа, вердиктов и числа ошибок, в строке ключ сохранён`. Ответы: radio `a` (ключ `b`), checkbox `['a']` (ключ `['a','c']`, частично верно), matching `{ l1: 'r1', l2: 'r3', l3: 'r2' }` (одна пара верна). Для каждого вопроса `isCorrect: false`, `keyVisible: false`, `correctAnswer`, `verdicts`, `mistakes` — null. В теле нет `"b"`, `"c"`, `"l2":"r2"`, `"l3":"r3"`, которых нет в ответах студента. В строке `test_attempts` версия 2 и ключи всех трёх вопросов сохранены.
**Результат:** сразу зелёный.

**Проверка мутацией для NQ-03 и NQ-02:** в `discloseToStudent` (`view.ts`) для неверного ответа при скрытом ключе отдавались `fact.verdicts`. Упали 4 из 5 тестов файла, включая все три новых; файл восстановлен из копии, `git diff` по `services/` пуст.

## Проверки

Выполнены в worktree.

- `yarn format:check`: `All matched files use the correct format.`
- `yarn verify` (лог `scratchpad/rf05-verify.log`), выход 0:
  ```
  verify summary:
    lockfile: passed
    env-contract: passed
    docs-commands: passed
    ci-workflow: passed
    format-check: passed
    lint-typecheck-test: passed
    migrations: passed
    script-tests: passed
  yarn verify: OK
  ```
  Тесты: rbac 2, exam-core 599, web 567 (24 файла), server 662 (35 файлов) — все прошли.
- `yarn e2e` (лог `scratchpad/rf05-e2e.log`), выход 0: `132 passed (55.2s)`.

## Файлы к коммиту

- `app/web/components/tests/TestRunner.tsx`
- `app/web/components/tests/runner-result-card.ts`
- `app/web/components/tests/runner-result-card.test.ts`
- `app/server/src/routes/tests/attempt-submit.test.ts`
- `app/server/src/routes/tests/attempt-view-leak.test.ts`

---

_Исправлено: 2026-10-04_
_Исполнитель: Claude (gsd-code-fixer)_
_Итерация: 1_
