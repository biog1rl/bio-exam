---
phase: 06-draft-durability
reviewed: 2026-10-04T20:05:13Z
depth: deep
scope: "git diff 0d633ed..57ec83c (ветка gsd/phase-06)"
files_reviewed: 65
files_reviewed_list:
  - .agents/skills/bio-exam-api/SKILL.md
  - .agents/skills/bio-exam-data/SKILL.md
  - .agents/skills/bio-exam-web/SKILL.md
  - AGENTS.md
  - app/server/src/routes/tests/public.ts
  - app/server/src/services/attempt-sessions/sessions.ts
  - "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.test.ts"
  - "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts"
  - "app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts"
  - app/web/components/Buttons/BackButton.tsx
  - app/web/components/Buttons/UnsavedChangesDialog.tsx
  - app/web/components/editor/editor.tsx
  - app/web/components/tests/TestRunner.tsx
  - app/web/components/tests/attempt-lifecycle/answer-edits.test.ts
  - app/web/components/tests/attempt-lifecycle/answer-edits.ts
  - app/web/components/tests/attempt-lifecycle/index.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle.ts
  - app/web/components/tests/attempt-lifecycle/restore.test.ts
  - app/web/components/tests/attempt-lifecycle/restore.ts
  - app/web/components/tests/attempt-lifecycle/save-indicator.test.ts
  - app/web/components/tests/attempt-lifecycle/save-indicator.ts
  - app/web/components/tests/attempt-lifecycle/storage-keys.ts
  - app/web/components/tests/attempt-lifecycle/testing.ts
  - app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
  - app/web/components/tests/attempt-lifecycle/wal.test.ts
  - app/web/components/tests/attempt-lifecycle/wal.ts
  - app/web/components/tests/attempt-submit-flow.test.ts
  - app/web/components/tests/attempt-submit-flow.ts
  - app/web/components/tests/client-attempt-id.test.ts
  - app/web/components/tests/client-attempt-id.ts
  - app/web/lib/drafts/before-unload.test.ts
  - app/web/lib/drafts/before-unload.ts
  - app/web/lib/drafts/draft-ui.test.ts
  - app/web/lib/drafts/draft-ui.ts
  - app/web/lib/drafts/question-draft-api.test.ts
  - app/web/lib/drafts/question-draft-api.ts
  - app/web/lib/drafts/question-draft-autosave.test.ts
  - app/web/lib/drafts/question-draft-autosave.ts
  - app/web/lib/drafts/question-draft-copy.test.ts
  - app/web/lib/drafts/question-draft-copy.ts
  - app/web/lib/drafts/save-queue.test.ts
  - app/web/lib/drafts/save-queue.ts
  - app/web/lib/drafts/use-question-draft-autosave.ts
  - app/web/lib/tests/api.ts
  - app/web/lib/tests/attempt-draft-save.test.ts
  - app/web/lib/tests/types.ts
  - app/web/store/unsavedChanges.store.test.ts
  - app/web/store/unsavedChanges.store.ts
  - e2e/tests/answer-durability.spec.ts
  - e2e/tests/question-draft-durability.spec.ts
  - packages/exam-core/src/attempt-session.test.ts
  - packages/exam-core/src/attempt-session.ts
  - packages/exam-core/src/index.ts
  - scripts/check-docs-commands.mjs
  - scripts/check-docs-commands.test.mjs
  - scripts/check-docs-structure.test.mjs
  - scripts/check-exam-core-dist.mjs
  - scripts/draft-durability-guards.test.mjs
  - scripts/exam-core-no-private-copies.test.mjs
findings:
  blocker: 0
  major: 2
  minor: 9
  critical: 0
  warning: 2
  info: 9
  total: 11
status: issues_found
---

# Phase 6: ревью кода (Draft durability)

**Дата:** 2026-10-04T20:05:13Z
**Глубина:** deep (вызовы между модулями, гонки запросов, пути восстановления)
**Область:** `git diff 0d633ed..57ec83c`, 65 файлов, worktree `gsd/phase-06`
**Статус:** issues_found

Шкала: BLOCKER → `critical`, MAJOR → `warning`, MINOR → `info` во frontmatter.

## Сводка

Основные пути работают: синхронный WAL, восстановление с `pending`, повтор submit по `clientAttemptId`, досылка при «Отмена»/«Назад», локальная копия черновика. Подтверждённые решения пользователя (D-07 п. 1 «сначала submit», D-07 п. 2, R-01, R-07, D-21 «побеждает эта вкладка», D-17, D-15) дефектами не считаются.

Найдено два дефекта MAJOR, оба воспроизведены скриптами на исходниках worktree:

1. После восстановления с `frozenKey` повтор автосдачи падает по сети, и попытка остаётся в `active` на 00:00. Плашки повтора нет, автосдачи больше нет (CR-01).
2. Повтор после 409 в автосохранении черновика отправляет устаревший payload. При неуправляемом уходе во время PATCH в полёте он может перезаписать более новую правку, и локальная копия при этом уже удалена (CR-02).

Остальные девять находок MINOR: редкие гонки, неполное покрытие e2e и разночтения индикатора.

Скрипты воспроизведения лежат вне репозитория: `scratchpad/repro-frozen-retry.ts` и `scratchpad/repro-draft-race.ts`. Запуск: `tsx` из worktree.

## MAJOR

### CR-01 [MAJOR]: восстановление автосдачи после сбоя сети оставляет попытку на 00:00 без плашки и без повторной автосдачи

**Файл:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts:472-480`, `:331-344`, `:535-548`, `:604-608`

**Сценарий отказа:**
1. У теста с лимитом сработала автосдача: записаны `frozenKey` и `clientAttemptId`. Вкладку закрыли или перезагрузили до ответа сервера.
2. `init()` видит `clientAttemptId` и вызывает `resubmit(cached, true)`. `beginSubmit(true)` ставит `autoFired = true`.
3. Submit падает по сети или с 5xx. `applySubmitFailure` только снимает `frozenKey`, `resubmit` вызывает `runStart(current)`, и `/start` (или его сбой с закэшированной сессией) переводит попытку в `active` через `enterActive(true)`.
4. Первый тик видит `left <= 0` и `autoFired === true` и выходит (`:338-341`). Следующий тик не планируется. `submitFailed` остаётся `false`: в отличие от прямого пути `runSubmit` → `failSubmit` (`:673-675`), здесь его никто не ставит. Событие `online` вызывает только `queue.retryNow()`.

Итог: студент видит таймер 00:00, кнопку «Завершить», плашки «Не удалось сохранить ответы» нет, и ответы сами не уходят. Если он не нажмёт «Завершить» в пределах льготы `ATTEMPT_GRACE_PERIOD_MINUTES`, сервер ответит 422 и ответы не засчитаются.

Воспроизведено (`repro-frozen-retry.ts`, лимит 10 мин, старт 10:09:30, сейчас 10:20, submit бросает `TypeError`):
```
after restore: { phase: 'active', submitFailed: false, secondsLeft: 0, submits: 1 }
after 5 min:   { phase: 'active', submitFailed: false, secondsLeft: 0, submits: 1, pendingTimers: 0 }
```
Тест `lifecycle-restore.test.ts:340` («повтор упал с 500») проверяет только `phase === 'active'`, поэтому этот исход проходит.

**Правка:** путь повтора при восстановлении должен заканчиваться так же, как прямой путь отправки:
```ts
async function resubmit(current: CachedSession, auto: boolean): Promise<void> {
	const gen = generation
	beginSubmit(auto)
	const outcome = await sendSubmit(current, auto)
	if (outcome !== 'retry' || gen !== generation) return
	phase = 'starting'
	emit()
	await runStart(current)
	if (gen !== generation || phase !== 'active') return
	submitFailed = true
	emit()
}
```
Плашка повтора ставится и для ручной отправки, упавшей до перезагрузки: студент после возврата видит, что его прошлая отправка не дошла (D-07 п. 1 при этом не меняется, `clientAttemptId` остаётся). Если для ручного случая плашка не нужна, условие сузить до `if (auto)`. Дополнительно стоит на `online` при `submitFailed && autoFired` повторять `runSubmit(true)`, а в `lifecycle-restore.test.ts:340` проверять `submitFailed === true`.

### CR-02 [MAJOR]: повтор после 409 отправляет устаревший payload и при досылке из `dispose` затирает более новую правку черновика; локальная копия при этом уже удалена

**Файл:** `app/web/lib/drafts/question-draft-autosave.ts:285-299` (`exchange`), `:222-233` (`settleCopy`), `:470-478` (`dispose`), `app/web/lib/drafts/save-queue.ts:310-323` (`drain`)

**Сценарий отказа.** Управляемый уход («Отмена», «Назад» в шапке) задет только частично: пока `flushForLeave` ждёт, v2 уходит после v1 со свежей `lockVersion`, но после `LEAVE_FLUSH_TIMEOUT_MS` (5 с, медленная сеть) и «Выйти» размонтирование идёт тем же путём `dispose → drain` при v1 в полёте. Основной путь — неуправляемый уход (ссылка хлебных крошек, меню, «назад» браузера → размонтирование → `dispose()`):
1. Дебаунс отправил PATCH v1 с `lockVersion = L`, и ответ ещё не пришёл.
2. Учитель дописал текст (v2) и сразу ушёл по ссылке. `dispose()` → `drain({ keepalive: false })` пропускает только запрос «в полёте с последней версией», поэтому v2 уходит параллельно v1 и тоже с `lockVersion = L` (`lockVersion` ещё не обновлён).
3. Сервер применяет v2 первым (два запроса через прокси Next/nginx, порядок не гарантирован): `L+1`, payload v2. Ответ на v2 → `acknowledge` → `settleCopy(v2)` удаляет локальную копию, потому что она равна v2.
4. v1 получает 409. `exchange` перечитывает `lockVersion` (`L+1`) и повторяет **захваченный v1**, а не `latestPayload`. Сервер получает `L+2` с payload v1. Тост подавлен (`started === false` после `dispose`).

Итог: на сервере старая версия, локальной копии нет, правка v2 потеряна без следа. Воспроизведено (`repro-draft-race.ts`):
```
requests after dispose: [ '{"question":{"promptText":"v1"}}@1', '{"question":{"promptText":"v2"}}@1' ]
server final: {"payload":{"question":{"promptText":"v1"}},"lockVersion":3}
local copy: null
```
Тот же повтор устаревшего payload срабатывает, если после `pagehide` страница продолжила жить: keepalive v2 без `lockVersion` и v1 в полёте.

**Правка:** после первого 409 не повторять payload, который уже не последний, а `drain` не должен посылать ключ, по которому идёт запрос:
```ts
async function exchange(payload: unknown, serial: string, keepalive: boolean): Promise<SaveOutcome> {
	const first = await callSave(payload, keepalive ? null : lockVersion, keepalive)
	if (first.kind !== 'conflict' || keepalive) return applyResult(first, serial)
	if (serial !== latestSerial || ackedSerial === latestSerial) return OK
	const fresh = await readFreshLockVersion()
	...
}
```
В `save-queue.ts` `drain({ keepalive: false })` должен пропускать любой ключ с `inFlight.key === key`, а не только «в полёте последняя версия». Такой ключ досылается обычным `pump` после ответа. Если очередь уже `dispose`, запрос после ответа v1 нужно отправить из `settle`, без отказа по `disposed`. Нужен тест «v1 в полёте, change(v2), dispose, сервер отвечает сначала на v2» с проверкой, что на сервере v2.

## MINOR

### CR-03 [MINOR]: досылка попытки при `dispose`/`pagehide` идёт параллельно запросу в полёте по тому же вопросу

**Файл:** `app/web/lib/drafts/save-queue.ts:310-323`, `app/web/components/tests/attempt-lifecycle/lifecycle.ts:685-688`, `:797-803`

**Сценарий:** по Q1 в полёте PATCH со значением «ab». Студент дописал «abc» и сразу ушёл (SPA) или страница выгрузилась. `drain` шлёт «abc» параллельно, а сервер сливает по принципу «последний обработанный побеждает» (Phase 5 D-10). Если «ab» обработан вторым, на сервере остаётся «ab».

При `dispose` это лечится: подтверждение не пишется (`generation` сменился), «abc» остаётся в `pending` WAL и перекрывает сервер при следующем открытии. Если после `pagehide` страница жива (bfcache) и ответ на keepalive успел прийти, `confirmAnswer` снимает `pending`. После перезагрузки подтверждённое значение уступает серверу, и «abc» теряется.

**Правка:** та же, что в CR-02 для `drain`: не посылать ключ с запросом в полёте. Для `keepalive` хотя бы не снимать `pending`, если по ключу ещё есть запрос в полёте со старой версией.

### CR-04 [MINOR]: `startForSubmit` отбрасывает черновик существующей сессии с сервера

**Файл:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts:550-571`, `:578`; сервер считает только тело запроса: `app/server/src/routes/tests/public.ts:574`, `:601`

**Сценарий:** тест без лимита. На ноутбуке открыта сессия S с ответами в черновике сервера. На телефоне первый `/start` упал по сети, попытка в `active` без сессии, и студент ответил на часть вопросов. При «Завершить» `startForSubmit` получает от `/start` ту же S с `draftAnswers`, но не сливает их (в отличие от `applyServerSession`), а `persistAll` перезаписывает WAL. Submit уходит только с ответами телефона. Сервер оценивает `userAnswers` из тела, и ответы с ноутбука в попытку не попадают.

**Правка:** в `startForSubmit` применить `resolveRestoredDraft({ server, wal: readWal(...), cachedSessionId: null, questionIds })` так же, как в `applyServerSession`. Если в черновике сервера нашлись ответы, которых нет локально, вернуть попытку в `active` с уведомлением `session-restored` вместо немедленной отправки.

### CR-05 [MINOR]: попытка без сессии не повторяет `/start`, индикатор навсегда показывает «Нет связи с сервером»

**Файл:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts:446-452`, `:678-693`, `:763-769`; `save-indicator.ts:34`

**Сценарий:** у теста без лимита первый `/start` упал. Модуль в `active` с `session === null`, ответы пишутся только в WAL, в очередь не попадают (`if (session) queue?.set`). Связь вернулась: `online` и `visible` вызывают только `queue.retryNow()` для пустой очереди. Сессия появится только при «Завершить» или перезагрузке. До тех пор на сервере ничего нет, а индикатор показывает «Нет связи с сервером. Ответы сохранены на этом устройстве», хотя связь есть. Это расходится с D-09 «ответы уйдут, когда сессия появится»: сама сессия не появляется.

**Правка:** в `onVisibility` для `online`/`visible` и по таймеру с паузами `SAVE_RETRY_DELAYS_MS`, пока `phase === 'active' && session === null && !timeLimitMinutes`, вызывать `runStart(null)`. Успех сливает WAL без сессии через `applyServerSession` и `enqueuePending`.

### CR-06 [MINOR]: `answer()` не проверяет результат записи WAL, а индикатор обещает «сохранены на этом устройстве»

**Файл:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts:767`, `app/web/components/tests/attempt-lifecycle/wal.ts:102-105`

**Сценарий:** ключа сессии нет, а в хранилище WAL с чужим непустым `sessionId` (например, ключ сессии не записался из-за квоты или его снял другой процесс). `loadLocal(null)` такой WAL не принимает, `/start` упал. Каждый `recordAnswer` с `sessionId: null` возвращает `false` (`updateWal`, `:103`), то есть ответы только в памяти. После перезагрузки они пропадут, хотя индикатор показывает «Ответы сохранены на этом устройстве». То же при ошибке `setItem` (приватный режим, квота). D-09 разрешает работу в памяти, но не неверный текст.

**Правка:** держать в модуле флаг `walWritable` по результату `recordAnswer`/`applyTelemetry` и при `false` показывать «Нет связи с сервером» без «сохранены на этом устройстве». При `session === null` и чужом WAL без кэша сессии переводить такой WAL в состояние без сессии или удалять, как велит D-12 для чужой сессии.

### CR-07 [MINOR]: «Отмена» и «Назад» в шапке ждут один и тот же уход, и оба выполняют решение

**Файл:** `app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx:281-296`, `app/web/components/Buttons/BackButton.tsx:27-42`, `app/web/store/unsavedChanges.store.ts:50-71`

**Сценарий:** на странице черновика нажали «Отмена», и пока идёт досылка, нажали «Назад» в шапке (кнопки не блокируются, только показывают ожидание). `leave()` отдаёт обоим один промис из `pendingLeaves`, но у каждого обработчика свой `handledLeaveRef`. При успехе выполняются и `router.push('/admin/tests/…')`, и `router.back()`: навигация непредсказуема, `back()` может вернуть на сам черновик. При неудаче открываются два диалога «Есть несохранённые изменения» друг над другом.

**Правка:** `leave()` должен возвращать решение только первому вызову, а остальным — `{ kind: 'pending' }`, который игнорируется. Другой вариант: пока `leavingByPath[path]`, блокировать обе кнопки через `disabled`.

### CR-08 [MINOR]: лимит keepalive проверяется на один запрос, а у браузера он общий на все запросы страницы

**Файл:** `app/web/lib/tests/api.ts:132`, `:143`; `app/web/lib/drafts/question-draft-api.ts:28`; `app/web/lib/drafts/save-queue.ts:315-321`

**Сценарий:** при `pagehide` модуль попытки шлёт по keepalive-запросу на каждый неподтверждённый вопрос и ещё один на телеметрию. Каждый проверяется на 60 000 байт, а у Chromium 64 КиБ на сумму тел keepalive-запросов в полёте. При нескольких длинных текстовых ответах поздние `fetch` бросают `TypeError`, это классифицируется как `network`, и запросы уходят в обычный `pump` уже после выгрузки страницы. Данные остаются в WAL (D-11 это допускает), но досылка теряет смысл ровно в случае длинных ответов.

**Правка:** считать бюджет в `drain({ keepalive: true })`: сортировать записи по размеру тела и не отправлять keepalive сверх общего остатка 64 КиБ. Такие записи оставлять в WAL без лишних попыток.

### CR-09 [MINOR]: `order` в payload черновика зависит от текущего числа вопросов теста

**Файл:** `app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx:160-169`, `:316-321`; `question-draft-payload.ts:10-12`; `app/web/lib/drafts/question-draft-copy.ts:88-92`; `app/web/lib/drafts/question-draft-autosave.ts:348-355`

**Сценарий:**
- `draftOrder = testData.questions.length`. SWR перечитывает тест при фокусе окна (`revalidateOnFocus` по умолчанию). Если другой автор добавил или удалил вопрос, у `handleQuestionDraftChange` меняется идентичность, эффект `QuestionEditor` снова вызывает `onDraftChange(form)`, и `change()` получает payload с новым `order`. Сериализация другая, поэтому уходит лишний PATCH. Если в этот момент показан тост расхождения (R-01), `applyChange` обнуляет `divergedCopy` и перезаписывает копию устройства без действия пользователя.
- При открытии копия с тем же содержимым, но старым `order` не совпадает с `serverPayload`, пересчитанным с текущим числом вопросов. Это даёт ложный тост «Восстановлены правки…» и PATCH.

**Правка:** сравнивать и сериализовать payload черновика без `order` (подставлять `order` только при «Сохранить вопрос») или брать `order` из сохранённого черновика, а не из `testData.questions.length`.

### CR-10 [MINOR]: e2e LIFE-02 и перезагрузка LIFE-04 проходят без WAL и локальной копии

**Файл:** `e2e/tests/answer-durability.spec.ts:51-70`, `e2e/tests/question-draft-durability.spec.ts:86-116`

**Сценарий:** в LIFE-02 переход «Далее» досылает Q1 немедленно, а перезагрузка отправляет Q2 через `pagehide` и keepalive. Оба ответа оказываются на сервере, и «Отвечено: 2» пройдёт и без чтения WAL. Если сломать восстановление `pending` из WAL, тест останется зелёным. В перезагрузке LIFE-04 keepalive обходит `page.route` (записано в `06-08-SUMMARY.md`, отступление 3). Тест проверяет только «правка на сервере», путь локальной копии и тост восстановления закреплены одним ручным прогоном. Это пробел покрытия, не баг.

**Правка:** в LIFE-02 до перезагрузки прочитать WAL через `page.evaluate(() => localStorage.getItem(...))` и проверить, что оба ответа там с `pending`; отдельным тестом записать WAL с неподтверждённым ответом через `page.addInitScript` до открытия раннера и проверить, что ответ показан и уходит PATCH. Так проверяется путь WAL независимо от keepalive, который `page.route` не перехватывает. В LIFE-04 сделать постоянным прогон с заранее записанной копией (`page.addInitScript` + `localStorage.setItem`) с `baseLockVersion`, равной версии сервера и меньшей её, и проверять оба тоста.

### CR-11 [MINOR]: список вопросов модуля попытки зафиксирован при первом рендере

**Файл:** `app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts:86-104`, `app/web/components/tests/attempt-lifecycle/lifecycle.ts:160`, `:764`, `:772`; `app/web/components/tests/TestRunner.tsx:96`

**Сценарий:** `TestPageClient` отдаёт `TestRunner` уже загруженные вопросы, поэтому первый рендер корректен. Но модуль создаётся один раз через `useState`, а `knownQuestions` строится из `questions` первого рендера. Ключ `AttemptRunner` содержит только `test.id` и `me.id`. Если SWR перечитал тест (фокус окна, переподключение) и в нём появился новый вопрос, `TestRunner` его рисует, а `answer()` и `navigate()` молча отбрасывают его id. Ответ не попадает ни в WAL, ни на сервер, и вопрос остаётся «не отвеченным». До фазы 6 `TestRunner` читал `questions` на каждом рендере.

**Правка:** добавить в ключ `AttemptRunner` отпечаток списка вопросов (например, отсортированные id через `join`) или в `answer()`/`navigate()` не отбрасывать id, а показывать уведомление «Тест изменён, обновите страницу».

---

_Reviewed: 2026-10-04T20:05:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
