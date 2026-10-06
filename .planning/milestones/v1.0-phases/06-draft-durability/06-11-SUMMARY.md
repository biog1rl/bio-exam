---
phase: 06-draft-durability
plan: 11
subsystem: verification
tags: [guards, node-test, verify, e2e, deferred-human, life01, life02, life04, life05, ver08]
status: complete
deferred_human_gate: true

requires:
  - phase: 06-09
    provides: "TestRunner на useAttemptLifecycle без localStorage, visibilitychange, use-debounce, setInterval, isClientExpired"
  - phase: 06-08
    provides: "QuestionEditorPageClient на useQuestionDraftAutosave без draftAutosaveTimerRef"
  - phase: 06-04
    provides: "lib/drafts/before-unload.ts — единственное место слушателя beforeunload"
  - phase: 06-03
    provides: "components/tests/attempt-lifecycle/storage-keys.ts — единственное место ключей попытки"
  - phase: 06-10
    provides: "навыки агентов и проверки путей в yarn verify"
provides:
  - "scripts/draft-durability-guards.test.mjs: охранный тест фазы 6 в шаге script-tests yarn verify"
  - "Итоговые гейты фазы: yarn verify OK, yarn e2e 150 passed на chromium-desktop и chromium-mobile"
  - "Сводка отложенной ручной проверки фазы 6 и описание выкатки D-30"
affects: [phase-07.1, phase-08, verify-work-06]

estimate:
  tokens: 65000
  tasks: 3
actuals:
  tokens: 3536
  tasks: 3
  commits: 0
plan_head_before: efa7bf813e66e8daf49029daaf082922324886d4
plan_head_after: efa7bf813e66e8daf49029daaf082922324886d4

tech-stack:
  added: []
  patterns:
    - "Охранный тест по образцу attempt-integrity-guards: функции проверки принимают корень сканирования, проба на копии во os.tmpdir()"

key-files:
  created:
    - scripts/draft-durability-guards.test.mjs
  modified: []

key-decisions:
  - "Решение исполнителя (автономно): проверка beforeunload дополнительно ловит присваивание onbeforeunload, не только строку события в кавычках; на текущем дереве нарушений нет"
  - "Решение исполнителя (автономно): строка lock version mismatch ищется без учёта регистра"
  - "Решение исполнителя (автономно): импорт React в чистых модулях — from/import/require/import() пакетов react, react-dom и их подпутей (react/jsx-runtime); react-toastify и прочие пакеты с префиксом react- не считаются"
  - "Решение исполнителя (автономно): файл attempt-lifecycle/testing.ts (общие помощники тестов модуля, не *.test.*) сканируется как обычный модуль; нарушений в нём нет"
  - "use-debounce: импортов пакета в app/web нет, зависимость остаётся в app/web/package.json:122 — удаление меняет yarn.lock, решение пользователя"

requirements-completed: [LIFE-01, LIFE-02, LIFE-04, LIFE-05, VER-08]

duration: 25min
completed: 2026-10-05
---

# Phase 6 Plan 11: Охранный тест фазы 6 и итоговые гейты Summary

**`scripts/draft-durability-guards.test.mjs` в шаге `script-tests` держит результат фазы: `TestRunner` без хранилища, видимости, дебаунса, интервалов и клиентской проверки истечения, `beforeunload` только в `lib/drafts/before-unload.ts`, ключи попытки только в `attempt-lifecycle`, страница черновика без прежнего таймера, чистые модули без React и окружения браузера. `yarn verify: OK`, `yarn e2e` 150 passed; ручная проверка под Slow 3G, 375px, preview и выкатка записаны как отложенные.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Duration: ~25 min
- Completed: 2026-10-05
- Tasks: 3 (Task 3 — отложенная проверка человеком, записана, не выполнялась)
- Files: 1 новый

## Accomplishments

- Охранный тест из 7 проверок `node:test`: детекторы на образцах, TestRunner, `beforeunload`, ключи попытки, `QuestionEditorPageClient.tsx`, чистота модулей, проба на временной копии.
- `yarn verify: OK` с новым тестом в шаге `script-tests` (181 pass, 0 fail).
- Полный `yarn e2e`: `150 passed (1.7m)`, по 73 строки на `chromium-desktop` и `chromium-mobile` плюс setup; `failed` и `flaky` в выводе нет; `@known-defect` и `test.fail(` в `e2e/tests` нет.
- Отложенные пункты 06-01 … 06-10 сведены в один раздел ниже.

## Охранный тест (Task 1, tracer)

`scripts/draft-durability-guards.test.mjs`, без комментариев в коде. Обход пропускает `node_modules`, `.next`, `.turbo`, `.vercel`, `dist`, `out`, `coverage` и файлы `*.test.*`/`*.spec.*`. Нарушения выводятся как `путь:строка: метка: текст`.

| Проверка | Что держит |
|---|---|
| TestRunner только рисует | в `app/web/components/tests/TestRunner.tsx` нет `localStorage`, `visibilitychange`, `useDebouncedCallback`, `use-debounce`, `setInterval`, `beforeunload`, строки `'anonymous'`/`"anonymous"`, `client-attempt-id`, `storageKeysToClear`, `isClientExpired`; есть `useAttemptLifecycle(` и `function extractImagePaths` |
| beforeunload | `'beforeunload'`, `"beforeunload"` и `onbeforeunload` в `app/web` вне тестов только в `app/web/lib/drafts/before-unload.ts`; сам файл слушатель содержит |
| Ключи попытки | `test-answers-wal-`, `test-session-`, `test-frozen-` в `app/web` вне тестов только в `app/web/components/tests/attempt-lifecycle/`; там ключ WAL есть |
| Страница черновика | в `QuestionEditorPageClient.tsx` нет `draftAutosaveTimerRef`, `setTimeout(`, `lock version mismatch` |
| Чистота модулей | `components/tests/attempt-lifecycle` и `lib/drafts` вне тестов и вне `use-attempt-lifecycle.ts`, `use-question-draft-autosave.ts`: нет импорта React, `localStorage`, `document.`, `window.`, `setInterval`; файлы хуков существуют, просканировано не меньше 10 файлов |

### Проба на временной копии

Тест «проба: вставка запрещённой строки…» входит в файл и проходит в каждом `yarn verify`:

- Копия `app/web/components/tests/TestRunner.tsx` в `os.tmpdir()/draft-durability-guards-*` с дописанной строкой `const probeAnswers = localStorage.getItem('probe')`: `testRunnerViolations(tmp)` возвращает ровно одно нарушение `app/web/components/tests/TestRunner.tsx:<строка>: localStorage: хранилище попытки ведёт модуль attempt-lifecycle: …`.
- Копия `app/web/lib/drafts/save-queue.ts` со вставленной первой строкой `import { useRef } from 'react'`: `modulePurityViolations(tmp)` возвращает ровно одно нарушение `app/web/lib/drafts/save-queue.ts:1: импорт React: чистый модуль без React: …`.
- Содержимое `TestRunner.tsx` и `save-queue.ts` в рабочем дереве до и после пробы совпадает (сравнение в тесте), проверки по рабочему дереву после пробы пустые; временный каталог удаляется в `finally`.

Прогон: `node --test scripts/draft-durability-guards.test.mjs scripts/attempt-integrity-guards.test.mjs` → `tests 18`, `pass 18`, `fail 0`. Tracer-гейт (без `blocking-human`, автоматический `<verify>`): пройден, переход к Task 2.

## codegraph affected (D-29)

`.codegraph/` в worktree нет; команда выполнена по индексу основного дерева `/Users/kdvornichenko/bio-exam`, где файлов и изменений фазы 6 нет. Вход — `git diff --name-only 0d633ed..HEAD` (64 файла, без `.planning`) плюс `scripts/draft-durability-guards.test.mjs`. Команда вернула в основном сам входной список (45 файлов), как и в 06-09; это не анализ затронутых тестов по графу:

```
Affected test files (45):
  app/server/src/routes/tests/public.ts
  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.test.ts
  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts
  app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
  app/web/components/tests/TestRunner.tsx
  app/web/components/tests/attempt-lifecycle/answer-edits.test.ts
  app/web/components/tests/attempt-lifecycle/answer-edits.ts
  app/web/components/tests/attempt-lifecycle/index.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.ts
  app/web/components/tests/attempt-lifecycle/restore.test.ts
  app/web/components/tests/attempt-lifecycle/restore.ts
  app/web/components/tests/attempt-lifecycle/save-indicator.test.ts
  app/web/components/tests/attempt-lifecycle/save-indicator.ts
  app/web/components/tests/attempt-lifecycle/storage-keys.ts
  app/web/components/tests/attempt-lifecycle/testing.ts
  app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
  app/web/components/tests/attempt-lifecycle/wal.test.ts
  app/web/components/tests/attempt-lifecycle/wal.ts
  app/web/components/tests/attempt-submit-flow.test.ts
  app/web/components/tests/attempt-submit-flow.ts
  app/web/components/tests/client-attempt-id.test.ts
  app/web/components/tests/client-attempt-id.ts
  app/web/lib/drafts/before-unload.test.ts
  app/web/lib/drafts/draft-ui.test.ts
  app/web/lib/drafts/question-draft-api.test.ts
  app/web/lib/drafts/question-draft-autosave.test.ts
  app/web/lib/drafts/question-draft-copy.test.ts
  app/web/lib/drafts/save-queue.test.ts
  app/web/lib/tests/api.ts
  app/web/lib/tests/attempt-draft-save.test.ts
  app/web/lib/tests/types.ts
  app/web/store/unsavedChanges.store.test.ts
  e2e/tests/answer-durability.spec.ts
  e2e/tests/question-draft-durability.spec.ts
  packages/exam-core/src/attempt-session.test.ts
  scripts/check-docs-commands.test.mjs
  scripts/check-docs-structure.test.mjs
  scripts/draft-durability-guards.test.mjs
  scripts/exam-core-no-private-copies.test.mjs
```

Все перечисленные тесты прошли в `yarn verify` (vitest web 863, server 1119, exam-core 605; `script-tests` 181) и `yarn e2e`.

## Итоговые гейты (Task 2)

- `yarn verify` → exit 0, последняя строка `yarn verify: OK`; шаги `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test` (Turbo 14/14), `migrations`, `script-tests` — `passed`. В `script-tests` есть `scripts/draft-durability-guards.test.mjs`.
- `yarn e2e` → exit 0, `150 passed (1.7m)`; `@life02` (2 проверки) и `@life04` (4 проверки) зелёные на обоих проектах; `failed`/`flaky` в выводе 0 раз.
- `rg -n "@known-defect|test\.fail\(" e2e/tests; test $? -eq 1 && echo "no expected failures"` → `no expected failures`.
- Сверка файлов плана → `06-11 changed only its files`; `git status --porcelain --untracked-files=all` → только `?? scripts/draft-durability-guards.test.mjs`. Снимок: `.planning/commit-snapshots/before-06-11/fingerprint.json` (`fingerprint 06-11: 0 paths`, дерево было чистым).
- `rg -n "from 'use-debounce'" app/web --glob '!node_modules'` → совпадений нет (exit 1); `"use-debounce": "^10.0.6"` остаётся в `app/web/package.json:122`. Не удалялось: решение пользователя (Deferred).
- `oxfmt --check .` → `All matched files use the correct format.` (файл отформатирован отдельно: `yarn oxfmt ./scripts/draft-durability-guards.test.mjs`).

## Выкатка фазы 6 (D-30)

- Меняется только клиент (`app/web`). Сервер лишь импортирует схемы черновика попытки из `@bio-exam/exam-core` (`app/server/src/routes/tests/public.ts`, `services/attempt-sessions/sessions.ts`), поведение маршрутов прежнее.
- Миграций нет, env-ключей нет; порядок деплоя web и server не важен.
- Вкладка, открытая со старым JS, пишет прежний формат WAL; новый код его читает (D-08), ответы не теряются.
- Выкатка вместе с фазой 5 или после неё.
- Деплой и preview выполняет пользователь; исполнитель к серверам и preview не обращался.

## Deviations from Plan

None — план выполнен как написан. Решения исполнителя (автономно) по детекторам — во frontmatter `key-decisions`. Task 3 (`checkpoint:human-verify`, `gate="blocking-human"`) по правилам исполнения не выполнялся и не одобрялся: записан ниже, план закрыт без ответа пользователя (`resume-signal` плана).

## Issues Encountered

- `codegraph` не инициализирован в worktree: `affected` выполнен по индексу основного дерева (см. выше).
- Инструмент Write превратил экранированную `'''` в литеральную кавычку; исправлено до первого прогона, тест читает `q` и `dq` из `'`/`"`.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. T-6-27 закрыт охранным тестом в `yarn verify` и пробой; T-6-28 — Task 3 записан как отложенный с `deferred_human_gate: true`, исполнитель не одобрял; T-6-SC — установок и удалений пакетов нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

### Шаги Task 3 плана 06-11

1. **Студент, Slow 3G** (DevTools → Network → Slow 3G), тест без лимита: ответ на вопрос 1, сразу вопрос 2, перезагрузка — оба ответа на месте. Ответ и сразу переход по хлебным крошкам, возврат — ответ на месте. Под «Отвечено: X / N» строка «Сохранение…», затем «Ответы сохранены». Offline — «Нет связи с сервером. Ответы сохранены на этом устройстве»; после возврата сети — «Ответы сохранены».
2. **Студент, тест с лимитом.** Перезагрузка после автосдачи с закрытой вкладкой — результат попытки, а не «Время вышло» (решение пользователя по ревью фазы 5); пересдача начинается с чистыми ответами и полным временем. Тест с лимитом начат, вкладка закрыта, возврат после лимита и ещё 2 минут — «Начать тест?» без идущего таймера и без тоста о новой попытке; «Начать» — новая попытка с полным временем (решение пользователя 2026-10-04, ревью R-03).
   - **2a. Студент, тест без лимита** (решение пользователя 2026-10-04): ответы, DevTools → Offline, «Завершить» — плашка с «Повторить»; включить сеть и перезагрузить — модуль сам повторяет отправку с тем же `clientAttemptId` и показывает «Результат» без нового прохода; в истории одна попытка.
3. **Учитель, Slow 3G.** Правка черновика вопроса и сразу «Отмена» — переход после досылки, при повторном открытии правка на месте; правка и сразу «Назад» в шапке — то же. Offline и «Отмена» — диалог «Есть несохранённые изменения» с текстом о сохранении на устройстве, «Выйти», повторное открытие с сетью — тост «Восстановлены правки…» и правка на месте. Закрытие вкладки при «Сохранение…» — браузерное предупреждение, после «Сохранено» — без предупреждения. Черновик правится на устройстве A в Offline (копия на A), затем на устройстве B с сетью; открытие на A с сетью — версия с B и тост «Черновик изменён в другом месте…» с действием «Восстановить правки с этого устройства», действие возвращает правку A (решение пользователя 2026-10-04, ревью R-01).
4. **Правка существующего вопроса:** изменение формы, «Назад» и «Отмена» — диалог «Уйти без сохранения?»; закрытие вкладки — браузерное предупреждение.
5. **375px (UI-SPEC backstop):** строка состояния студента на 375px и в колонке 160px (`tab:w-48`) — «Нет связи…» переносится по словам, без обрезки и горизонтального скролла, «Отвечено: X / N» отдельной строкой; строка автосохранения черновика своей строкой над «Отмена» и «Сохранить вопрос», «Не сохранено: нет прав на черновик» и «Повторить сохранение» без скролла; диалог ухода с длинным описанием — переносы, кнопки подвала столбцом, «Выйти» сверху, без горизонтального скролла.
6. **Подтверждение пунктов UI-SPEC [авто]:** порог 1500 мс для «Сохранение…», `text-amber-700`, строка без пиктограммы и без резерва высоты, тексты описаний диалога и тостов 403/404/второго 409/восстановления, «Черновик изменён в другом месте…» с действием, предел досылки 5 с, удаление копии при 404, `toast.warning` для первого 409.
7. **Preview до прода и выкатка D-30** (удобно вместе с отложенными preview фаз 2-5): только клиент, миграций и env-ключей нет, порядок деплоя web и server не важен, выкатка вместе с фазой 5 или после неё; вкладка со старым JS пишет прежний WAL, новый код его читает.
8. **Решение пользователя по `use-debounce`:** удалить зависимость из `app/web/package.json` (меняет `yarn.lock`) или оставить в Deferred. Импортов пакета в `app/web` нет.

### Сводка отложенных пунктов 06-01 … 06-10

- **06-09, тест с лимитом времени в браузере.** Все e2e фазы (`@life02`, `@life04`, `@flow2`, `@flow3`) идут на тестах без лимита. Проверить вручную: диалог «Начать тест?», таймер по `snapshot.secondsLeft`, тост «Осталась 1 минута — тест будет сдан автоматически», оверлей «Время вышло» и автосдача, диалоги 409 и 422, плашка «Повторить». Сейчас покрыто только модульными тестами 06-05 и 06-07.
- **06-09, строка состояния студента** на 375px и в колонке 160px (`tab:w-48`): `/tests/<тема>/<тест>/start`, ответ, DevTools → Offline, перенос «Нет связи с сервером. Ответы сохранены на этом устройстве» (шаг 5).
- **06-09, UI-SPEC [авто]:** порог 1500 мс, `text-amber-700`, строка без пиктограммы и без резерва высоты (шаг 6).
- **06-08, UI-SPEC backstop:** строка автосохранения и диалог ухода на 375px (шаг 5).
- **06-08, UI-SPEC [авто]:** тексты описаний диалога, тостов 403/404/второго 409/восстановления и «Черновик изменён в другом месте…» с действием, порог 1500 мс, предел досылки 5 с (шаг 6).
- **06-08, UI-SPEC unresolved** (к сведению при ручной проверке, поведение по спецификации): тело больше лимита keepalive (64 КБ) при закрытии вкладки не отправляется и досылается при следующем открытии с тостом восстановления; 401 во время `pagehide` — данные остаются в WAL или копии и досылаются при следующем открытии; копия после 403 при следующем открытии не восстанавливается.
- **06-06, UI-SPEC backstop:** диалог ухода на 375px — правка вопроса, «Отмена»: кнопки подвала столбцом, «Выйти» сверху, без горизонтального скролла (шаг 5).
- **06-06, UI-SPEC unresolved:** хлебные крошки и «назад» браузера не перехватываются (D-17); правка существующего вопроса при таком уходе теряется без предупреждения.
- **06-05:** визуальная проверка строк 05-UI-SPEC :185 и :187 (подтверждение редакции не требуется, решение пользователя 2026-10-04) — в шаге 2.
- **06-10:** обновление навыков `bio-exam-api` и `bio-exam-data` после нарезки роутера (фаза 8) и после слияния фазы 07.1.
- **06-01 … 06-10:** коммиты файлов планов делает ведущая сессия; 06-01 … 06-10 закоммичены (2132828 … efa7bf8), файлы 06-11 — в рабочем дереве.

## Deferred

Находки ревью планов фазы 6, которые в фазе не чинятся (devils-advocate, 2026-10-04):

- **R-05 (Low).** WAL прежнего формата и отвязанный WAL (`sessionId: null`) принимаются в новую сессию целиком как неподтверждённые и перекрывают более новый черновик сервера. Так требует строка 404 фазы 5 (`05-UI-SPEC.md:182`); вред возможен только при смене устройства на границе выкатки или после 404.
- **R-06, часть (Low).** Сумма тел keepalive-запросов одного `drain` не ограничена: при нескольких крупных неподтверждённых записях браузер отклонит запросы сверх 64 КБ, данные останутся в WAL или копии и уйдут при следующем открытии. Нужен общий бюджет на вызовы `saveAttemptDraft` и сохранения черновика внутри одного `drain`.
- **R-15 (Low).** При сбое `localStorage` (квота, приватный режим) модуль работает в памяти, а строка студента продолжает говорить «сохранены на этом устройстве».
- **R-16 (Low).** Перечитывание `testData` в SWR при возврате фокуса сбрасывает форму правки существующего вопроса, если тест изменился на сервере, и гасит признак изменений D-15. Фаза 6 это поведение не вводит.
- **Перепроверка планов (Info).** Возврат к тесту с лимитом при `frozenKey` без `clientAttemptId` за пределами льготы: «Начать тест?», затем чистый проход без уведомления о незасчитанных ответах. Соответствует решению «время решает сервер»; сценарий почти недостижим.

Находки исполнения:

- **06-08, двойной переход «Отмена» + «Назад» (Low).** «Отмена» и «Назад» в шапке редактора вопроса во время досылки не выключаются и защищены от двойного перехода только от своих повторных нажатий. Стор отдаёт обеим один промис ухода, поэтому нажатие «Отмена», а затем «Назад» за одну досылку даёт два перехода (`router.push` на страницу теста и `router.back()`). Данные не теряются (обе кнопки ждут ту же досылку), пользователь может оказаться не на той странице. UI-SPEC случай не описывает; не исправлялось.
- **`use-debounce` (Info).** Импортов пакета в `app/web` нет, зависимость в `app/web/package.json:122` осталась; удаление меняет `yarn.lock` — решение пользователя (шаг 8).
- **Подсказка автодополнения в `promptText` (перенесено в фазу 8).** Узел подсказки `app/web/components/editor/plugins/autocomplete-plugin.tsx` сериализуется в MDX: `trace text` уходит на сервер как `trace textbooks (TAB)` / `trace textbooks (SWIPE ⮕)`. Записано в `deferred-items.md` (06-08); передано в фазу 8 — `.planning/phases/08-client-requests-runtime-and-decomposition/08-CONTEXT.md:613`, блок `<specifics>` (строки 588-615) («Находка фазы 6 … к рантайму редактора»). В фазе 6 не исправлялось.

## Файлы к коммиту

- scripts/draft-durability-guards.test.mjs (новый)
- .planning/phases/06-draft-durability/06-11-SUMMARY.md (`.planning` в worktree — ссылка на общий каталог, в `git status` worktree не видна)
- Снимок `.planning/commit-snapshots/before-06-11/fingerprint.json` — служебный, как у прежних планов.

## Self-Check: PASSED

- FOUND: scripts/draft-durability-guards.test.mjs (`?? scripts/draft-durability-guards.test.mjs`, других изменений в дереве нет)
- FOUND: .planning/commit-snapshots/before-06-11/fingerprint.json
- FOUND: `yarn verify: OK`, `150 passed (1.7m)`, `no expected failures`, `06-11 changed only its files`
- Коммиты: не выполнялись по правилу пользователя
