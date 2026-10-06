---
phase: 06-draft-durability
plan: 09
subsystem: web-test-runner
tags: [attempt-lifecycle, test-runner, save-indicator, life01, life02, life03, life05]
status: complete
deferred_human_gate: true

requires:
  - phase: 06-01
    provides: "e2e/tests/answer-durability.spec.ts с проверкой LIFE-02 под test.fail"
  - phase: 06-03
    provides: "createAttemptLifecycle, AttemptSnapshot, subscribe/getSnapshot, ClientAttemptStorage, AttemptVisibility"
  - phase: 06-05
    provides: "submit, retake, blockReason, alreadySubmittedAttemptId, submitFailed, result, showTimeUp, уведомления submitted/session-*/start-failed/retake-start-failed"
  - phase: 06-07
    provides: "secondsLeft, one-minute-left, телеметрия и автосдача в модуле, toggleOption, setMatchingPair"
provides:
  - "app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts: useAttemptLifecycle, browserAttemptStorage, browserVisibility"
  - "TestRunner на модуле жизненного цикла попытки со строкой состояния сохранения D-23"
  - "startTestSession возвращает AttemptSession пакета; saveAnswer, saveSessionTelemetry, SessionInfo, isClientExpired удалены"
affects: [06-10, 06-11]

estimate:
  tokens: 100000
  tasks: 3
actuals:
  tokens: 10400
  tasks: 3
  commits: 0
plan_head_before: 8e7849d0346716080d71f06b07dbad56580a4cfb
plan_head_after: 8e7849d0346716080d71f06b07dbad56580a4cfb

tech-stack:
  added: []
  patterns:
    - "Модуль создаётся ленивым useState один раз на экземпляр компонента; init в эффекте, dispose в очистке; снимок через useSyncExternalStore(subscribe, getSnapshot, getSnapshot)"
    - "Последний обработчик уведомлений передаётся модулю через канал уведомлений (emit/setHandler), созданный в useState; обработчик ставится эффектом до init"
    - "Внешний TestRunner ждёт me из useAuth и рисует внутренний AttemptRunner с key test.id:me.id"

key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
  modified:
    - app/web/components/tests/TestRunner.tsx
    - app/web/components/tests/attempt-submit-flow.ts
    - app/web/components/tests/attempt-submit-flow.test.ts
    - app/web/lib/tests/api.ts
    - app/web/lib/tests/types.ts
    - e2e/tests/answer-durability.spec.ts

key-decisions:
  - "Решение исполнителя (автономно): «onNotice через ref» сделан каналом уведомлений (emit/setHandler) из useState, а не useRef. Вариант с useRef даёт предупреждение oxlint react(refs) («Cannot access refs during render») на ленивом инициализаторе useState, вариант с изменяемым объектом из useState — react(immutability). Канал по смыслу тот же ref на последний обработчик и предупреждений не даёт"
  - "Решение исполнителя (автономно): внутренний компонент AttemptRunner получает key `${test.id}:${me.id}`: при смене теста или пользователя на том же экземпляре страницы модуль создаётся заново с новыми ключами хранилища"
  - "Решение исполнителя (автономно): browserAttemptStorage проверяет доступ чтением `getItem('')`; исключение при доступе к window.localStorage или при чтении → хранилище в памяти; на сервере (нет window) — тоже память"
  - "Решение исполнителя (автономно): весь TestRunner (включая диалоги 409/422, плашки и тосты) переведён на снимок в задаче 1: после удаления doSubmit и hydrateFromServerSession старое состояние banner/alreadySubmitted/timeExpiredOpen осталось бы без сеттеров, а правило задачи 1 требует удалить всё, что перестало собираться. В задаче 2 добавлены строка D-23 и чистка api.ts и types.ts"
  - "blocksInteraction в attempt-submit-flow.ts остаётся (его тесты не меняются по плану), TestRunner его больше не вызывает: блокировку даёт snapshot.interactionDisabled"

requirements-completed: [LIFE-01, LIFE-02, LIFE-03, LIFE-05]

duration: 25min
completed: 2026-10-05
---

# Phase 6 Plan 09: TestRunner на модуле жизненного цикла попытки Summary

**TestRunner рисует снимок `useAttemptLifecycle` (useSyncExternalStore над `createAttemptLifecycle` со швами `browserAttemptStorage` и `browserVisibility`), ответы идут через `lifecycle.answer` с `toggleOption`/`setMatchingPair` от текущего снимка, добавлена строка состояния сохранения D-23; LIFE-02 в e2e стала обычной проверкой и зелёная на двух проектах.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Duration: ~25 min
- Completed: 2026-10-05
- Tasks: 3
- Files modified: 7 (1 создан, 6 изменены)

## Accomplishments

- `use-attempt-lifecycle.ts`: `browserAttemptStorage()` (localStorage, при исключении — память), `browserVisibility()` (`visibilitychange` документа → `hidden`/`visible`, `pagehide` и `online` окна), `useAttemptLifecycle({ test, questions, userId, onNotice })` → `{ lifecycle, snapshot }`. API модуля: `{ start: startTestSession, saveDraft: saveAttemptDraft, submit: submitPublicTestAnswers }`, `questionIds` по `order`, `timeLimitMinutes` теста.
- `TestRunner.tsx` (1034 → 541 строка): внешний компонент без `me` рисует `Загрузка теста...`; внутренний `AttemptRunner` рисует только снимок.
- `api.ts`: `startTestSession(): Promise<AttemptSession>`; `saveAnswer`, `saveSessionTelemetry` и локальный `TelemetryMap` удалены. `types.ts`: `SessionInfo` удалён вместе с ненужными импортами.
- `attempt-submit-flow.ts`: `isClientExpired` и импорт `ATTEMPT_GRACE_PERIOD_MINUTES` удалены; в тесте удалён блок `describe('isClientExpired')` (4 случая).
- `answer-durability.spec.ts`: у LIFE-02 сняты `test.fail()`, `@known-defect` и «known defect (чинит 06-09)».

## Изменённые участки TestRunner.tsx

- Импорты: убраны `useCallback`, `useRef`, `use-debounce`, `saveAnswer`/`saveSessionTelemetry`/`startTestSession`/`submitPublicTestAnswers`, `AttemptView`, `SessionInfo`, `TestAnswerValue`, `AttemptStorageEvent`, `blocksInteraction`, `classifyStartFailure`, `classifySubmitFailure`, `isClientExpired`, `storageKeysToClear`, `./client-attempt-id`, `./telemetry`; добавлены `AttemptNotice`, `saveIndicatorView`, `setMatchingPair`, `toggleOption` из `./attempt-lifecycle` и `useAttemptLifecycle` напрямую из `./attempt-lifecycle/use-attempt-lifecycle` (index.ts без React не менялся).
- Удалены `useCountdown`, `clearAttemptStorage`, `showStartNotAssigned`, `replaceTelemetry`, `hydrateFromServerSession`, `replaceWithNewSession`, эффект старта сессии, эффект восстановления WAL, `debouncedSaveAnswer`, `applyTelemetry`, `flushQuestionTime`, `unfreezeAfterAutoSubmit`, `doSubmit`, эффект предупреждения и автосдачи, эффект `visibilitychange`, эффект визита вопроса, `handleConfirmStart`, прежний `handleRetake`, запасной пользователь `'anonymous'` и ключи `test-*` в компоненте.
- `export default function TestRunner` → обёртка над `useAuth()`; тело — `AttemptRunner` с `userId`.
- Ответы: `onSelectRadio`/`onInputTextAnswer` → `lifecycle.answer`; `onToggleCheckbox`/`onSelectMatching` → `lifecycle.answer(q, toggleOption|setMatchingPair(lifecycle.getSnapshot().answers[q], …))`; `goToQuestion` → `lifecycle.navigate(id)`.
- Состояние из снимка: `answers`, `currentQuestionId`, `result` (блок «Результат», карточки), `secondsLeft` (таймер с прежней `formatTime` и порогом 5 минут), `submitting` = фазы `submitting`/`autoSubmitting`, `interactionDisabled`, `showTimeUp`.
- Диалоги и плашки: «Начать тест?» открыт при `phase === 'awaitingStart'`, «Начать» → `confirmStart()`; 409 открыт при `blockReason === 'already-submitted'` до закрытия (локальное `alreadySubmittedClosed`, сбрасывается в `handleRetake`), «К результатам» при `alreadySubmittedAttemptId`; 422 открыт при `blockReason === 'time-expired'` без `onOpenChange`, «Начать заново» → `retake()`; плашка `bannerFor` по `blockReason` (start-not-assigned, submit-not-assigned, not-found, already-submitted после закрытия 409) и `submitFailed` (retry, «Повторить» → `lifecycle.submit()`); «Обновить страницу» → `window.location.reload()`.
- Тосты по уведомлениям: `session-restored` «Сессия восстановлена», `session-replaced` `SUBMIT_FLOW_TEXT.sessionReplaced`, `start-failed` «Не удалось начать тест. Попробуйте ещё раз.», `retake-start-failed` «Не удалось начать новую попытку. Попробуйте ещё раз.», `one-minute-left` `toast.warning('Осталась 1 минута — тест будет сдан автоматически', { duration: 8000 })`; `submitted` добавляет попытку в «Мои попытки» прежним объектом из шести полей.
- Строка D-23: `<p aria-live="polite" aria-atomic="true">` внутри `space-y-1.5` после полосы прогресса, `text-xs` и `text-amber-700` для `warning`, иначе `text-muted-foreground`, текст `saveIndicatorView(snapshot.saveIndicator)`, только при `saveIndicator !== null`. «Отвечено: X / N» остался отдельным `<p>`.
- Вёрстка, `QuestionInput`, `runnerResultCard`, «Мои попытки», эффект синхронизации `initialAttempts`, оверлей «Время вышло», тексты диалогов не менялись.

**Для слияния с фазой 7:** функция `extractImagePaths` (вместе с JSDoc), эффект предзагрузки с `prefetchSignedUrls` и строка импорта `import { prefetchSignedUrls, resolvesViaApi } from '@/lib/image-signed-url-cache'` не тронуты: сверка `diff` тела `extractImagePaths` и эффекта предзагрузки с `HEAD` пустая.

## Task Commits

Коммиты не выполнялись (правило пользователя), изменения в рабочем дереве.

1. Task 1 (tracer): хук, швы браузера, TestRunner на модуле, `startTestSession` → `AttemptSession`, снятие `test.fail()` с LIFE-02.
2. Task 2: строка состояния D-23, удаление `saveAnswer`, `saveSessionTelemetry`, `SessionInfo`.
3. Task 3 (TDD): удаление `isClientExpired`.

## TDD (Task 3)

- RED: удалены `isClientExpired` и импорт `ATTEMPT_GRACE_PERIOD_MINUTES` из `attempt-submit-flow.ts`; `vitest run components/tests` → `Test Files 1 failed | 14 passed`, 4 падения `TypeError: isClientExpired is not a function` в `attempt-submit-flow.test.ts > isClientExpired`.
- GREEN: удалены импорт и блок `describe('isClientExpired')` в тесте → `Test Files 15 passed`, `Tests 279 passed` (было 283, минус 4 случая `isClientExpired`). Остальные случаи (классификация, баннеры, ключи очистки, `blocksInteraction`) не менялись.
- `rg -n "isClientExpired" app/web` перед удалением: вызывающих вне `attempt-submit-flow.ts` и его теста нет (TestRunner к этому моменту уже на модуле).

## codegraph (индекс основного дерева)

- `codegraph impact TestRunner` (5 символов): `TestRunner.tsx:139`, `TestPageClient.tsx` (`TestPageClient:14`), `start/page.tsx` (`TestPage:7`). Пропсы `TestRunner` не менялись, вызывающие не трогались.
- `codegraph impact saveAnswer` (5): `api.ts:140`, `TestRunner.tsx` (`TestRunner:139`), `TestPageClient.tsx`. После плана вызывающих нет, функция удалена.
- `codegraph impact saveSessionTelemetry` (7): `api.ts:157`, `TestRunner.tsx` (`handler:612`, `goToQuestion:484`, `goPrev:497`, `goNext:498`, `TestRunner:139`). Удалена вместе с вызывающими.
- `codegraph impact isClientExpired` (5): `attempt-submit-flow.ts:100`, `attempt-submit-flow.test.ts`, `TestRunner.tsx` (`restoreSession:266`). Удалена.
- `codegraph impact startTestSession` (9): `api.ts:136`, `TestRunner.tsx` (`doSubmit:506`, `handleSubmit:673`, `restoreSession:266`, `handleConfirmStart:681`, `startUntimedSession:314`, `handleRetake:699`, `TestRunner:139`). Теперь единственный вызывающий — `use-attempt-lifecycle.ts` (через `AttemptLifecycleApi.start`).
- `codegraph affected` по 7 файлам плана: вернул входной список (7 файлов); новый файл и изменения worktree не в индексе.

## Проверки

- Task 1: `yarn workspace @bio-exam/web vitest run components/tests` → `Test Files 15 passed`, `Tests 283 passed`; `typecheck` без ошибок; `yarn e2e --grep "@life02|@flow2"` → `10 passed (14.5s)` (setup 4, LIFE-02 подготовка и LIFE-02, flow2 на chromium-desktop и chromium-mobile), exit 0. Tracer-гейт (без `blocking-human`): проверка пройдена, переход к задаче 2.
- Task 2: `typecheck` без ошибок; `lint` без ошибок, по файлам плана одно предупреждение `react(set-state-in-effect)` на эффекте синхронизации `initialAttempts`. Код эффекта перенесён без изменений; на копии `TestRunner.tsx` из HEAD oxlint это предупреждение не выводит, вероятно потому, что прежний компонент содержал комментарии `eslint-disable-next-line react-hooks/exhaustive-deps` и проверки уровня компилятора его пропускали. Эффект оставлен как есть: план требует не менять «Мои попытки», а предупреждение не валит `lint` и `yarn verify`; `vitest run components/tests` → `283 passed`; `yarn e2e --grep "@life02|@flow2|@flow3"` → `14 passed (16.5s)`, exit 0, без `failed` и `flaky`; проверка запретов печатает `runner renders lifecycle`.
- Task 3: `vitest run components/tests` → `279 passed`; `yarn verify` → `yarn verify: OK` (все шаги `passed`, включая `lint-typecheck-test`, `migrations`, `script-tests`, `format-check`); сверка файлов печатает `06-09 changed only its files`.
- `oxfmt --check .` → `All matched files use the correct format.` (форматирование по одному файлу с `./`).

## Deviations from Plan

### Auto-fixed Issues

None — отклонений по правилам 1–3 нет. Новое предупреждение oxlint `react(set-state-in-effect)` на перенесённом эффекте `initialAttempts` описано в разделе «Проверки». Порядок работ внутри TestRunner описан в key-decisions (диалоги, плашки и тосты переведены в задаче 1, чтобы задача 1 собиралась без мёртвого состояния).

## Threat Flags

Нет новой поверхности: эндпоинты те же (`/start`, PATCH `/answers` через `saveAttemptDraft`, `/submit`); ключи хранилища создаёт модуль из `userId` пользователя (T-6-22: запасного `'anonymous'` нет, проверка задачи 2); обращения к localStorage и видимости только в `use-attempt-lifecycle.ts` (T-6-23).

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Строка состояния у студента на 375px и в колонке 160px (`tab:w-48`): открыть `/tests/<тема>/<тест>/start`, ответить на вопрос, проверить перенос текста «Нет связи с сервером. Ответы сохранены на этом устройстве» (DevTools → Network → Offline) — в ручной проверке 06-11.
2. UI-SPEC **[авто]**: порог 1500 мс для «Сохранение…», цвет `text-amber-700`, строка без пиктограммы и без резерва высоты — подтверждение в 06-11.
3. Тест с лимитом времени в браузере: e2e этого плана (`@life02`, `@flow2`, `@flow3`) идут на тестах без таймера. Диалог «Начать тест?», таймер по `snapshot.secondsLeft`, тост «Осталась 1 минута — тест будет сдан автоматически», оверлей «Время вышло» и автосдача, диалоги 409 и 422, плашка «Повторить» проверены только модульными тестами 06-05 и 06-07 — ручная проверка в 06-11.
4. Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts (новый)
- app/web/components/tests/TestRunner.tsx
- app/web/components/tests/attempt-submit-flow.ts
- app/web/components/tests/attempt-submit-flow.test.ts
- app/web/lib/tests/api.ts
- app/web/lib/tests/types.ts
- e2e/tests/answer-durability.spec.ts

## Next Phase Readiness

- 06-10/06-11: охранный тест на отсутствие `localStorage`, `visibilitychange`, `use-debounce`, `setInterval`, `beforeunload` в `TestRunner.tsx` можно ставить: строк нет. Пакет `use-debounce` в `TestRunner` больше не импортируется (удаление зависимости — Deferred 06-11).

## Self-Check: PASSED

- FOUND: app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
- FOUND: изменения в 6 файлах плана (`git status --porcelain`), других изменений нет
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = 8e7849d
