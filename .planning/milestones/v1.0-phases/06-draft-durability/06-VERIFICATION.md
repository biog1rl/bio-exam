---
phase: 06-draft-durability
verified: 2026-10-04T23:36:21Z
status: passed
human_verification_confirmed: "2026-10-05, пользователь"
score: 4/5 must-haves verified
covered_files: [".agents/skills/bio-exam-api/SKILL.md", ".agents/skills/bio-exam-data/SKILL.md", ".agents/skills/bio-exam-web/SKILL.md", ".planning/phases/06-draft-durability/06-01-PLAN.md", ".planning/phases/06-draft-durability/06-01-SUMMARY.md", ".planning/phases/06-draft-durability/06-02-PLAN.md", ".planning/phases/06-draft-durability/06-02-SUMMARY.md", ".planning/phases/06-draft-durability/06-03-PLAN.md", ".planning/phases/06-draft-durability/06-03-SUMMARY.md", ".planning/phases/06-draft-durability/06-04-PLAN.md", ".planning/phases/06-draft-durability/06-04-SUMMARY.md", ".planning/phases/06-draft-durability/06-05-PLAN.md", ".planning/phases/06-draft-durability/06-05-SUMMARY.md", ".planning/phases/06-draft-durability/06-06-PLAN.md", ".planning/phases/06-draft-durability/06-06-SUMMARY.md", ".planning/phases/06-draft-durability/06-07-PLAN.md", ".planning/phases/06-draft-durability/06-07-SUMMARY.md", ".planning/phases/06-draft-durability/06-08-PLAN.md", ".planning/phases/06-draft-durability/06-08-SUMMARY.md", ".planning/phases/06-draft-durability/06-09-PLAN.md", ".planning/phases/06-draft-durability/06-09-SUMMARY.md", ".planning/phases/06-draft-durability/06-10-PLAN.md", ".planning/phases/06-draft-durability/06-10-SUMMARY.md", ".planning/phases/06-draft-durability/06-11-PLAN.md", ".planning/phases/06-draft-durability/06-11-SUMMARY.md", "AGENTS.md", "app/server/src/routes/tests/public.ts", "app/server/src/services/attempt-sessions/sessions.ts", "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx", "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.test.ts", "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts", "app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx", "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts", "app/web/components/Buttons/BackButton.tsx", "app/web/components/Buttons/UnsavedChangesDialog.tsx", "app/web/components/editor/editor.tsx", "app/web/components/tests/TestRunner.tsx", "app/web/components/tests/attempt-lifecycle/answer-edits.test.ts", "app/web/components/tests/attempt-lifecycle/answer-edits.ts", "app/web/components/tests/attempt-lifecycle/index.ts", "app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts", "app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts", "app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts", "app/web/components/tests/attempt-lifecycle/lifecycle.test.ts", "app/web/components/tests/attempt-lifecycle/lifecycle.ts", "app/web/components/tests/attempt-lifecycle/restore.test.ts", "app/web/components/tests/attempt-lifecycle/restore.ts", "app/web/components/tests/attempt-lifecycle/save-indicator.ts", "app/web/components/tests/attempt-lifecycle/storage-keys.ts", "app/web/components/tests/attempt-lifecycle/testing.ts", "app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts", "app/web/components/tests/attempt-lifecycle/wal.test.ts", "app/web/components/tests/attempt-lifecycle/wal.ts", "app/web/components/tests/attempt-submit-flow.test.ts", "app/web/components/tests/attempt-submit-flow.ts", "app/web/components/tests/client-attempt-id.test.ts", "app/web/components/tests/client-attempt-id.ts", "app/web/lib/drafts/before-unload.test.ts", "app/web/lib/drafts/before-unload.ts", "app/web/lib/drafts/draft-ui.test.ts", "app/web/lib/drafts/draft-ui.ts", "app/web/lib/drafts/question-draft-api.test.ts", "app/web/lib/drafts/question-draft-api.ts", "app/web/lib/drafts/question-draft-autosave.test.ts", "app/web/lib/drafts/question-draft-autosave.ts", "app/web/lib/drafts/question-draft-copy.test.ts", "app/web/lib/drafts/question-draft-copy.ts", "app/web/lib/drafts/save-queue.test.ts", "app/web/lib/drafts/save-queue.ts", "app/web/lib/drafts/use-question-draft-autosave.ts", "app/web/lib/tests/api.ts", "app/web/lib/tests/attempt-draft-save.test.ts", "app/web/lib/tests/types.ts", "app/web/store/unsavedChanges.store.test.ts", "app/web/store/unsavedChanges.store.ts", "e2e/tests/answer-durability.spec.ts", "e2e/tests/question-draft-durability.spec.ts", "packages/exam-core/src/attempt-session.test.ts", "packages/exam-core/src/attempt-session.ts", "packages/exam-core/src/index.ts", "scripts/check-docs-commands.mjs", "scripts/check-docs-commands.test.mjs", "scripts/check-docs-structure.test.mjs", "scripts/check-exam-core-dist.mjs", "scripts/draft-durability-guards.test.mjs", "scripts/exam-core-no-private-copies.test.mjs"]
covered_digest: "v2:sha256:9143e00f138be5040c9a25661b85779e304a058683fa8a64e94efc96aa081c46"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Тест с лимитом времени в браузере: «Начать тест?», таймер, тост «Осталась 1 минута…», оверлей «Время вышло» и автосдача, диалоги 409 и 422, плашка «Повторить» (в том числе после неудачного повтора отправки при восстановлении, CR-01)"
    expected: "Поведение совпадает с модульными тестами lifecycle-time/lifecycle-submit/lifecycle-restore и 05-UI-SPEC :185/:187 в редакции решений пользователя 2026-10-04"
    why_human: "Все e2e фазы идут на тестах без лимита; таймер и автосдача проверены только модульно с фальшивыми часами"
  - test: "Тест без лимита: ответы, DevTools Offline, «Завершить», плашка с «Повторить»; включить сеть и перезагрузить"
    expected: "Модуль сам повторяет отправку с тем же clientAttemptId, показывает «Результат» без нового прохода, в истории одна попытка"
    why_human: "Нужен настоящий браузер с переключением сети и перезагрузкой; e2e этот сценарий не покрывает"
  - test: "Slow 3G (LIFE-05, критерий 4): ученик отвечает на Q1, сразу Q2, перезагрузка; ответ и сразу переход по крошкам. Учитель правит черновик и сразу «Отмена» / «Назад» в шапке; Offline + «Отмена» → диалог; закрытие вкладки при «Сохранение…» и после «Сохранено»; устройство A Offline + устройство B → тост «Черновик изменён в другом месте…»"
    expected: "Последний ответ и последняя правка на месте после перезагрузки и немедленного ухода; браузерное предупреждение только пока есть несохранённая запись"
    why_human: "Критерий 4 и LIFE-05 прямо требуют ручной проверки в браузере под троттлингом сети"
  - test: "375px и колонка 160px (tab:w-48): строка состояния ученика «Нет связи…», строка автосохранения черновика над «Отмена»/«Сохранить вопрос», «Повторить сохранение», диалог ухода с длинным описанием; пункты UI-SPEC [авто] (порог 1500 мс, text-amber-700, тексты тостов 403/404/второго 409)"
    expected: "Перенос по словам, без обрезки и горизонтального скролла, кнопки подвала диалога столбцом, «Выйти» сверху"
    why_human: "Визуальная вёрстка, UI-SPEC backstop"
  - test: "Preview до прода"
    expected: "Прохождение теста и черновик вопроса работают на preview, вкладка со старым JS пишет прежний WAL, новый код его читает"
    why_human: "Деплой и preview выполняет пользователь; у агента нет доступа"
  - test: "Выкатка D-30: вместе с фазой 5 или после неё"
    expected: "Меняется только клиент, миграций и env-ключей нет, порядок деплоя web и server не важен"
    why_human: "Решение и действие пользователя на сервере"
  - test: "Решение по use-debounce: удалить зависимость из app/web/package.json (меняет yarn.lock) или оставить в Deferred"
    expected: "Решение пользователя записано"
    why_human: "Запрет плана 06-11: агент зависимость не удаляет"
  - test: "Запреты планов (must_haves.prohibitions): 5 пунктов уровня judgment и test-уровня без связанного теста, см. раздел «Запреты планов»"
    expected: "Пользователь подтверждает вердикт верификатора или отмечает нарушение"
    why_human: "Вердикт по judgment-запретам неавторитетный; test-запреты без проводки теста не засчитываются зелёными (fail-closed)"
---

# Фаза 6: Draft durability — отчёт верификации

**Цель фазы:** ответы ученика и черновик вопроса учителя переживают быстрые правки, перезагрузку и немедленный уход.
**Проверено:** 2026-10-04T23:36:21Z (06:36 по локальному времени 2026-10-05), основное дерево, ветка `dev`, HEAD 63259c0.
**Статус:** human_needed
**Повторная верификация:** нет, первичная.

Решения пользователя 2026-10-05 по ревью (CR-01, CR-04, CR-11) и правки CR-02, NQ-01, NQ-03, NQ-09 входят в коммит 63259c0 (10 файлов, совпадает со списком `06-REVIEW-FIX.md`), рабочее дерево чистое. Они учтены как принятые.

## Достижение цели

### Критерии успеха ROADMAP

| # | Критерий | Статус | Доказательство |
|---|---|---|---|
| 1 | Q1 и Q2 в окне дебаунса, перезагрузка — оба ответа восстановлены | VERIFIED | `lifecycle.ts:801-808` `answer` синхронно пишет WAL (`recordAnswer`) до очереди; ключ `test-answers-wal-${testId}-${userId}` тот же, что в `0d633ed:TestRunner.tsx:174`. Тесты (прогнаны мной): «D-26 п. 1: перезагрузка в окне дебаунса: новый модуль видит оба ответа и досылает их», «D-26 п. 2: dispose в окне дебаунса…». E2E `LIFE-02: ответы на вопросы 1 и 2 в окне дебаунса переживают перезагрузку @life02` без `test.fail` |
| 2 | Retake — чистый старт одним сбросом (черновик, телеметрия, таймеры); скрытая вкладка не копит время; тесты с фальшивыми часами через модуль | VERIFIED | Единственный `reset()` (`lifecycle.ts:676-703`): поколение, очередь, пауза, индикатор, тик, отрезок, ключи, `clearDraftState()`. `openSegment` не открывает отрезок при `visibility.isHidden()`, `hidden` закрывает отрезок (`:295-305`, `:716-731`). Тесты: «D-26 п. 4: retake после submitted равен новому модулю на пустом хранилище», «retake после 422: очередь s1 отброшена…», «retake во время паузы автосдачи…», «D-05: после 422 и retake…», «D-26 п. 5: вкладка скрыта 60 с — время вопроса без этих 60 с» |
| 3 | Учитель правит черновик и сразу «Назад»/«Отмена» — последняя правка цела; виден pending/error; leave-prompt только при несохранённой записи; нет повторного save после досылки | VERIFIED | «Отмена» → `leaveDraft` → `useUnsavedChanges.leave(pathname)` → `autosave.flushForLeave()` (`QuestionEditorPageClient.tsx:281-296`, `use-question-draft-autosave.ts:104-111`); «Назад» в шапке — `BackButton` в `AppLayout.tsx:51` (корневой layout) через тот же `leave`. Статус рисуется: `QuestionEditor.tsx:146` `AutosaveStatusLine`, `leaving` на кнопках. `beforeunload` подключается только при `hasUnsavedWrite` (`question-draft-autosave.ts:203`). Дедупликация: `send` возвращает OK при `serial === ackedSerial` и общий промис для одного serial. Тесты: «D-26 п. 10: change и сразу flushForLeave → один save, { ok: true }, затем 10 с без вызовов», «D-26 п. 12: сбой → error failed… «Повторить» → saved», «D-26 п. 13: beforeunload только пока есть несохранённая запись», CR-02 (2 теста), стор «shares one flush between calls made while it runs». E2E `LIFE-04: правка и сразу «Отмена»…` с проверкой сервера и снятой копии (NQ-01), `LIFE-04: перезагрузка во время задержанного PATCH…` |
| 4 | `TestRunner` только рисует, модуль владеет форматом черновика, телеметрией и сбросом; ручная проверка под троттлингом сети подтверждает | UNCERTAIN (нужен человек) | Автоматическая часть подтверждена: в `TestRunner.tsx` нет `localStorage`, `setTimeout`, `setInterval`, `visibilitychange`, `beforeunload`, прямых вызовов API попытки; только `lifecycle.answer/navigate/submit/retake/confirmStart` и `useAttemptLifecycle`. Охранный тест `scripts/draft-durability-guards.test.mjs` в шаге `script-tests` (прогнан мной). Ручная часть (Slow 3G) не выполнялась — пункт human_verification 3 |
| 5 | Навыки `bio-exam-web`, `bio-exam-api`, `bio-exam-data` в `.agents/skills/`, проходят `quick_validate.py`, маршрутизация из `AGENTS.md` | VERIFIED | Три `SKILL.md` есть; `python3 ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/quick_validate.py .agents/skills/bio-exam-<x>` — «Skill is valid!», exit 0 для всех трёх (прогнано мной). `AGENTS.md:42-48` колонка `Skill`, `AGENTS.md:53` указание читать навык. Во frontmatter только `name`, `description` (тест NQ-09) |

**Счёт:** 4/5 критериев подтверждены (0 present-but-behavior-unverified). Критерий 4 не засчитан целиком: его ручная половина — отложенный человеческий шаг.

### Требования

| Требование | Планы | Статус | Доказательство |
|---|---|---|---|
| LIFE-01 | 06-03, 06-05, 06-07, 06-09, 06-11 | SATISFIED (ручная часть критерия 4 — human) | Модуль `components/tests/attempt-lifecycle/lifecycle.ts` с портами `storage`, `api`, `clock`, `visibility`; `TestRunner` не разбит на четыре хука, рисует через `useAttemptLifecycle` |
| LIFE-02 | 06-01, 06-02, 06-03, 06-09, 06-11 | SATISFIED | Синхронный WAL под прежним ключом, дебаунс только сети (`ATTEMPT_SAVE_DEBOUNCE_MS = 600` в очереди), `dispose`/`pagehide` досылают; тесты D-26 п. 1, 2 |
| LIFE-03 | 06-05, 06-07, 06-09 | SATISFIED | Один `reset()`, тесты retake и скрытой вкладки на `vi` фальшивых часах |
| LIFE-04 | 06-01, 06-02, 06-04, 06-06, 06-08, 06-11 | SATISFIED | Досылка перед «Отмена»/«Назад», строка статуса с «Повторить», охрана `beforeunload`, без повторного save |
| LIFE-05 | 06-01…06-05, 06-07…06-09, 06-11 | NEEDS HUMAN | Автоматические тесты по всем перечисленным сценариям есть и зелёные; ручная проверка под троттлингом сети отложена |
| VER-08 | 06-10, 06-11 | SATISFIED | См. критерий 5 |

Осиротевших требований нет: LIFE-03 заявлен в 06-05, 06-07, 06-09 (в `requirements-completed` 06-11 его нет, это не пробел).

### Ключевые артефакты и связи

| Артефакт | Статус | Детали |
|---|---|---|
| `attempt-lifecycle/lifecycle.ts` (872 стр.) | VERIFIED | Подключён через `use-attempt-lifecycle.ts` → `TestRunner.tsx:142`; API: `startTestSession`, `saveAttemptDraft`, `submitPublicTestAnswers` |
| `attempt-lifecycle/wal.ts`, `storage-keys.ts`, `restore.ts` | VERIFIED | Ключи только в `attempt-lifecycle` (охранный тест) |
| `lib/drafts/save-queue.ts` | VERIFIED | Общая очередь для попытки и черновика |
| `lib/drafts/question-draft-autosave.ts`, `use-question-draft-autosave.ts` | VERIFIED | Подключены в `QuestionEditorPageClient.tsx:180`; `registerFlush(pathname, flushForLeave)` |
| `lib/drafts/before-unload.ts` | VERIFIED | Единственный слушатель `beforeunload` в `app/web` (охранный тест) |
| `store/unsavedChanges.store.ts`, `BackButton.tsx`, `UnsavedChangesDialog.tsx` | VERIFIED | `BackButton` в `AppLayout` корневого `app/layout.tsx` |
| `packages/exam-core/src/attempt-session.ts` | VERIFIED | `SaveAttemptDraftRequestSchema` идентична удалённой серверной `SaveDraftAnswerSchema`; сервер её импортирует, поведение маршрута прежнее |
| `.agents/skills/bio-exam-{web,api,data}/SKILL.md` | VERIFIED | См. критерий 5 |
| `scripts/draft-durability-guards.test.mjs` | VERIFIED | В шаге `script-tests` (`scripts/verify.mjs:55`, обход `*.test.mjs`) |

### Правки по ревью (решения пользователя 2026-10-05)

| id | Где | Тест (прогнан мной, зелёный) |
|---|---|---|
| CR-02 | `question-draft-autosave.ts:285-301` повтор после 409 несёт `latestPayload` | два теста «CR-02: …» |
| CR-01 | `lifecycle.ts:493-508` `resubmit` ставит `submitFailed` при прежних поколении, сессии и фазе `active` | «CR-01: frozenKey, повтор упал с 500, /start вернул другую s2 → без плашки», «…/start тоже упал сетью → с плашкой» |
| CR-11 | `lifecycle.ts:827-837` `setQuestionIds`, `knownAnswers()`; хук передаёт список (`use-attempt-lifecycle.ts:110-116`) | три теста «CR-11: …» |
| CR-04 | `lifecycle.ts:420-435,595` `mergeServerDraft` по D-12 | «CR-04: отправка без сессии… локальный побеждает» |
| NQ-01 | `e2e/tests/question-draft-durability.spec.ts:84-93` | в составе e2e |
| NQ-03 | `draft-durability-guards.test.mjs:71-85` | `node --test` |
| NQ-09 | `check-docs-structure.test.mjs:80-97` | `node --test` |

### Поток данных (Level 4)

| Артефакт | Данные | Источник | Статус |
|---|---|---|---|
| `TestRunner.tsx` | `snapshot.answers`, `currentQuestionId`, `secondsLeft`, `saveIndicator` | `useAttemptLifecycle` ← `lifecycle.ts` ← WAL (`readWal`) и `/start` (`applyServerSession`) | FLOWING |
| `QuestionEditor.tsx` | `autosaveStatus`, `leaving` | `useQuestionDraftAutosave` snapshot ← `question-draft-autosave.ts` ← ответы PATCH черновика | FLOWING |

### Пробы

Проб `scripts/*/tests/probe-*.sh` в проекте и в планах фазы нет.

### Поведенческие проверки

| Проверка | Команда | Результат | Статус |
|---|---|---|---|
| Модуль попытки, черновик, стор | `npx vitest run components/tests/attempt-lifecycle lib/drafts store/unsavedChanges.store.test.ts lib/tests/attempt-draft-save.test.ts` (в `app/web`) | 16 файлов, 276 passed | PASS |
| Охранный тест и структура навыков | `node --test scripts/draft-durability-guards.test.mjs scripts/check-docs-structure.test.mjs` | 18 pass, 0 fail | PASS |
| quick_validate | `python3 …/quick_validate.py .agents/skills/bio-exam-{web,api,data}` | 3 × «Skill is valid!» | PASS |
| E2E `@life02`, `@life04` | не запускал (параллельный `yarn e2e` в основном дереве) | `test-results/.last-run.json` от 06:35:34 (после HEAD 06:30): `"status": "passed"`, `failedTests: []`; `test.fail`/`@known-defect`/`test.skip` в `e2e/tests` нет | SKIP (артефакт чужого прогона, итог передаёт оркестратор) |
| `yarn verify` | не запускал | итог — у параллельного прогона оркестратора | SKIP |

### Запреты планов (must_haves.prohibitions)

| План | Запрет | Уровень | Вердикт |
|---|---|---|---|
| 06-01 | Код приложения не меняется, только два spec | test | Наблюдение: коммит 2132828 — только два spec. Связанного теста нет → flagged |
| 06-01 | Ожидаемо падающая проверка не ослаблена | judgment | Неавторитетно: соблюдено (проверки утверждают целевое поведение) → flagged |
| 06-02 | Маршруты, коды, тела сервера не меняются; миграций и env нет | test | Схема перенесена без изменений; `app/server/drizzle` и `.env.example` не менялись; шаги `migrations`/`env-contract` в `yarn verify` |
| 06-02 | Пакетного PATCH и новых маршрутов нет | judgment | Неавторитетно: соблюдено → flagged |
| 06-03 | TestRunner в плане не меняется; модуль без React | test | Наблюдение по коммиту 76d0401; чистота модулей — охранный тест |
| 06-03 | Имена ключей не меняются; ответы только в WAL | test | Ключи совпадают с `0d633ed`; тест «D-26 п. 9: sessionKey после старта содержит только sessionId и startedAt» |
| 06-04 | Страница, QuestionEditor, BackButton, стор не меняются в плане | test | Наблюдение по коммиту 80a15cd → flagged (нет теста) |
| 06-05 | Тексты таблицы «Поведение» фазы 5 не меняются (кроме :185/:187) | test | Тесты «строки таблицы «Поведение» фазы 5» в `lifecycle-submit.test.ts` |
| 06-05 | TestRunner и attempt-submit-flow не меняются в плане | test | Наблюдение по коммиту ab290e8 → flagged |
| 06-06 | Режим черновика, QuestionEditor и др. не меняются в плане | test | Наблюдение по коммиту 7dcbe0e (QuestionEditor не тронут) → flagged |
| 06-06 | Крошки и «назад» браузера не перехватываются (D-17) | judgment | Неавторитетно: `popstate`/`pushState` в `app/web` нет → flagged |
| 06-07 | Пауза таймера при скрытой вкладке не вводится | test | Тест «лимит 10 мин: … при скрытой вкладке тики продолжаются» |
| 06-07 | `mergeTelemetryMaps` не меняется | test | В диффе `packages/exam-core/src` её нет → flagged (нет теста) |
| 06-08 | Маршруты question-drafts, payload, экраны ошибок не меняются | test | Наблюдение: «Назад к тесту» на экранах ошибок на месте → flagged |
| 06-08 | Шапка QuestionEditor вне режима черновика не меняется | judgment | Неавторитетно: `autosaveStatus`/`leaving` передаются только в режиме черновика → flagged |
| 06-09 | Строки e2e и вид прохождения не меняются | test | E2E по этим строкам; `.last-run.json` passed |
| 06-09 | `extractImagePaths` и предзагрузка не трогаются | test | В диффе TestRunner этих строк нет; охранный тест требует `function extractImagePaths` |
| 06-10 | В навыках нет истории, будущих фаз, клиента, реальных env; команды yarn существуют | test | Команды — `check-docs-commands` над навыками; «история» — только наблюдение grep → flagged |
| 06-10 | Код приложения не меняется | test | Наблюдение по efa7bf8 (только навыки, AGENTS.md, скрипты проверок) → flagged |
| 06-11 | Агент не деплоит, не удаляет use-debounce, не одобряет ручные проверки | judgment | `use-debounce` в `app/web/package.json:122` на месте; Task 3 не одобрен → flagged |

Нарушений не найдено. Flagged-пункты вынесены в human_verification (п. 8), а не засчитаны молча.

### Анти-паттерны

Добавленные строки диффа `0d633ed..63259c0` (вне `.planning` и `*.md`): `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/заглушек нет; новых комментариев нет. Блокеров нет.

### Отложенное (не gaps)

- `06-REVIEW-DISPOSITION.md` «Отложено»: CR-06/SEC-03 (R-15), CR-07 (двойной переход «Отмена» + «Назад»), CR-08 и keepalive-часть CR-03 (R-06), NQ-02; backlog SEC-01, CR-03, CR-05, CR-09, CR-10, SEC-02, NQ-04, NQ-06…NQ-08; фаза 8: SEC-04, SEC-05, NQ-05.
- Deferred 06-11: R-05, R-06, R-15, R-16, `use-debounce`, подсказка автодополнения в `promptText` (фаза 8).
- 06-10: обновление навыков после нарезки роутера (фаза 8) и слияния 07.1.

## Требуется проверка человеком

1. **Тест с лимитом времени в браузере.** «Начать тест?», таймер, тост за минуту, «Время вышло» и автосдача, 409/422, плашка «Повторить» (в том числе CR-01). E2E на лимит нет, только модульные тесты.
2. **Offline → «Завершить» → перезагрузка** (тест без лимита). Повтор с тем же `clientAttemptId`, «Результат», одна попытка в истории.
3. **Slow 3G (критерий 4, LIFE-05).** Ученик: Q1, сразу Q2, перезагрузка; переход по крошкам. Учитель: правка и сразу «Отмена»/«Назад», Offline + «Отмена», закрытие вкладки при «Сохранение…», расхождение A/B.
4. **375px и колонка 160px** и пункты UI-SPEC [авто].
5. **Preview** до прода.
6. **Выкатка D-30** вместе с фазой 5 или после неё.
7. **Решение по `use-debounce`.**
8. **Подтвердить вердикты по запретам планов** (таблица выше).

## Итог

Код фазы достигает цели в части, проверяемой автоматически: модуль попытки владеет WAL, телеметрией и сбросом, TestRunner только рисует, черновик вопроса досылается перед уходом без повторной записи, навыки на месте. Gaps нет. Статус `human_needed`: ручная проверка под троттлингом сети входит в сам критерий 4 и LIFE-05, плюс отложенные шаги пользователя (лимит времени, Offline-сценарий, 375px, preview, D-30).

---

_Проверено: 2026-10-04T23:36:21Z_
_Верификатор: Claude (gsd-verifier)_

## Закрытие

2026-10-05. Код фазы работает на проде (`bio-exam.ru`, свой сервер, ветка `master`). Пункты раздела «Человеческая проверка» пользователь подтвердил как выполненные; пункты про preview Vercel заменены работой на своём сервере.

`covered_digest` пересчитан на `dev` 41f580a (файлы фазы менялись следующими фазами). Верификатор заново не запускался: на этом коде проходят `yarn verify` и e2e.

`covered_digest` пересчитан на `dev` 1962edd после тестов покрытия, уборки web-тестов и удаления мёртвого кода (b720f21, 3513919, 65f04e5).
