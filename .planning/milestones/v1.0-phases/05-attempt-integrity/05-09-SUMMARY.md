---
phase: 05-attempt-integrity
plan: 09
subsystem: web
tags: [nextjs, react, radix, sonner, exam-core, vitest, playwright, attempts]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-06
    provides: "контракт submit с sessionId и clientAttemptId, коды 409 ATTEMPT_ALREADY_SUBMITTED и 422 TIME_EXPIRED, client-attempt-id.ts"
  - phase: 05-07
    provides: "AttemptView и AttemptQuestionView с полем status, questionStatus, ATTEMPT_GRACE_PERIOD_MINUTES в exam-core"
  - phase: 05-01
    provides: "runner-result-card.ts и KNOWN_DEFECTS SCORE-04-zero-points-status"
provides:
  - "api.ts: AttemptRequestError(status, code, attemptId) для /start и submit; submitPublicTestAnswers возвращает AttemptView"
  - "attempt-submit-flow.ts: classifySubmitFailure, classifyStartFailure, bannerFor, SUBMIT_FLOW_TEXT, storageKeysToClear, blocksInteraction, isClientExpired"
  - "TestRunner: плашка ошибки по UI-SPEC, Dialog 409 «Попытка уже сдана», AlertDialog 422 «Время вышло, ответы не засчитаны», восстановление с проверкой просрочки и другого sessionId"
  - "runnerResultCard(status: QuestionStatus) с вариантом «Без оценки»; SCORE-04-zero-points-status — обычный тест"
  - "types.ts реэкспортирует AttemptView, AttemptQuestionView, QuestionStatus; SubmitResult и SubmitResultItem больше не реэкспортируются"
affects: [05-10, 05-11, 06, 07]

estimate:
  tokens: 100000
  tasks: 3
actuals:
  tokens: 9700
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Реакция на ошибку старта и отправки выбирается чистым модулем attempt-submit-flow.ts с табличными тестами, TestRunner только применяет её"
    - "Очистка localStorage по событию: storageKeysToClear(event) → session, wal, frozen, clientAttemptId"

key-files:
  created:
    - app/web/components/tests/attempt-submit-flow.ts
    - app/web/components/tests/attempt-submit-flow.test.ts
  modified:
    - app/web/lib/tests/api.ts
    - app/web/lib/tests/types.ts
    - app/web/components/tests/TestRunner.tsx
    - app/web/components/tests/runner-result-card.ts
    - app/web/components/tests/runner-result-card.test.ts

key-decisions:
  - "Неуспешный /start перед отправкой не по 403 оборачивается в обычный Error, чтобы classifySubmitFailure дал retry, а не not-found (404 на /start — сбой старта, не потеря попытки)"
  - "Автосдача, упавшая на 403 или 404, тоже размораживает проход (UI-SPEC: «Автосдача упала не на 409 и 422 — как сейчас»); ввод всё равно выключен плашкой"
  - "На 409 и 422 отменяется отложенное сохранение ответа и session обнуляется, чтобы отложенная запись не вернула удалённый WAL и таймер не запустил автосдачу повторно; на 403 и 404 session не обнуляется, отложенная запись WAL сохраняется"
  - "Восстановление: при isClientExpired session из кеша в состояние не ставится, иначе таймер на нуле запустил бы автосдачу"
  - "AlertDialog 422 без overlayClassName с размытием: по UI-SPEC ответы под диалогом остаются видны"

patterns-established:
  - "Ошибки /start и submit — AttemptRequestError; остальные функции api.ts по-прежнему бросают Error(text)"

requirements-completed: [ATT-02, ATT-04, SCORE-04]

duration: 10min
completed: 2026-10-04
---

# Phase 5 Plan 09: экраны ошибок 403/404/409/422 в web по UI-SPEC Summary

**TestRunner различает 403, 404, 409, 422 и сбой через AttemptRequestError и чистый модуль attempt-submit-flow, показывает тексты UI-SPEC, чистит localStorage по таблице, а карточка результата берёт status вида и показывает «Без оценки» при 0 баллов.**

## Performance

- **Duration:** ~10 мин
- **Completed:** 2026-10-04
- **Tasks:** 3/3
- **Files modified:** 7 (2 созданы, 5 изменены)
- **Коммит:** не выполнялся (правило пользователя), изменения в рабочем дереве

## Accomplishments

- `api.ts`: `AttemptRequestError` с полями `status`, `code` (строковое `error` тела), `attemptId`; внутренняя `fetchAttemptJson` для `startTestSession` и `submitPublicTestAnswers`; `submitPublicTestAnswers(): Promise<AttemptView>`. `fetchJson` и остальные функции не менялись.
- `attempt-submit-flow.ts`: классификация отправки (409 ATTEMPT_ALREADY_SUBMITTED → already-submitted, 409 иной → retry, 422 TIME_EXPIRED → time-expired, 422 иной → retry, 403 → not-assigned, 404 → not-found, 400/5xx/сеть → retry) и старта (403 → not-assigned, иначе failed); `bannerFor` с дословными текстами и действием; `SUBMIT_FLOW_TEXT`; `storageKeysToClear`; `blocksInteraction`; `isClientExpired` с `ATTEMPT_GRACE_PERIOD_MINUTES` и строгим `>`, как в `sessions.ts` сервера. 43 табличных теста.
- `TestRunner.tsx`:
  - плашка `<section className="flex flex-wrap …">` с `<span role="alert" className="text-sm">`, кнопки «Повторить» (`doSubmit`) и «Обновить страницу» (`window.location.reload()`) только по действию;
  - `doSubmit`: `/start` при отсутствии сессии в своём try (403 → плашка start-not-assigned), 409 → Dialog «Попытка уже сдана» (`DialogTitle className="font-medium"`), «К результатам» при attemptId, иначе «Закрыть», закрытие → плашка already-submitted; 422 → AlertDialog без `onOpenChange`, «Начать заново» → `handleRetake`; 403 → плашка submit-not-assigned; 404 → плашка not-found; прочее → плашка retry, автосдача размораживается;
  - эффект старта: просрочка по часам клиента → AlertDialog 422 без `/start`; другой `sessionId` → `replaceWithNewSession` (ответы и телеметрия из черновика новой сессии, позиция `draftLastQuestionId` или первый вопрос, `toast.info('Предыдущая попытка закрыта, начата новая.')`); 403 → плашка start-not-assigned; то же для старта без лимита;
  - `handleConfirmStart`: 403 → плашка, иначе прежний `toast.error` и «Начать тест?» снова; `handleRetake` сбрасывает плашку и оба диалога, 403 → плашка;
  - `interactionDisabled` учитывает диалоги 409/422 и `blocksInteraction(banner)`;
  - удалены `ResultByQuestion`, `tryParseJson`, импорт `SUBMIT_ERROR_CODES`, тексты «Время для сдачи истекло» и «Тест уже был отправлен автоматически…»; карта результатов — `Record<string, AttemptQuestionView>`, карточка — `runnerResultCard(questionResult.status)`.
- `runner-result-card.ts`: `runnerResultCard(status: QuestionStatus)`; `ungraded` → «Без оценки», `rounded border bg-muted/30 p-3 text-sm`; классы трёх прежних статусов не менялись.
- `runner-result-card.test.ts`: KNOWN_DEFECTS и `defectTest` удалены; `SCORE-04-zero-points-status` — обычный `test`, сравнивает `runnerResultCard(questionStatus({ points: 0, isCorrect, earnedPoints: 0 })).label` с литералом `'Без оценки'` для `isCorrect` true и false; импорта `attempt-review-utils` и `getQuestionStatus` нет (решение ревью C2).
- `types.ts`: реэкспорт `AttemptView`, `AttemptQuestionView`, `QuestionStatus`; `SubmitResult` и `SubmitResultItem` убраны (`rg` по `app/web`: других импортов нет).

## Task Commits

Коммиты не выполнялись (правило пользователя), изменения в рабочем дереве.

1. **Task 1 (tracer): AttemptRequestError, классификация, путь 422** — тест модуля написан первым, RED: `Failed to resolve import ./attempt-submit-flow` (Test Files 1 failed, no tests); GREEN: 43 passed; web typecheck чистый; проверка «422 texts ok». Tracer-гейт: `<verify>` перезапущен после пути 422 — зелёный, расширение до Task 2.
2. **Task 2: 403, 404, 409, сбой, отправка без сессии, восстановление, «Начать»** — `vitest run components/tests`: 7 файлов, 117 passed + 1 expected fail (KNOWN_DEFECTS 05-01 до Task 3); typecheck чистый; «runner errors ok».
3. **Task 3 (tdd): карточка из status** — RED: новый тест против старой сигнатуры, 4 failed | 1 passed (correct, partial, ungraded, SCORE-04); GREEN после правки `runner-result-card.ts`: `components/tests` 7 файлов, 119 passed; «score-04 test independent».

## TDD Gate Compliance

- Task 3: RED (4 failed) зафиксирован до правки `runner-result-card.ts`, затем GREEN (5 passed). REFACTOR не понадобился. Коммиты RED/GREEN не создавались (правило пользователя).

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests`: Test Files 7 passed, Tests 119 passed.
- `yarn workspace @bio-exam/web typecheck`: без ошибок.
- `yarn workspace @bio-exam/web lint`: предупреждений в файлах плана нет (остальные предупреждения — прежние, в других файлах).
- `yarn verify`: `yarn verify: OK` (лог `scratchpad/verify-05-09.log`).
- `yarn e2e`: `132 passed (1.3m)` на проектах chromium и chromium-mobile, exit 0 (лог `scratchpad/e2e-05-09.log`).
- Allow-list: `05-09 changed only its files`.
- Отпечаток до правок: `fingerprint 05-09: 0 paths` в `.planning/commit-snapshots/before-05-09/fingerprint.json`.

## codegraph (D-23)

Индекс по основному дереву, без файлов, созданных в этом плане.

`codegraph impact startTestSession` — 7 символов: `api.ts` `startTestSession`; `TestRunner.tsx` `handleConfirmStart`, `TestRunner`, `startUntimedSession`, `restoreSession`, `handleRetake`, файл.

`codegraph impact submitPublicTestAnswers` — 5 символов: `api.ts` `submitPublicTestAnswers`; `TestRunner.tsx` `doSubmit`, `TestRunner`, `handleSubmit`, файл.

`codegraph impact TestRunner` — 5 символов: `TestRunner.tsx` `TestRunner`; `tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx` `TestPageClient` и файл; `start/page.tsx` `TestPage` и файл.

`codegraph affected` по семи файлам плана — 7 файлов, все в плане: `TestRunner.tsx`, `attempt-submit-flow.ts`, `attempt-submit-flow.test.ts`, `runner-result-card.ts`, `runner-result-card.test.ts`, `lib/tests/api.ts`, `lib/tests/types.ts`. Внешних потребителей вне плана нет.

## Decisions Made

- Решение исполнителя (автономно): неуспешный `/start` перед отправкой не по 403 оборачивается в `Error('start failed', { cause })`, поэтому `classifySubmitFailure` даёт retry, а 404 от `/start` не превращается в плашку «Попытка не найдена».
- Решение исполнителя (автономно): автосдача, упавшая на 403 или 404, размораживает проход и удаляет `frozenKey`, как требует строка UI-SPEC «Автосдача упала не на 409 и 422»; ввод при этом выключен плашкой.
- Решение исполнителя (автономно): на 409 и 422 — `debouncedSaveAnswer.cancel()` и `setSession(null)`; на 403 и 404 session остаётся в состоянии, чтобы отложенная запись WAL не потерялась (WAL по таблице остаётся).
- Решение исполнителя (автономно): `replaceWithNewSession` также снимает `frozen` (frozenKey мог выставить его при монтировании) и сбрасывает телеметрию на черновик новой сессии до записи WAL.
- Решение исполнителя (автономно): AlertDialog 422 без `overlayClassName="bg-black/60 backdrop-blur-xl"`, который стоит у «Начать тест?»: UI-SPEC требует, чтобы ответы под диалогом оставались видны.
- Решение исполнителя (автономно): подписи кнопок плашки «Повторить» и «Обновить страницу» лежат в `SUBMIT_FLOW_TEXT` (`retryAction`, `reloadAction`).

## Deviations from Plan

None - план выполнен как написан; решения исполнителя перечислены выше.

## Слияние с фазой 7

Правки `TestRunner.tsx` сделаны точечными заменами, `yarn oxfmt` трогал только изменённые строки. Хунк удаления `tryParseJson` (прежние строки 83-90) стоит вплотную над JSDoc `extractImagePaths`; саму функцию и импорт `@/lib/image-signed-url-cache` план не менял. Если фаза 7 правила JSDoc над `extractImagePaths`, при слиянии возможен конфликт контекста в этом месте: решение — взять версию фазы 7 для `extractImagePaths` и удалить `tryParseJson`.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: T-5-29 (просрочка по часам клиента только решает, показывать ли диалог 422; отправку принимает сервер), T-5-30 (клиентские sessionId и clientAttemptId ничего не разрешают), T-5-31 (на экран идут только тексты UI-SPEC; тело ошибки сервера читается в `code` и `attemptId` и в разметку не попадает) закрыты, как в плане.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- UI-SPEC [авто] требует подтверждения: высота `h-8` у кнопок плашки (альтернатива `size="default"`); вес 500 у заголовков диалогов 409 и 422; поведение 404 (WAL остаётся); замена ответов при другом `sessionId`; повторное открытие «Начать тест?» после неудачного «Начать»; проверка просрочки по часам клиента; тело 403 без машинного кода.
- UI-SPEC backstop: на ширине 375px открыть страницу прохождения и проверить: текст плашки ошибки переносится, кнопка под текстом; кнопки подвала диалогов 409 и 422 в столбец; горизонтального скролла нет. Как вызвать: 409 — сдать попытку во второй вкладке и нажать «Завершить» в первой; 422 — тест с лимитом, вернуться на страницу через лимит + 2 минуты; плашка 403 — снять назначение студента и нажать «Завершить».
- UI-SPEC unresolved «403 при открытии страницы теста»: `TestPageClient` показывает «Тест не найден» на любую ошибку чтения теста, в том числе 403; в фазе не меняется.
- UI-SPEC unresolved «PATCH черновика получил 403 или 404»: молча, ответ остаётся в WAL; студент узнаёт при отправке; индикатор сохранения — Phase 6.
- UI-SPEC unresolved «вкладка, открытая до деплоя»: старый JS без `sessionId` получает 400 и старую плашку, «Повторить» не помогает, помогает перезагрузка (D-25, тихое окно).
- CONTEXT `<specifics>` п. 8: «Без оценки» в карточке `TestRunner` при 0 баллов — визуально подтвердить на тесте с вопросом весом 0.
- Коммит файлов плана делает пользователь (или оркестратор по разрешённому режиму).

## Файлы к коммиту

- app/web/lib/tests/api.ts
- app/web/lib/tests/types.ts
- app/web/components/tests/attempt-submit-flow.ts
- app/web/components/tests/attempt-submit-flow.test.ts
- app/web/components/tests/TestRunner.tsx
- app/web/components/tests/runner-result-card.ts
- app/web/components/tests/runner-result-card.test.ts

## Next Phase Readiness

- 05-10 может удалять `getQuestionStatus`: тест карточки от неё не зависит.
- Вид разбора в `QuestionAnswerReview` внутри `TestRunner` по-прежнему получает прежние свойства; переключение на вид — 05-10.

## Self-Check: PASSED

- Файлы существуют: `attempt-submit-flow.ts`, `attempt-submit-flow.test.ts` созданы; пять изменённых файлов в `git status`.
- Коммитов нет по правилу пользователя; проверка коммитов не применяется.
