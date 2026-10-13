---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 12
subsystem: web
tags: [attempt-lifecycle, submit-flow, upload-window, deadline, focus, e2e]
requires: [11-01, 11-03, 11-11]
provides:
  - AttemptRequestError с submitSource, uploadClosesAt, serverNow и attempt из тела 409
  - исход finalized в classifySubmitFailure и событие хранилища finalized
  - AttemptSnapshot.acceptedAutomatically, uploadClosesAt, serverOffsetMs
  - uploadWindowView и UPLOAD_WINDOW_SOON_MS (lib/tests/upload-window.ts)
  - UploadWindowLine — строка окна для фото с отсчётом от серверного времени
  - заголовок «Ответ принят», запасная панель «К результатам», фокус на заголовке исхода
affects: [11-13, 11-14, 11-15]
actuals:
  tokens: 9200
  tasks: 3
  commits: 0
plan_head_before: 031691832617ce25d6fdc0efc1e21977ee8ba2d4
plan_head_after: 031691832617ce25d6fdc0efc1e21977ee8ba2d4
tech-stack:
  added: []
  patterns: [чистая функция вида строки с nextUpdateInMs и тонкий компонент с одним setTimeout]
key-files:
  created:
    - app/web/lib/tests/upload-window.ts
    - app/web/lib/tests/upload-window.test.ts
    - app/web/components/tests/attempt-result/UploadWindowLine.tsx
  modified:
    - app/web/lib/tests/api.ts
    - app/web/lib/tests/api.test.ts
    - app/web/components/tests/attempt-submit-flow.ts
    - app/web/components/tests/attempt-submit-flow.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
    - app/web/components/tests/TestRunner.tsx
    - e2e/tests/timed-attempt.spec.ts
key-decisions:
  - "uploadClosesAt в снимке ставится и при ручной сдаче 200: строка окна показывается при любом исходе с окном (UI-SPEC Поверхность 2)"
  - "Исход виден (outcomeShown) при результате или запасной панели: панель «Время вышло» и таймер 00:00 скрываются и для запасной панели"
  - "Видимая строка окна целиком aria-hidden, читатель экрана получает одно предложение из sr-only, без повтора"
  - "Живая область строки окна — один узел на все состояния, чтобы переходы «скоро закроется» и «закрыто» озвучивались"
status: complete
---

# Phase 11 Plan 12: «Ответ принят» и строка окна для фото Summary

Тело 409 `ATTEMPT_ALREADY_SUBMITTED` с `submitSource: 'deadline'` и автосдача по таймеру с ответом 200 дают на странице ученика исход «Ответ принят» с результатом; если вид попытки не пришёл или испорчен, показывается запасная панель с кнопкой «К результатам». Под заголовком — строка «Фото можно добавить до ЧЧ:ММ» с отсчётом от серверного времени, фокус переходит на заголовок исхода.

## Что сделано

- `lib/tests/api.ts`: у `AttemptRequestError` шестой необязательный параметр `details` (`AttemptRequestErrorDetails`) и поля `submitSource`, `uploadClosesAt`, `serverNow`, `attempt`. `readAttemptErrorBody` разбирает конверт `SubmitAttemptErrorSchema.omit({ attempt: true })` (из него `reason`, `limit`, `submitSource`, `uploadClosesAt`, `serverNow`), `attempt` — отдельно `AttemptViewSchema.safeParse(record.attempt)`, неуспех даёт `null` и не трогает остальные поля. `code` и `attemptId` читаются из тела как раньше.
- `attempt-submit-flow.ts`: исход `{ kind: 'finalized', attemptId, attempt, uploadClosesAt, serverNow }` для 409 `ATTEMPT_ALREADY_SUBMITTED` с `submitSource === 'deadline'`, проверяется до `already-submitted`; событие хранилища `finalized` стирает все четыре ключа. Тексты `SUBMIT_FLOW_TEXT` не менялись.
- `lifecycle.ts`: ветка `finalized` в `applySubmitFailure` (очередь отброшена, ключи стёрты, `closedSession`, `serverClock.observe(serverNow)`, `result = attempt`, `uploadClosesAt` из тела или вида, `acceptedAutomatically = true`, `alreadySubmittedAttemptId`, фаза `submitted`, уведомление `submitted` только при наличии вида) возвращает `settled` до `phase = 'blocked'`, поэтому диалог «Попытка уже сдана» не открывается. `sendSubmit` при 200 ставит `acceptedAutomatically = auto` и `uploadClosesAt = view.uploadClosesAt ?? null`. В снимке `acceptedAutomatically`, `uploadClosesAt`, `serverOffsetMs`; `init` и `reset` сбрасывают первые два.
- `testing.ts`: `requestError(..., extra)` принимает `submitSource`, `uploadClosesAt`, `serverNow`, `attempt`; `attemptViewOf(id, extra)` принимает поля вида.
- `lib/tests/upload-window.ts`: `uploadWindowView(uploadClosesAt, nowMs)` с состояниями `none`, `open`, `closing`, `last-minute`, `closed`, тексты дословно из UI-SPEC, формат `HH:mm` или `d MMM, HH:mm` (date-fns, `ru`) для другого дня, `nextUpdateInMs` — до смены целых минут вверх (порог 5 мин и закрытие совпадают с этой границей).
- `UploadWindowLine.tsx`: `now = Date.now() + serverOffsetMs`, один `setTimeout` на `nextUpdateInMs`, пересчёт на `visibilitychange` в `visible`; разметка UI-SPEC; живая область `aria-live="polite"` — один узел для всех состояний.
- `TestRunner.tsx`: `h2` «Ответ принят» при `acceptedAutomatically`, иначе «Результат»; строка «Время вышло, ответы приняты автоматически.»; `UploadWindowLine` в панели результата при любом исходе; запасная панель (`bg-secondary`, «Ответ принят», строка про автоматическую сдачу, «Результат появится в списке «Мои попытки» после обновления страницы.», `Button variant="outline"` «К результатам» → `window.location.reload()`); `h2` обеих панелей `tabIndex={-1}` и `outline-none`, фокус переносится эффектом один раз на исход (ключ — `attemptId` или `accepted`).
- `e2e/tests/timed-attempt.spec.ts`: после автосдачи ждёт заголовок «Ответ принят» с фокусом, строку про автоматическую сдачу, отсутствие заголовка «Время вышло» и замеряет контраст строки; во втором тесте после возврата связи — «Ответ принят».

## Ответ сервера → исход → что видно

| Ответ сервера на сдачу | Исход `classifySubmitFailure` / модуль | Что видно |
| --- | --- | --- |
| 200, автосдача по таймеру | `submitted`, `acceptedAutomatically = true` | «Ответ принят», «Время вышло, ответы приняты автоматически.», строка окна при `uploadClosesAt`, тело результата |
| 200, ручная сдача | `submitted`, `acceptedAutomatically = false` | «Результат», строка окна при `uploadClosesAt` |
| 409 `ATTEMPT_ALREADY_SUBMITTED`, `submitSource: 'deadline'`, валидный `attempt` | `finalized` → `submitted`, `result = attempt` | «Ответ принят» с результатом и строкой окна |
| 409 то же, `attempt` нет или испорчен | `finalized`, `attempt: null` → `submitted`, `result = null` | запасная панель «Ответ принят» с «К результатам», без строки окна |
| 409, `submitSource: 'client'` или без источника | `already-submitted` → `blocked` | прежний диалог «Попытка уже сдана» |
| 422 `TIME_EXPIRED`, 403, 404, сеть, 5xx | без изменений | как до плана |

## Трассер (Task 1)

После правок Task 1 `<verify>` (`vitest run components/tests/attempt-submit-flow.test.ts components/tests/attempt-lifecycle lib/tests/api.test.ts`) прогнан дважды: 9 файлов, 211 тестов зелёные; `yarn workspace @bio-exam/web typecheck` — exit 0. Трассер проверен, после этого начат Task 2.

## TDD Task 2: красный и зелёный прогоны

Красный (таблица написана, модуля `upload-window.ts` ещё нет):

```
FAIL  lib/tests/upload-window.test.ts  (ошибка импорта ./upload-window на строке 3)
 Test Files  1 failed (1)
      Tests  no tests
```

Зелёный: `Test Files 1 passed (1)`, `Tests 12 passed (12)`. Та же таблица зелёная при `TZ=UTC`, `TZ=America/Los_Angeles`, `TZ=Asia/Kolkata` (даты строятся локальным конструктором, как в `lib/notifications/time.test.ts`).

## Замеры контраста (backstop UI-SPEC)

| Что | Как | Отношение |
| --- | --- | --- |
| «Время вышло, ответы приняты автоматически.» (foreground) на `bg-emerald-50` панели результата | вычисленные стили в Chromium, `contrastOf` в `timed-attempt.spec.ts`, оба проекта | 15,06 |
| строка окна: foreground на `bg-secondary` | из токенов `globals.css` (OKLCH → sRGB, тот же расчёт, что `token-contrast.test.ts`) | 12,78 |
| строка окна: foreground на `bg-emerald-50` | из токенов и `--color-emerald-50` Tailwind | 15,00 |
| строка окна: muted-foreground на `bg-secondary` | из токенов (пара есть и в `token-contrast.test.ts`) | 5,00 |
| строка окна: muted-foreground на `bg-emerald-50` | из токенов и `--color-emerald-50` Tailwind | 5,87 |

Строку окна в браузере не видно: сервер ставит `uploadClosesAt` только попытке с открытым вопросом (`uploadClosesAtOf` в `app/server/src/services/attempt-sessions/submit.ts`), а шаблон `open` выключен до фазы 17, и `createOwnTest` в e2e открытый вопрос не создаёт. Поэтому контраст строки окна вычислен по токенам, а не измерен по вычисленным стилям, и раскладка строки на 375 px (отсчёт на второй строке через `basis-full mob:basis-auto`, брейкпоинт `mob` = 500px в `styles/breakpoints.css`) в браузере не проверена.

## CodeGraph

- `codegraph impact AttemptRequestError`: 20 символов — `api.ts` (`fetchAttemptJson`, `startTestSession`, `submitPublicTestAnswers`, поля и конструктор), `testing.ts` (`requestError`), `attempt-submit-flow.ts`, `attempt-submit-flow.test.ts`, `api.test.ts`, `lifecycle-restore.test.ts`.
- `codegraph impact classifySubmitFailure`: 6 символов — `attempt-submit-flow.test.ts`, `lifecycle.ts` (`sendSubmit`, `runSubmit`, `resubmit`).
- `codegraph affected` по `api.ts`, `attempt-submit-flow.ts`, `lifecycle.ts`, `testing.ts`, `TestRunner.tsx` вернул только сами файлы (индекс построен по основному checkout, файлы worktree в нём не видны); набор тестов выбран по `impact`: `attempt-submit-flow.test.ts`, каталог `attempt-lifecycle`, `api.test.ts`, e2e плана и e2e со стороны панели результата.

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests/attempt-submit-flow.test.ts components/tests/attempt-lifecycle lib/tests/api.test.ts`: 9 файлов, 211 тестов зелёные.
- `yarn workspace @bio-exam/web vitest run lib/tests/upload-window.test.ts`: 12 тестов зелёные.
- `node --test scripts/draft-durability-guards.test.mjs`: 7 pass, 0 fail.
- `yarn workspace @bio-exam/web test`: 95 файлов, 1458 тестов зелёные (до плана 94 файла, 1433 теста).
- `yarn workspace @bio-exam/web typecheck`: exit 0; `yarn workspace @bio-exam/web lint`: exit 0, в файлах плана новых предупреждений нет (`TestRunner.tsx:107` — прежнее `set-state-in-effect` у `setAttempts`).
- `yarn format:check`: чисто (файлы плана отформатированы `yarn exec oxfmt`).
- `yarn e2e tests/timed-attempt.spec.ts tests/submit-retry.spec.ts tests/take-test.spec.ts`: 24 passed (14 setup + 10 тестов на двух проектах), с первого прогона; ручная сдача в `submit-retry` и `take-test` по-прежнему «Результат».
- Дополнительно, из-за переноса фокуса на заголовок при ручной сдаче: `yarn e2e tests/attempt-review-pending.spec.ts tests/attempts-list.spec.ts tests/inline-image-export.spec.ts` — 38 passed.
- `yarn verify`: `yarn verify: OK` (все шаги passed).
- `11-plan-files.cjs check 11-12` не запускался по правилу режима worktree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Панель «Время вышло» и таймер 00:00 при запасной панели**
- **Found during:** Task 3
- **Issue:** `deadlinePanelState` и показ таймера в `TestRunner` смотрели на `!submitResult`. В запасной панели результата нет, а `deadlinePassed` остаётся истинным, поэтому рядом с «Ответ принят» висели бы панель «Отправляем ответы…» и таймер `00:00`.
- **Fix:** признак `outcomeShown` (результат или запасная панель) заменил `!submitResult` в обоих условиях.
- **Files modified:** `app/web/components/tests/TestRunner.tsx`

### Прочие отклонения

- `uploadClosesAt` при ответе 200 ставится и для ручной сдачи (план в Task 1 п. 3 называет только автосдачу): Task 2 п. 4 и UI-SPEC требуют строку окна при любом исходе с окном.
- Видимые части строки окна (время и отсчёт) обе `aria-hidden`, а не только отсчёт: иначе читатель экрана прочитал бы «Фото можно добавить до 14:35» дважды — из видимой части и из `sr-only` с полным предложением (UI-SPEC: «видимая часть с отсчётом `aria-hidden`»).
- Строка окна и живая область обёрнуты в `div`, чтобы узел `aria-live` оставался тем же при смене открытого состояния на «закрыто»; `mt-2` осталось на `p`, как в UI-SPEC.
- В `timed-attempt.spec.ts` добавлен замер контраста строки «Время вышло, ответы приняты автоматически.» тем же `contrastOf`, что и замеры 11-11.
- Сверка `11-plan-files.cjs check 11-12` не запускалась (режим worktree).
- У исхода `finalized` при автосдаче нет паузы `TIME_UP_PAUSE_MS`: панель «Время вышло» сменяется на «Ответ принят» сразу, как только пришёл 409. План и UI-SPEC паузу для 409 не задают.

## Known Stubs

None.

## Threat Flags

None. Митигация T-11-38 реализована: конверт 409 разбирается без вложенного вида, вид — отдельным `AttemptViewSchema.safeParse`, испорченный вид даёт `finalized` с `attempt: null` и запасную панель (случаи в `api.test.ts`, `attempt-submit-flow.test.ts`, `lifecycle-submit.test.ts`).

## Файлы к коммиту

- `app/web/lib/tests/upload-window.ts` (новый)
- `app/web/lib/tests/upload-window.test.ts` (новый)
- `app/web/components/tests/attempt-result/UploadWindowLine.tsx` (новый)
- `app/web/lib/tests/api.ts`
- `app/web/lib/tests/api.test.ts`
- `app/web/components/tests/attempt-submit-flow.ts`
- `app/web/components/tests/attempt-submit-flow.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/testing.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`
- `app/web/components/tests/TestRunner.tsx`
- `e2e/tests/timed-attempt.spec.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-12-SUMMARY.md`

## Self-Check: PASSED

Новые файлы на месте, `git status --short` содержит только файлы плана и SUMMARY, HEAD = `0316918` (коммитов нет по правилам фазы 11). Acceptance-grep: `kind: 'finalized'` в `attempt-submit-flow.ts` = 2, `AttemptViewSchema` в `api.ts` = 2, `omit({ attempt: true })` = 1, «Ответ принят» в `TestRunner.tsx` = 2, `setTimeout` в `UploadWindowLine.tsx` = 1, `UploadWindowLine` в `TestRunner.tsx` = 2, «К результатам» = 1, `toBeFocused` в `timed-attempt.spec.ts` = 1.
