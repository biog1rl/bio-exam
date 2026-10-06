---
phase: 06-draft-durability
fixed_at: 2026-10-05
review_path: .planning/phases/06-draft-durability/06-REVIEW.md
disposition_path: .planning/phases/06-draft-durability/06-REVIEW-DISPOSITION.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Фаза 6: исправления по ревью кода

Объём работы задан разделом «Чинить в фазе 6» файла `06-REVIEW-DISPOSITION.md`: CR-02, CR-01, CR-11, CR-04, NQ-01, NQ-03, NQ-09. Пункты из «Отложено» не трогались. Правки внесены в worktree `wt-phase-06` (ветка `gsd/phase-06`, база 57ec83c). Коммит не делался: по правилу пользователя изменения остаются в рабочем дереве.

Проверки запускались в worktree `wt-phase-06`, а не в основном checkout.

## CR-02: повтор после 409 несёт последний payload

**Файл:** `app/web/lib/drafts/question-draft-autosave.ts` (`exchange`).
**Правка:** после 409 и перечитывания `lockVersion` повтор отправляет `latestPayload`, а не захваченный payload. Результат применяется к `latestSerial` (`applyResult(second, retrySerial)`). Правка совпадает с пробой `da6code/drafts-latest`. Ранний возврат `OK` из `drafts-okreturn` не взят: в этом варианте не приходит уведомление `conflict-resolved`. `save-queue.ts` не менялся (изменение `drain` относится к CR-03, он отложен).
**Тесты** (`app/web/lib/drafts/question-draft-autosave.test.ts`):
- «CR-02: p1 в полёте, change(p2), dispose, сервер применил p2 первым, p1 получил 409 → повтор несёт p2, на сервере p2». Последовательность вызовов: `[p1@1, p2@1, p2@2]`, последняя запись на сервер — p2.
- «CR-02: 409 при ожидающей правке p2 → повтор шлёт p2, conflict-resolved, повторной записи p1 нет». Вызовы `[p1@1, p2@2]`, уведомление `['conflict-resolved']`, за 10 с новых вызовов нет, статус `saved`, локальная копия снята.

Про «копия не теряется» из disposition: как только сервер подтверждает p2, `settleCopy` удаляет локальную копию, потому что она совпадает с подтверждённым payload. Правка не теряется, потому что на сервере лежит p2, и первый тест проверяет именно это. При обратном порядке (сначала подтверждён p1) копия p2 остаётся и получает `baseLockVersion` 2. Удаляется она только после подтверждения повтора с p2.

**Красный прогон:** 2 failed. В обоих тестах повтор с `lockVersion` 2 нёс `{ text: 'p1' }` вместо `{ text: 'p2' }`.
**Зелёный прогон:** `npx vitest run lib/drafts`: 6 файлов, 100 passed.

## CR-01: плашка сбоя отправки после неудачного повтора при восстановлении

**Файл:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts` (`resubmit`).
**Правка:** после неудачного повтора и `runStart(current)` модуль ставит `submitFailed = true` и вызывает `emit()`, если не сменились поколение и `sessionId` и фаза равна `active`. Условие вынесено в `activeIn(gen, sessionId)`: внутри `resubmit` TypeScript сужал тип `phase` до `'starting'` и выдавал TS2367. Решение пользователя выполнено: плашка показывается и после автосдачи, и после ручной отправки. Повтор `runSubmit(true)` по событию `online` не добавлялся, потому что его нет в disposition.
**Тесты** (`lifecycle-restore.test.ts`):
- в тест «frozenKey и сохранённый clientAttemptId, повтор упал с 500» (прежняя строка `:340`) добавлена проверка `submitFailed === true`;
- в цикл «503 / сбой сети / 400: обычный путь /start s1» (ручная отправка до перезагрузки) добавлена проверка `submitFailed === true`;
- новый тест «CR-01: frozenKey, повтор упал с 500, /start вернул другую s2 → active без плашки сбоя отправки» (`submitFailed === false`, уведомление `session-replaced`);
- новый тест «CR-01: frozenKey, повтор упал сетью, /start тоже упал сетью → active с кэшированной s1 и плашкой сбоя отправки».

**Красный прогон:** 5 failed с `false !== true`: три случая цикла, тест `:340` и новый тест с кэшированной s1. Тест с s2 был зелёным и до правки: он проверяет, что плашка не появляется.
**Зелёный прогон:** `npx vitest run components/tests`: 15 файлов, 281 passed.

## CR-04: «Завершить» без сессии сливает черновик сервера с локальными ответами

**Файл:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts` (`startForSubmit`, новая `mergeServerDraft`).
**Правка:** когда `/start` перед отправкой ответил, модуль строит отвязанную запись (`sessionId: null`) из ответов в памяти, а не перечитывает WAL: при незаписываемом хранилище работа ученика есть только в памяти. Эта запись передаётся в `resolveRestoredDraft({ server, wal, cachedSessionId: null, questionIds })`. Действует правило D-12: локальный ответ важнее, черновик сервера заполняет пропуски, телеметрия сливается `mergeTelemetryMaps`. Затем выполняются `persistAll` и отправка, как решил пользователь. Возврата в `active` и уведомления `session-restored` нет.
**Решение исполнителя (автономно):** позиция (`position`) при слиянии не меняется, чтобы во время отправки не прыгать на `draftLastQuestionId` сервера.
**Тесты** (`lifecycle-submit.test.ts`):
- новый тест «CR-04: отправка без сессии, /start вернул черновик той же сессии с другого устройства → тело submit с ответами обоих, локальный побеждает». Локально `{Q1: 'local', Q3: 'only-local'}`, на сервере `{Q1: 'server', Q2: 'from-laptop'}` с телеметрией Q2. В теле submit `{Q1: 'local', Q2: 'from-laptop', Q3: 'only-local'}`, телеметрия Q1 и Q2. В WAL сессия s1, `pending` = [Q1, Q3]. Позиция Q1, уведомлений нет.
- тест «отправка без сессии: сначала /start s2…» ожидал прежнее поведение (черновик сервера отбрасывался). По решению пользователя ожидание теперь `answers: { [Q1]: 'a', [Q2]: 'server' }`. Тест изменился по замыслу CR-04, это не случайное покраснение.

**Красный прогон:** 2 failed. В обоих тестах в теле submit не было ответа Q2 из черновика сервера (`- '2222…': 'server'` и `- '2222…': 'from-laptop'` вместе с телеметрией Q2).
**Зелёный прогон:** `npx vitest run components/tests`: 282 passed.

## CR-11: модуль принимает новый список вопросов на лету

**Файлы:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts`, `app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts`.
**Правка:**
- В тип `AttemptLifecycle` и модуль добавлен `setQuestionIds(ids)`. Он обновляет `questionIds` и `knownQuestions`. Тот же список (в том же порядке) ничего не делает и подписчиков не будит, поэтому повторные вызовы из StrictMode и SWR безопасны.
- Ответы на исчезнувшие вопросы не отправляются: тело submit собирается через `knownAnswers()` (фильтр по `knownQuestions`), `enqueuePending` пропускает неизвестные id, а `answer`/`navigate` по ним уже отбрасываются.
- Хук `use-attempt-lifecycle.ts` выносит сортировку в `orderedQuestionIds`, считает список через `useMemo` от `questions` и передаёт его в эффекте `lifecycle.setQuestionIds(questionIds)`. Ключ `AttemptRunner` в `TestRunner.tsx` не менялся.

**Решение исполнителя (автономно):** если текущий вопрос исчез из списка, позиция переходит на первый вопрос нового списка: сегмент времени закрывается и открывается заново. Иначе `currentIndex` в TestRunner становится −1. Телеметрия и ответы исчезнувшего вопроса остаются в WAL, но в submit не попадают.
**Тесты** (`lifecycle.test.ts`, describe «CR-11: список вопросов меняется во время прохождения»):
- «новый вопрос после setQuestionIds: answer пишет WAL и уходит в очередь, navigate на него работает». До смены списка ответ на Q4 отбрасывается. После смены в WAL `answers {Q4: 'd'}`, `pending [Q4]`, через 600 мс `savedBodies()` = `[{questionId: Q4, value: 'd'}]`.
- «ответ на исчезнувший вопрос не попадает в тело submit, позиция с него уходит на первый вопрос». Q3 отвечен, затем удалён из списка. В submit только `{Q1: 'a'}`, позиция Q1, поздний ответ на Q3 игнорируется.
- «тот же список повторно не вызывает уведомления подписчиков».

**Красный прогон:** 3 failed: `TypeError: lifecycle.setQuestionIds is not a function`.
**Зелёный прогон:** `npx vitest run components/tests`: 285 passed. `npx tsc --noEmit` в `app/web`: exit 0.

## NQ-01: e2e «правка и сразу «Отмена»» проверяет сервер и локальную копию

**Файл:** `e2e/tests/question-draft-durability.spec.ts`.
**Правка:** после `toHaveURL` тест читает `GET /api/tests/${testId}/question-drafts/${draftId}` и проверяет, что `draft.payload` содержит prompt. Затем берёт `userId` из `GET /api/auth/me` (новая функция `currentUserId`) и проверяет, что `localStorage.getItem('question-draft-wal-<draftId>-<userId>')` равен `null`. Префикс `question-draft-wal-` сверен с `COPY_KEY_PREFIX`. Прежние `page.goto(url)` и `toContainText(prompt)` остались.
**Красный прогон:** не применимо. Добавлена проверка уже работающего поведения, и в disposition для этого пункта тест не задан.
**Зелёный прогон:** в составе `yarn e2e`, см. итоги ниже.

## NQ-03: охранный тест TestRunner ловит отложенный ответ и прямые вызовы API попытки

**Файл:** `scripts/draft-durability-guards.test.mjs`.
**Правка:** в `TEST_RUNNER_CHECKS` добавлены `setTimeout`, `saveAttemptDraft`, `submitPublicTestAnswers` и `startTestSession`. Перед этим проверено, что в `TestRunner.tsx` таких строк нет. Тест детекторов получил положительные образцы (`setTimeout(() => lifecycle.answer(…), 300)`, `window.setTimeout`, импорт и вызовы трёх функций API) и отрицательные (`lifecycle.submit()`, `lifecycle.confirmStart()`, `lifecycle.answer(…)`).
**Проба на копии:** в тест «проба: вставка запрещённой строки в копию файла…» добавлены две копии TestRunner во временном каталоге. Первая — с `setTimeout(() => lifecycle.answer(…), 300)`: ровно одно нарушение с `setTimeout`. Вторая — с импортом `saveAttemptDraft, startTestSession, submitPublicTestAnswers` в первой строке: одно нарушение `TestRunner.tsx:1` со всеми тремя метками.
**Красный прогон:** до добавления проверок падали детектор (`AssertionError: const timer = setTimeout(() => lifecycle.answer(questionId, value), 300)`) и проба (`Expected values to be strictly equal`: 0 нарушений вместо 1).
**Зелёный прогон:** `node --test scripts/draft-durability-guards.test.mjs`: 7 pass, 0 fail.

## NQ-09: во frontmatter навыков только name и description

**Файл:** `scripts/check-docs-structure.test.mjs`.
**Правка:** добавлена функция `frontmatterKeys(text)` и два теста. Первый: «во frontmatter каждого навыка только name и description» (для `bio-exam-web`, `bio-exam-api`, `bio-exam-data` ключи равны `['description', 'name']`). Второй: «разбор frontmatter навыка находит лишние ключи» (самопроверка на строках с `license` и `allowed-tools` и на тексте без frontmatter).
**Красный прогон:** в `.agents/skills/bio-exam-web/SKILL.md` временно добавлена строка `license: MIT`, и тест «во frontmatter каждого навыка только name и description» упал (✖). Строка удалена правкой файла, `git diff` по SKILL.md пуст.
**Зелёный прогон:** `node --test scripts/check-docs-structure.test.mjs`: 11 pass, 0 fail.

## Итоговые проверки (worktree `wt-phase-06`)

- `npx oxfmt --check .`: «All matched files use the correct format». Файлы форматировались по одному (`npx oxfmt ./путь`).
- `yarn verify`: `yarn verify: OK`, все восемь шагов passed. Тесты: web 43 файла / 871, server 54 / 1119, exam-core 12 / 605, rbac 1 / 3, script-tests 183 pass / 0 fail; Turbo 14/14.
- `yarn e2e`: 150 passed (1.9m), exit 0, без failed и flaky. «LIFE-04: правка и сразу «Отмена» сохраняют последнюю правку» с новыми проверками NQ-01 зелёный в chromium-desktop и chromium-mobile.

## Файлы к коммиту

Коммит не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-06`:

- `app/web/lib/drafts/question-draft-autosave.ts` (CR-02)
- `app/web/lib/drafts/question-draft-autosave.test.ts` (CR-02)
- `app/web/components/tests/attempt-lifecycle/lifecycle.ts` (CR-01, CR-04, CR-11)
- `app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts` (CR-11)
- `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts` (CR-01)
- `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts` (CR-04)
- `app/web/components/tests/attempt-lifecycle/lifecycle.test.ts` (CR-11)
- `e2e/tests/question-draft-durability.spec.ts` (NQ-01)
- `scripts/draft-durability-guards.test.mjs` (NQ-03)
- `scripts/check-docs-structure.test.mjs` (NQ-09)

Изменения только поведенческие и тестовые. Отдельного коммита с одним форматированием нет: oxfmt менял только строки, которые и так правились.

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
