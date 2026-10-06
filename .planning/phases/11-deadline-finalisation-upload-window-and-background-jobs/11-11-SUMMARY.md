---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 11
subsystem: web
tags: [attempt-lifecycle, server-clock, deadline, readonly, e2e]
requires: [11-01, 11-02]
provides:
  - createServerClock и серверное время в модуле попытки
  - AttemptSnapshot.deadlinePassed
  - D-12 в модуле: после дедлайна answer() ничего не меняет, interactionDisabled истинно
  - автоповтор автосдачи на online и visible
  - DeadlinePanel вместо оверлея «Время вышло»
  - проп readOnly у QuestionInput, таймер role="timer"
affects: [11-12, 11-13, 11-14, 11-15]
actuals:
  tokens: 7600
  tasks: 3
  commits: 0
plan_head_before: 42fe04aeaa5e88affb1abd04638456f93d61a8c5
plan_head_after: 42fe04aeaa5e88affb1abd04638456f93d61a8c5
tech-stack:
  added: []
  patterns: [часы сервера как шов поверх clock.now в чистом модуле]
key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/server-clock.ts
    - app/web/components/tests/attempt-result/DeadlinePanel.tsx
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
    - app/web/components/tests/QuestionInput.tsx
    - app/web/components/tests/TestRunner.tsx
    - e2e/tests/timed-attempt.spec.ts
key-decisions:
  - "Якорь серверного времени ставится по ответу /start (runStart, startForSubmit), не по PATCH черновика"
  - "Смещение в кэше сессии не хранится"
  - "Пауза TIME_UP_PAUSE_MS и showTimeUp сохранены; панель видна не меньше 1,5 с перед исходом"
  - "После дедлайна снимок отдаёт secondsLeft 0, поэтому таймер 00:00 не пропадает и во время паузы после 200"
  - "Класс read-only:bg-muted ставится только при readOnly, чтобы выключенное поле при ручной сдаче не меняло фон"
status: complete
---

# Phase 11 Plan 11: Серверное время и только чтение после дедлайна Summary

Таймер и момент дедлайна в модуле попытки считаются по смещению `serverNow` из `/start`. После дедлайна текстовые поля переходят в `readOnly`, `answer()` ничего не меняет даже после сбоя автосдачи, при возврате связи автосдача повторяется сама с прежним `clientAttemptId`. Полноэкранный оверлей заменён панелью «Время вышло» в потоке страницы.

## Что сделано

- `server-clock.ts`: `createServerClock(deviceNow)` с `observe`, `now`, `offsetMs`. Смещение 0 до первого `observe`, невалидная строка и `null`/`undefined` игнорируются.
- `lifecycle.ts`: `serverClock` поверх `clock.now`; `observe(server.serverNow)` в `runStart` и `startForSubmit`; `secondsLeft`, `scheduleTick`, `isAbandonedExpired` считают «сейчас» по `serverClock.now()`, телеметрия и индикатор сохранения остались на часах устройства. Флаг `deadlinePassed` ставится в `onTick` при `left <= 0` до автосдачи, снимается в `init`, `reset` и в `applyServerSession`, когда пришла другая сессия; `failSubmit` его не трогает. `interactionDisabled` = фаза из `DISABLED_PHASES` или `deadlinePassed`; `answer()` при `deadlinePassed` выходит сразу (снимок и WAL не меняются). В `onVisibility` на `online` и `visible` при `deadlinePassed && submitFailed` в фазе `active` запускается `runSubmit(true)`. После дедлайна `secondsLeft` в снимке равен 0.
- `QuestionInput.tsx`: проп `readOnly`; текстовый `Input` — `readOnly`, `disabled={disabled && !readOnly}`, класс `read-only:bg-muted` при `readOnly`, без `placeholder`; выбор (`RadioGroup`, `Checkbox`, `Select`) — `disabled={disabled || readOnly}`.
- `DeadlinePanel.tsx`: состояния `sending` (`section role="status"`, `h2` «Время вышло», `Loader2` и «Отправляем ответы…») и `failed` (`border-rose-200 bg-rose-50`, текст сбоя дословно из UI-SPEC в `p role="alert"` с `{ATTEMPT_GRACE_PERIOD_MINUTES}` из `@bio-exam/exam-core`, кнопка «Отправить ответы» → `lifecycle.submit({ auto: true })`).
- `TestRunner.tsx`: оверлей `fixed inset-0` удалён; `DeadlinePanel` вверху левой колонки при `deadlinePassed`, без результата и не в `blocked` (`failed`, если `submitFailed` в `active`, иначе `sending`); плашка `retry` при `deadlinePassed` не показывается; «Назад»/«Далее» выключаются только при `interactionDisabled && !deadlinePassed`; `QuestionInput` получает `readOnly={deadlinePassed}`; «Отправка...» → «Отправка…» в обеих кнопках; таймер `role="timer"` со скрытой подписью «Осталось времени: ».

## Решения плана

- Якорь серверного времени ставится по ответу `/start` (в 11-12 и 11-14 — по телу 409 и чтению судьбы), не по ответам PATCH черновика: задержка сети на частых PATCH дёргала бы таймер, а в e2e `page.clock` сдвигает часы устройства относительно сервера, и пересчёт по каждому ответу возвращал бы таймер назад.
- Смещение в кэше сессии не хранится: после перезагрузки судьбу сессии решает сервер, при сбое сети остаётся проверка по часам устройства (смещение 0).
- Пауза `TIME_UP_PAUSE_MS` и `showTimeUp` сохранены: панель видна не меньше 1,5 с перед исходом, закрепления паузы в тестах не менялись. `showTimeUp` в `TestRunner` больше не читается.

## TDD Task 2: красный и зелёный прогоны

Красный (тест 11-02 переписан и переименован, добавлены случаи `<behavior>`, прод-код Task 2 ещё не менялся):

```
× автосдача по дедлайну без связи: ответы только для чтения, answer() не меняет снимок и WAL
× после сбоя автосдачи событие online само повторяет её, 200 → submitted
× после сбоя автосдачи событие visible само повторяет её, 200 → submitted
AssertionError: Expected true, received false (interactionDisabled)
AssertionError: Expected 2, received 1 (submit calls)
Test Files  1 failed | 6 passed (7)
     Tests  3 failed | 150 passed (153)
```

Случаи «submit({ auto: true }) с прежним clientAttemptId», «событие до дедлайна повтора не вызывает» и «навигация после дедлайна» зелёные и на старом коде: они закрепляют поведение, которое Task 2 не должен сломать.

Зелёный (после правок `lifecycle.ts`): `Test Files 7 passed (7)`, `Tests 153 passed (153)`.

## Замеры (backstop UI-SPEC)

Состояние сбоя без связи, вычисленные стили в Chromium, оба проекта (`chromium-desktop`, `chromium-mobile`):

| Ширина | Поле только для чтения (foreground на muted) | `00:00` (red-600 на white) | Панель над вопросом | Горизонтальная прокрутка |
| --- | --- | --- | --- | --- |
| 375 | 13,00 | 4,77 | да | нет |
| 768 | 13,00 | 4,77 | да | нет |
| 1280 | 13,00 | 4,77 | да | нет |

Снимки состояния сбоя на 375 и 1280 px просмотрены: панель вверху колонки над вопросом, поле с фоном muted и значением, `00:00` красным, «Далее» доступна, «Завершить» выключена.

## CodeGraph

- `codegraph impact createAttemptLifecycle`: 15 символов — `testing.ts` (`setupLifecycle`), `lifecycle-restore.test.ts`, `lifecycle-submit.test.ts`, `lifecycle-time.test.ts`, `lifecycle.test.ts`, `use-attempt-lifecycle.ts` (`createBrowserAttemptLifecycle`, `useAttemptLifecycle`), `index.ts`.
- `codegraph affected` по `lifecycle.ts`, `QuestionInput.tsx`, `TestRunner.tsx` вернул только сами файлы (индекс построен по основному checkout, новые файлы worktree в нём не видны); набор тестов выбран по `impact`: весь каталог `attempt-lifecycle` и e2e плана.

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle`: 7 файлов, 153 теста зелёные (до плана 145).
- `node --test scripts/draft-durability-guards.test.mjs`: 7 pass, 0 fail.
- `yarn workspace @bio-exam/web test`: 94 файла, 1433 теста зелёные (до плана 1425).
- `yarn workspace @bio-exam/web typecheck`: exit 0; `yarn workspace @bio-exam/web lint`: exit 0 (только прежние предупреждения).
- `yarn format:check`: чисто (файлы плана отформатированы `yarn exec oxfmt`).
- `yarn e2e tests/timed-attempt.spec.ts tests/submit-retry.spec.ts`: 22 passed (14 setup + 8 тестов на двух проектах), с первого прогона. Автоповтор на `online` уходит без нажатия кнопки, попытка одна.
- `yarn verify`: **не запущен** — запуск отклонил классификатор разрешений среды («Modify Shared Resources»). Нужен прогон ведущей сессией.
- `11-plan-files.cjs check 11-11` не запускался по правилу режима worktree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Таймер пропадал во время паузы после 200**
- **Found during:** Task 2
- **Issue:** после успешной автосдачи `sendSubmit` обнуляет `session`, и `secondsLeft` становился `null` на 1,5 с паузы: таймер исчезал до исхода, что противоречит UI-SPEC («не скрывается, пока нет исхода»).
- **Fix:** снимок отдаёт `secondsLeft: 0`, пока `deadlinePassed`.
- **Files modified:** `lifecycle.ts`

**2. [Rule 1 - Bug] e2e-проверки таймера по точному тексту**
- **Found during:** Task 2/3
- **Issue:** скрытая подпись «Осталось времени: » внутри таймера ломала `getByText(/^0[12]:\d\d$/)` в существующем тесте.
- **Fix:** проверки переведены на `getByRole('timer')` с `toHaveText`.
- **Files modified:** `e2e/tests/timed-attempt.spec.ts`

### Прочие отклонения

- Класс `read-only:bg-muted` ставится только при `readOnly` (`cn('bg-white', readOnly && 'read-only:bg-muted')`): `:read-only` в CSS совпадает и с `disabled`-полем, иначе при ручной сдаче выключенное поле меняло бы фон.
- Контраст поля только для чтения считается локальной функцией `contrastOf` в спеке тем же алгоритмом, что `lowContrastTexts` из `e2e/fixtures/page-checks.ts`: `lowContrastTexts` смотрит только текстовые узлы и значение `<input>` не видит, а `page-checks.ts` вне файлов плана.
- `yarn verify` не запущен (см. «Проверки»).

## Known Stubs

None.

## Threat Flags

None. Митигации T-11-35 (answer() игнорируется при deadlinePassed), T-11-36 (таймер по смещению serverNow) и T-11-37 (автоповтор на online/visible и кнопка с прежним clientAttemptId) реализованы.

## Файлы к коммиту

- `app/web/components/tests/attempt-lifecycle/server-clock.ts` (новый)
- `app/web/components/tests/attempt-result/DeadlinePanel.tsx` (новый)
- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts`
- `app/web/components/tests/QuestionInput.tsx`
- `app/web/components/tests/TestRunner.tsx`
- `e2e/tests/timed-attempt.spec.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-11-SUMMARY.md`

## Self-Check: PASSED

Оба новых файла на месте, `git status --short` содержит только файлы плана, acceptance-grep: `serverClock` в `lifecycle.ts` ≥ 3, `deadlinePassed` ≥ 3, `readOnly` в `QuestionInput.tsx` ≥ 2, «до D-12» в `lifecycle-time.test.ts` = 0, `fixed inset-0` в `TestRunner.tsx` = 0, `role="timer"` ≥ 1, «Отправить ответы» в `DeadlinePanel.tsx` ≥ 1. Коммитов нет по правилам фазы 11.
