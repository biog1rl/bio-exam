---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 13
subsystem: web
tags: [attempt-lifecycle, wal, d-14, d-04, unsent-text, submit-flow]
requires: [11-12]
provides:
  - unsentTexts и UnsentEntry (components/tests/attempt-lifecycle/wal-reconcile.ts) — сверка локального текста с attempt.results[].userAnswer
  - ключ браузера test-unsent-<testId>-<userId> (AttemptStorageKeys.unsent) и writeUnsent с результатом boolean
  - события хранилища finalized и time-expired без WAL; success стирает пять ключей
  - AttemptSnapshot.unsent, опция textQuestionIds и второй аргумент setQuestionIds
  - UnsentTextNote — пометка в панели результата, в запасной панели и укороченная в диалоге D-04
  - фокус на номер вопроса после «К вопросу N»
affects: [11-14, 11-17, 11-18]
actuals:
  tokens: 9000
  tasks: 3
  commits: 0
plan_head_before: 140da99219c2a22a49ce942948d10c60f1a82aef
plan_head_after: 140da99219c2a22a49ce942948d10c60f1a82aef
tech-stack:
  added: []
  patterns: [сверка WAL перед удалением, запись с результатом boolean и удаление WAL только после успешной записи]
key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/wal-reconcile.ts
    - app/web/components/tests/attempt-lifecycle/wal-reconcile.test.ts
    - app/web/components/tests/attempt-result/UnsentTextNote.tsx
  modified:
    - app/web/components/tests/attempt-lifecycle/storage-keys.ts
    - app/web/components/tests/attempt-submit-flow.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
    - app/web/components/tests/TestRunner.tsx
    - scripts/draft-durability-guards.test.mjs
key-decisions:
  - "Сверка идёт по ответам в памяти модуля (answers, pending): память пишется раньше WAL и после restore совпадает с ним"
  - "Запись unsent удаляется при любом успешном /start (applyServerSession и startForSubmit) и только если она есть, чтобы не трогать хранилище лишний раз"
  - "Пометка «могла» в запасной панели без вида показывается без кнопок «К вопросу»: разбора нет"
  - "Корень UnsentTextNote получил min-w-0: в сетке AlertDialogContent длинное слово без пробелов растягивало колонку и уводило «Начать заново» за экран"
  - "Блок текста получил role=\"group\": у элемента без роли aria-label по ARIA 1.2 запрещён и может не озвучиваться"
status: complete
---

# Phase 11 Plan 13: Сверка недошедшего текста и пометка о нём Summary

При исходе «Ответ принят» модуль попытки сравнивает текстовые ответы WAL с `attempt.results[].userAnswer` после `trim()` и не стирает расходящийся текст: он сохраняется под ключом `test-unsent-<testId>-<userId>` и показывается ученику только для чтения в пометке «Часть ответа, набранная без связи, не дошла до сервера». Без вида попытки пометка говорит «могла не дойти» по неподтверждённым ответам; у пустой попытки (422 `TIME_EXPIRED`, D-04) WAL остаётся, пока открыт диалог «Время вышло», текст виден в нём укороченной пометкой, «Начать заново» стирает всё.

## Что сделано

- `wal-reconcile.ts` (чистый модуль): `unsentTexts({ local, stored, textQuestionIds, questionOrder, pending })`. Сверяются только вопросы из `textQuestionIds`; пустая или пробельная локальная строка не считается; при `stored === null` берутся только `pending`; не строка в попытке равна пустой строке; номер — позиция в `questionOrder` + 1, порядок — порядок вопросов. Там же типы `UnsentEntry` и `UnsentRecord` (`{ v: 1, testId, attemptId, certain, entries }`).
- `storage-keys.ts`: `AttemptStorageKeys.unsent = test-unsent-${testId}-${userId}`, `writeUnsent(storage, key, record): boolean` (как `writeWal`).
- `attempt-submit-flow.ts`: `AttemptStorageKey` + `'unsent'`; `success` стирает пять ключей; `finalized` и `time-expired` — `session`, `frozen`, `clientAttemptId` (WAL ведёт модуль). Тексты `SUBMIT_FLOW_TEXT` не менялись.
- `lifecycle.ts`: опция `textQuestionIds`, `setQuestionIds(ids, textIds?)` (текстовые id обновляются и при неизменном списке вопросов); `keepUnsent` в ветке `finalized` до обнуления `pending`: нет расхождений — WAL удаляется, `unsent = null`; есть — пишется запись, и только при `true` удаляется WAL (R8), в снимке `unsent` в обоих случаях, `certain = attempt !== null`. Ветка `time-expired`: `unsentTexts({ stored: [] })`, `certain: true`, в хранилище ничего не пишется, WAL остаётся. `applyServerSession` и `startForSubmit` удаляют запись `unsent` (если она есть); `reset` стирает её событием `success`; `init` и `reset` обнуляют `unsent`.
- `use-attempt-lifecycle.ts`: `textQuestionIds` — id вопросов с шаблоном `short_text`, `sequence_digits`, `open`; передаются при создании модуля и в эффекте `setQuestionIds`.
- `testing.ts`: `setupLifecycle({ textQuestionIds })`, `presentKeys` знает `unsent` (последним), `textResult(questionId, userAnswer)` для вида попытки.
- `UnsentTextNote.tsx`: разметка UI-SPEC Поверхность 3 (классы, тексты, `aria-label`, кольцо фокуса, кнопка `ghost sm h-11 rounded-full tab:h-8`); `certain === false` — заголовок со словом «могла»; `compact` — без пояснения и кнопок, список `max-h-60 overflow-y-auto`.
- `TestRunner.tsx`: пометка в панели результата после `UploadWindowLine`; в запасной панели без вида — без «К вопросу»; в диалоге `time-expired` под заголовком и описанием — `compact`. Номер вопроса карточки `tabIndex={-1}` с ref; «К вопросу N» переводит на вопрос и ставит фокус на номер (эффект на смену `currentQuestionId` по флагу; если вопрос уже открыт — фокус сразу).
- `scripts/draft-durability-guards.test.mjs`: `'test-unsent-'` в `ATTEMPT_KEY_CHECKS`.

## Исход → ключи → пометка

| Исход | `session`, `frozen`, `clientAttemptId` | WAL | Запись `unsent` | Пометка |
| --- | --- | --- | --- | --- |
| 200 ручной или автосдачи | стираются | стирается | стирается (`success`) | нет |
| 409 `deadline` с видом, всё совпало | стираются | стирается | нет | нет |
| 409 `deadline` с видом, расхождение | стираются | стирается после успешной записи | пишется, `certain: true`, `attemptId` | «не дошла до сервера», пояснение, «К вопросу N» |
| то же, запись не удалась (R8) | стираются | остаётся | нет | та же, из памяти |
| 409 `deadline` без вида, есть `pending` текст | стираются | стирается после успешной записи | пишется, `certain: false` | «могла не дойти» в запасной панели, без кнопок |
| 409 `client` | стираются | стирается | без изменений | диалог «Попытка уже сдана», как раньше |
| 422 `TIME_EXPIRED` (D-04) | стираются | остаётся до «Начать заново» | не пишется | укороченная пометка в диалоге при непустом тексте |
| «Начать заново», «Пройти ещё раз» | стираются | стирается | стирается | — |
| следующий успешный `/start` (в том числе после перезагрузки) | — | — | стирается | — |

## Трассер (Task 1)

После Task 1 `vitest run components/tests/attempt-lifecycle components/tests/attempt-submit-flow.test.ts`: 8 файлов, 198 тестов зелёные (трассер — `D-14 трассер: 409 deadline с видом…`: `snapshot.unsent.entries = [{ questionId: Q1, number: 1, text: 'полный текст' }]`, `certain === true`, `presentKeys = ['unsent']`). Охранник: 7 pass, 0 fail. Строка `time-expired` в `STORAGE_KEYS_BY_EVENT` в Task 1 не менялась, чтобы закрепления 422 сменились отдельным шагом Task 2. Трассер проверен, после этого начат Task 2.

## TDD Task 2: красный и зелёный прогоны

Шаг 1 — переписаны закрепления 422 (ручная и автосдача в `lifecycle-submit.test.ts`, строка 422 в `lifecycle-restore.test.ts`: ключи `['wal']`), добавлены таблица `wal-reconcile.test.ts` (10 случаев) и 6 случаев `<behavior>`. Красный:

```
 ❯ components/tests/attempt-lifecycle/lifecycle-restore.test.ts (23 tests | 1 failed)
     × 422 TIME_EXPIRED: blocked time-expired, /start не вызывался, WAL остаётся до «Начать заново»
 ❯ components/tests/attempt-lifecycle/lifecycle-submit.test.ts (48 tests | 4 failed)
     × 422 TIME_EXPIRED на ручную отправку: … WAL остаётся до «Начать заново» …
     × 422 TIME_EXPIRED на автосдачу теста с лимитом: … остаётся только WAL …
     × D-04 и D-14: 422 TIME_EXPIRED с непустым текстом — остаётся только WAL, пометка в снимке …
     × запись unsent от прошлой попытки удаляется при следующем старте после перезагрузки
 Test Files  2 failed | 7 passed (9)
      Tests  5 failed | 209 passed (214)
```

(`+ actual []`, `- expected ['wal']` у закреплений 422; `unsent` `null` у D-04.)

Шаг 2 — ветка `time-expired`, событие без WAL, удаление записи при `/start`. Первый прогон уронил `lifecycle.test.ts › ревью C-01, R-04` (он закрепляет полный список вызовов `removeItem`, в нём появился ключ `unsent`); удаление записи сделано только при её наличии, закрепление не менялось. Зелёный: `Test Files 9 passed (9)`, `Tests 214 passed (214)`.

## Проверка в браузере (временный e2e, удалён)

Пометку в e2e плана не создать: она видна только после серверной финализации с расхождением. Поэтому прогнан временный `e2e/tests/zz-unsent-probe.spec.ts` (после прогона удалён): тест с вопросом выбора и `short_answer`, длинный текст со словом без пробелов, ответ `/submit` подменён через `page.route` на 409 `deadline` с видом (`userAnswer` текстового вопроса `'мит'`) и на 422 `TIME_EXPIRED`. Оба проекта (`chromium-desktop`, `chromium-mobile`), 18 passed.

| Что | 375 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| заголовок пометки (foreground на card) | 15,55 | 15,55 | 15,55 |
| пояснение (muted-foreground на card) | 6,07 | 6,07 | 6,07 |
| «Вопрос 2» (foreground на card) | 15,55 | 15,55 | 15,55 |
| локальный текст (foreground на muted) | 13,00 | 13,00 | 13,00 |
| «К вопросу 2» (foreground на card) | 15,55 | 15,55 | 15,55 |
| блок текста, высота | 160 px | 114 px | 114 px |
| кнопка «К вопросу 2», высота | 44 px | 44 px | 32 px |
| горизонтальная прокрутка страницы | нет | нет | нет |

- Диалог 422: заголовок пометки 15,55, текст 13,00 на 375 и 1280 px; пояснения и кнопок «К вопросу» нет; в хранилище после 422 только `test-answers-wal-…`; после «Начать заново» — WAL и `test-session-…` новой сессии.
- «К вопросу 2» с открытого вопроса 1: на странице вопрос 2, фокус на номере «2.». Блок текста получает фокус с клавиатуры, кольцо `box-shadow 0 0 0 2px` цвета `ring`.
- Первый прогон нашёл дефект: в диалоге 422 длинное слово без пробелов растягивало сетку `AlertDialogContent`, кнопка «Начать заново» уезжала за экран (x = 1834 при ширине 1280, клик падал на «element is outside of the viewport»). Исправлено `min-w-0` на корне пометки; повторный прогон зелёный.

## CodeGraph

- `codegraph impact clearAttemptKeys`: 12 символов, все в `storage-keys.ts` и `lifecycle.ts` (`sendSubmit`, `resubmit`, `runSubmit`, `applyServerSession`, `runStart`, `applySubmitFailure`, `reset`, `blockStart`, `startForSubmit`).
- `codegraph impact storageKeysToClear`: 9 символов — `clearAttemptKeys` и те же функции `lifecycle.ts`.
- `codegraph affected` по `lifecycle.ts`, `attempt-submit-flow.ts`, `storage-keys.ts`, `TestRunner.tsx`, `use-attempt-lifecycle.ts` вернул только сами файлы (индекс построен по основному checkout, файлы worktree в нём не видны). Набор тестов выбран по `impact`: каталог `attempt-lifecycle`, `attempt-submit-flow.test.ts`, охранник, весь web-набор, e2e плана. Других пользователей `storageKeysToClear`, `attemptStorageKeys` и `setQuestionIds` вне `attempt-lifecycle` нет (`grep`).

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle components/tests/attempt-submit-flow.test.ts`: 9 файлов, 214 тестов зелёные.
- `node --test scripts/draft-durability-guards.test.mjs`: 7 pass, 0 fail.
- `yarn workspace @bio-exam/web test`: 97 файлов, 1495 тестов зелёные. До плана (вычислено, а не измерено на HEAD: 1495 − 17 добавленных) — 96 файлов, 1478 тестов; план добавил файл `wal-reconcile.test.ts` с 10 случаями и 7 тестов в `lifecycle-submit.test.ts`. Расхождение с 95/1458 из 11-12-SUMMARY — тесты других планов фазы, влитых в `dev` после замера 11-12.
- `yarn workspace @bio-exam/web typecheck`: exit 0. `yarn workspace @bio-exam/web lint`: exit 0, в файлах плана новых предупреждений нет (`TestRunner.tsx:108` — прежнее `set-state-in-effect` у `setAttempts`).
- `yarn format:check`: чисто.
- `yarn e2e tests/timed-attempt.spec.ts tests/answer-durability.spec.ts`: 22 passed (14 setup + 8 тестов на двух проектах), с первого прогона; повторён после правки `min-w-0` — снова 22 passed.
- `yarn verify`: `yarn verify: OK` (все восемь шагов passed, с первого прогона; запущен после последней правки кода).
- `11-plan-files.cjs check 11-13` не запускался (режим worktree, сверку делает ведущая сессия).

## Acceptance

- `grep -c "test-unsent-" scripts/draft-durability-guards.test.mjs` = 1.
- `test-unsent-` в `app/web` вне `components/tests/attempt-lifecycle/` — пусто.
- `grep -c unsentTexts lifecycle.ts` = 3; `UnsentTextNote` в `TestRunner.tsx` = 4; `SUBMIT_FLOW_TEXT.timeExpiredTitle` = 1.
- `wal-reconcile.test.ts` содержит `test.each` и случаи `trim`, `pending`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Кнопка «Начать заново» за пределами экрана при длинном тексте**
- **Found during:** Task 3, проверка в браузере
- **Issue:** блок пометки — элемент сетки `AlertDialogContent` с `min-width: auto`; слово без пробелов растягивало колонку, футер с `justify-end` уезжал вправо за край экрана.
- **Fix:** `min-w-0` на корне `UnsentTextNote`.
- **Files modified:** `app/web/components/tests/attempt-result/UnsentTextNote.tsx`

**2. [Rule 2 - a11y] `role="group"` у блока текста**
- **Found during:** Task 1
- **Issue:** UI-SPEC даёт блоку `aria-label` без роли; у `div` без роли (`generic`) имя по ARIA 1.2 запрещено, читатель экрана может его не озвучить.
- **Fix:** `role="group"`; имя и фокус с клавиатуры (`tabIndex={0}`) сохранены.
- **Files modified:** `app/web/components/tests/attempt-result/UnsentTextNote.tsx`

### Прочие отклонения

- Пометка стоит и в запасной панели «Ответ принят» без вида (заголовок «могла», без «К вопросу»): иначе вариант «могла» из UI-SPEC на странице не появлялся бы, а план в Task 1 п. 7 называет только панель результата.
- Запись `unsent` удаляется и в `startForSubmit` (сдача без сессии начинается со `/start`), а не только в `applyServerSession`: truth плана — «любой успешный /start». Удаление — только при наличии записи, чтобы не менять закрепление `lifecycle.test.ts › ревью C-01, R-04` (полный список вызовов `removeItem`).
- `UnsentRecord` объявлен в `wal-reconcile.ts`, `writeUnsent` — в `storage-keys.ts` рядом с `writeCachedSession` (план не назначал место).
- Сверка берёт ответы из памяти модуля, а не перечитывает WAL: память пишется раньше WAL и совпадает с ним после восстановления.
- Помощник `textResult` добавлен в `testing.ts` для видов попытки в тестах.
- Временный e2e-файл для проверки в браузере создан и удалён; в рабочем дереве его нет.
- `11-plan-files.cjs check 11-13` не запускался (режим worktree).

## Known Stubs

None.

## Threat Flags

None. Митигации T-11-40…T-11-42 реализованы: ключ с `-<userId>`, удаление следующим стартом и событием `success` (выход — 11-17), литерал под охранником; WAL удаляется только после успешной записи (тест R8 с `failWrites`); пометка говорит «засчитан ответ, который успел сохраниться», текст только для чтения и никуда не отправляется.

## Файлы к коммиту

- `app/web/components/tests/attempt-lifecycle/wal-reconcile.ts` (новый)
- `app/web/components/tests/attempt-lifecycle/wal-reconcile.test.ts` (новый)
- `app/web/components/tests/attempt-result/UnsentTextNote.tsx` (новый)
- `app/web/components/tests/attempt-lifecycle/storage-keys.ts`
- `app/web/components/tests/attempt-submit-flow.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/testing.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts`
- `app/web/components/tests/TestRunner.tsx`
- `scripts/draft-durability-guards.test.mjs`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-13-SUMMARY.md`
