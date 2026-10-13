---
phase: 08-client-requests-runtime-and-decomposition
reviewed: 2026-10-05T13:23:28Z
depth: deep
files_reviewed: 62
files_reviewed_list:
  - app/server/src/config/export.ts
  - app/server/.env.example
  - app/server/src/services/storage/zip.ts
  - app/server/src/routes/tests/export-response.ts
  - app/server/src/routes/tests/admin/export.ts
  - app/server/src/services/question-content/export.ts
  - app/server/src/services/question-content/read.ts
  - app/server/src/services/question-content/bounded.ts
  - app/server/src/services/scored-attempt/facts.ts
  - app/server/src/routes/tests/public.ts
  - app/server/src/routes/tests/index.ts
  - app/server/src/routes/tests/admin/shared.ts
  - app/server/src/routes/tests/admin/tests-core.ts
  - app/server/src/routes/tests/admin/tests-by-slug.ts
  - app/server/src/routes/tests/admin/tests-delete.ts
  - app/server/src/routes/tests/admin/tests-list.ts
  - app/server/route-inventory.txt
  - app/server/src/routes/users/index.ts
  - app/server/src/routes/users/user-rows.ts
  - app/server/src/services/search/database-search.ts
  - app/server/src/middleware/validateParams.ts
  - app/web/lib/http/request.ts
  - app/web/lib/http/errors.ts
  - app/web/lib/http/download.ts
  - app/web/lib/http/swr.ts
  - app/web/lib/session/server.ts
  - app/web/lib/session/client.ts
  - app/web/lib/users/api.ts
  - app/web/lib/users/invite-form.ts
  - app/web/lib/users/profile-api.ts
  - app/web/lib/users/role-traits.ts
  - app/web/lib/auth/invite-flow.ts
  - app/web/lib/groups/api.ts
  - app/web/lib/groups/group-form.ts
  - app/web/lib/rbac/api.ts
  - app/web/lib/search/api.ts
  - app/web/lib/assets/api.ts
  - app/web/lib/tests/api.ts
  - app/web/lib/tests/admin-api.ts
  - app/web/lib/tests/question-preview.ts
  - app/web/hooks/use-object-url.ts
  - app/web/app/error.tsx
  - app/web/app/(internal)/(protected)/error.tsx
  - app/web/app/(internal)/invite/[token]/InviteClient.tsx
  - app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx
  - app/web/app/(internal)/(protected)/admin/attempts/[id]/page.tsx
  - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/layout.tsx
  - app/web/app/(internal)/(protected)/admin/tests/components/TopicFormDialog.tsx
  - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/TopicTestsClient.tsx
  - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  - app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx
  - app/web/app/(internal)/(protected)/admin/settings/rbac/page.tsx
  - app/web/app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx
  - app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
  - app/web/components/feedback/LoadErrorAlert.tsx
  - app/web/components/feedback/PageErrorState.tsx
  - app/web/components/groups/GroupSheet.tsx
  - app/web/components/users/UserProfileAssignmentsPage.tsx
  - app/web/components/users/dialogs/EditUserDialog.tsx
  - app/web/components/Search/SearchDialog.tsx
  - app/web/components/editor/plugins.tsx
  - app/web/components/editor/utils/mdx-converter.ts
findings:
  critical: 0
  warning: 14
  info: 5
  total: 19
status: issues_found
---

# Фаза 8: ревью кода

**Проверено:** 2026-10-05T13:23:28Z
**Глубина:** deep (кросс-файловая трассировка: модуль запросов → вызывающие; ZIP → маршруты → конфигурация; нарезка роутера → инвентарь маршрутов)
**Область:** `git diff 8622bfc..fa72f9e` в worktree `wt-phase-08` (ветка `gsd/phase-08`); пути ниже от корня worktree
**Статус:** issues_found

## Сводка

Шкала в теле: BLOCKER / MAJOR / MINOR / INFO. Во frontmatter для нижестоящих парсеров: `critical` = BLOCKER (0), `warning` = MAJOR + MINOR (5 + 9), `info` = INFO (5).

Что проверено и признано исправным:

- **Нарезка `routes/tests/admin/*`.** Порядок регистрации `/api/tests` в `app/server/route-inventory.txt` не менялся между `b8b054b` (снимок до нарезки) и `fa72f9e`: дифф инвентаря затрагивает только два новых маршрута `/api/users`. Построчное сравнение старого `routes/tests/index.ts` (`8622bfc`) с конкатенацией `admin/*.ts` + нового `index.ts` (без импортов) даёт расхождения только в намеренных местах: экспорт через `sendArchive`, чтение промптов попытки через `readQuestionTexts`, экспорт хелперов из `shared.ts`. Тела обработчиков и цепочки middleware перенесены без изменений, `router.use(...)` без пути в суброутерах нет — глобальный middleware не протекает на `/tests/public`.
- **`GET /api/users/:id`** зарегистрирован после `/profile`, `/avatar`, `/directory` и `GET /api/users` (`route-inventory.txt:11-20`), поэтому `validateUUID('id')` не перехватывает именованные пути.
- **Зона учителя в новых маршрутах пользователя.** `GET /api/users/:id` проверяет `canReadUser`, затем выбирает строку через `selectUserRows` с тем же `userZoneFilter` (ученики своих групп, `studentOnlyFilter`), что и список. `GET /api/users/by-login/:login` ищет только внутри зоны, для учителя «нет» и «вне зоны» неотличимы (403), перебор логинов вне зоны невозможен.
- **`streamZip`** (`app/server/src/services/storage/zip.ts`): окно опережающего чтения считается от события `entry` архиватора, которое приходит после того, как сжатый поток записи прошёл через `pipe` с backpressure; отмена (`signal`), ошибка приёмника, `finished(sink)` и ошибка архиватора сводятся в один `fail()` с `unpipe/abort/resume` и снятием слушателя. `streamToResponse` отличает обрыв клиента (abort → `res.destroy()`), ошибку до заголовков (снятие заголовков и `throw` в `errorHandler`) и ошибку после заголовков (лог и `destroy`). Утечек слушателей и висящих промисов не найдено.
- **Модуль запросов `lib/http/*`**: исходы `auth/network/http/malformed/aborted` различаются корректно, `AuthExpiredError` из `fetchWithSession` уходит в `auth`, повтор после refresh переиспользует строковое/`FormData` тело. Классификация ошибок попытки (`lib/tests/api.ts` → `lifecycle.ts`) сохранила прежнюю семантику: не-`AttemptRequestError` по-прежнему означает «повторить».
- **`useDebounce` на `lodash/debounce`**: `maxWait: maxWait ?? ms` совпадает с прежним поведением (lodash при `'maxWait' in options` с `undefined` ставит потолок `wait`).

Основные проблемы: экран приглашения (зависание и английские тексты сервера, нарушение UI-SPEC §1), неполная защита от утечки подсказки автодополнения, конфигурация ZIP по умолчанию под Vercel на целевом VPS, сохранение группы по устаревшему кэшу состава.

## Находки

### CR-01: Проверка приглашения зависает в «Загрузка…» при обрыве связи, 5xx выдаётся за недействительную ссылку

**Severity:** MAJOR
**Файл:** `app/web/app/(internal)/invite/[token]/InviteClient.tsx:22-34`, `:80-81`
**Описание:** эффект проверки вызывает `fetch` без `try/finally`. При сетевой ошибке промис отклоняется, `setLoading(false)` не выполняется, отклонение не обрабатывается. При ответе 500/502/503 `inviteValidationOutcome` возвращает `valid: false`, и экран показывает «Ссылка недействительна (404).». Плану 08-25 эти строки принадлежали (коммит `10f47fc` их переписал: `encodeURIComponent`, `inviteValidationOutcome`), поэтому запись в `deferred-items.md` «файл не входит в 08-25, не менялся» неверна: дефект остался в изменённом коде.
**Сценарий отказа:** ученик открывает ссылку при кратком обрыве сети или во время выкатки (`up -d --wait api web` на сервере даёт окно 502 от Caddy) → бесконечная «Загрузка…» либо «Ссылка недействительна (404)». Ученик считает приглашение испорченным и просит новое, хотя ссылка рабочая.
**Исправление:**
```tsx
useEffect(() => {
	let cancelled = false
	;(async () => {
		setLoading(true)
		try {
			const r = await fetch(`/api/auth/invites/validate/${encodeURIComponent(token)}`)
			if (r.status >= 500) { if (!cancelled) setLoadState('server-error'); return }
			const body: unknown = r.ok ? await r.json().catch(() => null) : null
			const outcome = inviteValidationOutcome(r.status, body)
			if (cancelled) return
			setFirstName(outcome.firstName); setLastName(outcome.lastName); setLogin(outcome.login); setValid(outcome.valid)
		} catch {
			if (!cancelled) setLoadState('network-error')
		} finally {
			if (!cancelled) setLoading(false)
		}
	})()
	return () => { cancelled = true }
}, [token])
```
Для `network-error` и `server-error` показывать текст «Нет связи с сервером…» / «Ошибка сервера…» с кнопкой «Повторить», а «Ссылка недействительна» — только при 404.

### CR-02: Принятие приглашения показывает английские тексты сервера, не обрабатывает обрыв связи и допускает двойную отправку

**Severity:** MAJOR
**Файл:** `app/web/lib/auth/invite-flow.ts:34-44`, `app/web/app/(internal)/invite/[token]/InviteClient.tsx:36-78`, `:125`; сервер `app/server/src/routes/auth/invites.ts:58-63`, `:240-256`
**Описание:** `inviteAcceptErrorText` возвращает `fieldErrors[...][0]` и `record.error` как есть, без проверки на кириллицу. Сервер на `/accept` отвечает только английскими строками: `Invalid token` (404), `Login already taken` (409), `Bad request` с zod-сообщениями `Login must be 3–32 chars (a–z, 0–9, . _ -)` и `Password must be at least 6 chars` (400). Это прямо нарушает UI-SPEC §1 (строка 247: «Английский текст сервера не показывается»). Тесты `invite-flow.test.ts:47-63` построены на русских фикстурах (`'Логин занят'`, `'Текст'`), которых сервер никогда не отдаёт, и поэтому дефект не ловят. Кроме того, у `accept()` нет `try` (обрыв связи даёт необработанное отклонение без сообщения) и нет флага отправки: кнопка «Сохранить» остаётся активной во время запроса.
**Сценарий отказа:** (1) ученик выбирает занятый логин и видит `Login already taken`; вводит пароль из 5 символов и видит `Password must be at least 6 chars`. (2) Двойной клик: первый запрос активирует учётную запись, второй получает 404 `Invalid token`. Если второй ответ приходит позже, сообщение «Готово!…» заменяется на `Invalid token`, хотя вход уже идёт.
**Исправление:** в `invite-flow.ts` пропускать только кириллические тексты (`readApiError` из `lib/http/errors.ts`) и сопоставить статусы: 404 → «Ссылка недействительна или уже использована.», 409 → «Такой логин уже занят, попробуйте другой.», 400 → «Проверьте логин (3–32 символа: a–z, 0–9, . _ -) и пароль (не короче 6 символов).». Это те тексты, что раньше стояли в недостижимых ветках старого `InviteClient`. В `accept()` добавить `submitting` (кнопка `disabled`, ранний `return`) и `try/catch` с сообщением о связи. Тесты перевести на реальные английские тела сервера. Вариант на сервере — русские сообщения в `AcceptSchema` и ответах `/accept`.

### CR-03: Переключатель Markdown запекает подсказку автодополнения в текст вопроса

**Severity:** MAJOR
**Файл:** `app/web/components/editor/plugins.tsx:351-367`, `app/web/components/editor/plugins/actions/markdown-toggle-plugin.tsx:35-42`
**Описание:** `aa60755` добавил трансформер `AUTOCOMPLETE` только в `MDX_TRANSFORMERS` (`utils/mdx-converter.ts:28`). `MarkdownTogglePlugin` получает свой список без `AUTOCOMPLETE`. `AutocompleteNode extends TextNode` (`nodes/autocomplete-node.tsx:13`), поэтому `$convertToMarkdownString` выводит текст подсказки как обычный текст. Редактор вопроса использует `preset="full"` (`QuestionEditor.tsx:179,189`), в нём включены и `AutocompletePlugin` (всегда), и `MarkdownToggle`. Нажатие кнопки не меняет выделение Lexical, поэтому видимая подсказка в момент клика остаётся в дереве.
**Сценарий отказа:** автор набирает слово, появляется серая подсказка, автор жмёт «Convert from markdown». Подсказка становится частью текста в блоке `markdown`, при обратном переключении превращается в обычный `TextNode` и уходит в `onMdxChange`, то есть сохраняется в `prompt.md`. Именно этот класс дефекта `aa60755` объявил закрытым.
**Исправление:** вынести один список, например `TOGGLE_TRANSFORMERS = [TABLE, HR, IMAGE_HTML, IMAGE, AUTOCOMPLETE, EMOJI, TWEET, CHECK_LIST, ...]`, и передавать его в `MarkdownTogglePlugin` (и, для единообразия, в `MarkdownShortcutPlugin`). Можно надёжнее: в `handleMarkdownToggle` перед `$convertToMarkdownString` удалить все `AutocompleteNode` (`$nodesOfType(AutocompleteNode).forEach(n => n.remove())`). Добавить тест рядом с `mdx-golden.test.ts` для пути переключателя.

### CR-04: Лимит ZIP по умолчанию рассчитан на Vercel, а прод уже на VPS без ключа `EXPORT_ZIP_MAX_BYTES`

**Severity:** MAJOR (эксплуатационная)
**Файл:** `app/server/src/config/export.ts:3-6`, `app/server/.env.example:66-69`, `app/server/src/services/question-content/export.ts:17`, `:249`
**Описание:** без ключа сервер работает в режиме буфера с потолком 4 400 000 байт (лимит ответа функции Vercel). Профиль сервера (`~/.claude/servers/bio-exam-plan.md:69`, `bio-exam.md:34`) перечисляет ключи `api.env` явно, `EXPORT_ZIP_MAX_BYTES` среди них нет, а `bio-exam-plan.md:102` всё ещё описывает старую константу `ZIP_RESPONSE_LIMIT_BYTES`. CONTEXT (строки 26, 290-294) рассчитывал, что «в Milestone 2 Compose задаёт `0`», но Compose на сервере уже работает, и выкатка фазы 8 этот ключ не добавит. По описи хранилища (2691 объект, 37 МБ на 7 тем, в среднем больше 5 МБ на тему) экспорт тем с картинками превысит потолок. Отдельно: текст 413 «экспортируйте тесты по отдельности» отдаётся и при экспорте одного теста (`archiveToBuffer` общий), где совет бессмыслен.
**Сценарий отказа:** после выкатки фазы 8 на `bio-exam.ru` администратор экспортирует тему с изображениями и получает 413 «Архив слишком большой для выгрузки…», хотя потоковая отдача уже реализована и проверена.
**Исправление:** добавить `EXPORT_ZIP_MAX_BYTES=0` в `/opt/bio-exam/deploy/api.env` (делает пользователь, скилл `server-deploy`) и обновить профиль сервера. В `.env.example` поменять комментарий: целевая платформа — VPS, `0`. Рассмотреть смену значения по умолчанию на поток. Для одного теста отдавать отдельный текст 413, например «Архив теста слишком большой для выгрузки».

### CR-05: Форма группы сохраняет состав из устаревшего кэша и затирает правки при повторной валидации

**Severity:** MAJOR
**Файл:** `app/web/components/groups/GroupSheet.tsx:122-127`, `:153-163`, `:365`; `app/web/app/(internal)/(protected)/admin/groups/GroupsClient.tsx:162`
**Описание:** после сохранения `onSaved` вызывает только `mutate()` списка; ключ `groupsKeys.detail(id)` не инвалидируется. При повторном открытии той же группы SWR сразу отдаёт кэш со старым составом, `isLoading` при этом `false` (он истинен только без данных). Значит, `groupSaveDisabled` пропускает сохранение, хотя план 08-13 обещал «сохранение группы выключено до загрузки состава». Если повторная валидация упала, `error` задан, но `groupData` определён, `membersFailed === false` — кнопка остаётся активной на устаревшем составе. Эффект `[groupData, zoneAll]` без признака «засеяно в этом открытии» перезаписывает `selectedIds` при каждом приходе новых данных и стирает уже сделанные отметки (тот же класс, что 08-19 закрыл для типов вопросов и правил баллов через «seed once per key»).
**Сценарий отказа:** администратор добавляет ученика X в группу A и сохраняет, затем снова открывает A, меняет только название и быстро жмёт «Сохранить» (или повторная валидация не прошла из-за сети). PATCH уходит со старым `memberIds` без X, и X молча удаляется из группы вместе с доступом к групповым назначениям.
**Исправление:** в `GroupsClient` после сохранения инвалидировать и деталь: `onSaved={(id) => { mutate(); globalMutate(groupsKeys.detail(id)) }}`, или в `GroupSheet` использовать `revalidateOnMount: true` с `keepPreviousData: false` и ждать `isValidating === false` при первом открытии. Блокировать сохранение, пока не пришёл свежий ответ в этом открытии (`seededFor === group.id`), и засеивать `selectedIds` один раз на открытие.

### CR-06: `PROMPT_READ_CONCURRENCY = 123` фактически снимает ограничение (заметка 08-09)

**Severity:** MINOR
**Файл:** `app/server/src/services/question-content/bounded.ts:1`, `read.ts:85`, `:92`, `scored-attempt/facts.ts:92-94`; адаптер `app/server/src/services/storage/adapters/local.ts:183`
**Описание:** потолок выбран на бенчмарке с искусственной задержкой 120 мс на чтение (`08-BENCHMARKS.md:160`), то есть под сетевое хранилище (Supabase), которое больше не целевое. Правило выбора («первое значение с медианой ≤ 1,2 × до») при такой задержке гарантированно приводит к числу вопросов крупнейшего теста. Потолок действует на один запрос, а не на процесс. Чтение администратора выросло с 5 до 123. Локальный адаптер читает через `fs.promises.readFile`, это операции пула libuv (4 потока): реальная параллельность диска остаётся 4, а 123 задаёт только длину очереди и число одновременно открытых дескрипторов. EMFILE маловероятен (Node поднимает мягкий `nofile` до жёсткого при старте, у Docker жёсткий лимит высокий), но очередь из сотен `readFile` вытесняет из пула `zlib` архиватора (deflate экспорта) и `dns.lookup`.
**Сценарий отказа:** 30 учеников одновременно открывают тест на 123 вопроса → около 3700 операций `readFile` в очереди пула; параллельный экспорт темы ждёт `zlib` за ними. Задержка растёт, но запросы не падают.
**Исправление:** заменить на 16–32 или сделать потолок свойством адаптера (`local` — 16, сетевой — 64+). Перемерить бенч при 1–5 мс на чтение. В контейнере `api` проверить `ulimit -n` (`docker compose exec api sh -c 'ulimit -n'`).

### CR-07: Параллельные категории поиска занимают до 5 соединений пула на вызов без выигрыша по времени

**Severity:** MINOR
**Файл:** `app/server/src/services/search/database-search.ts:449-466`
**Описание:** `Promise.all` по пяти категориям одновременно берёт до 5 соединений `pgPool`. По `08-BENCHMARKS.md:100` выигрыш не больше 3 мс, потому что время определяет самая медленная категория (около 100 мс). На сервере `PG_POOL_MAX=10` (`bio-exam-plan.md:69`). Клиент отменяет устаревший поиск (`SearchDialog`), но запросы на сервере продолжают выполняться.
**Сценарий отказа:** два администратора печатают в глобальном поиске → 10 соединений заняты примерно на 100 мс за каждое нажатие после задержки; `PATCH answers` и `submit` учеников в это время ждут соединение.
**Исправление:** вернуть последовательное выполнение или ограничить параллельность двумя. Для отменённых клиентом запросов передавать `AbortSignal` из `req.on('close')` и вызывать `pg_cancel_backend` либо задать `statement_timeout` для поиска.

### CR-08: Занятый slug темы даёт общую «Ошибка сохранения» (заметка 08-16)

**Severity:** MINOR
**Файл:** `app/web/app/(internal)/(protected)/admin/tests/components/TopicFormDialog.tsx:170-174`; сервер `app/server/src/lib/constants.ts:39`, `routes/tests/admin/topics.ts:119`, `services/question-content/relocate.ts:379`, `:425`
**Описание:** сервер отвечает 409 `Topic with this slug already exists`, `readApiError` отбрасывает строку без кириллицы, и `failureMessage` берёт запасной текст. До фазы 8 автор видел английскую, но понятную причину; теперь причины не видно совсем. Тот же эффект у всех английских 4xx, у которых вызывающий не задал своего соответствия статусу.
**Сценарий отказа:** администратор создаёт тему с адресом уже существующей и видит «Ошибка сохранения», не понимая, что поправить.
**Исправление:** в `TopicFormDialog` при `!saved.ok && saved.kind === 'http' && saved.status === 409` показывать `setSlugError('Тема с таким адресом уже существует')` у поля slug. Либо перевести `ERROR_MESSAGES.TOPIC_SLUG_EXISTS` на русский (проверить серверные тесты, которые сравнивают текст).

### CR-09: В `routes/users/index.ts` рядом русский и английский «пользователь не найден» (заметка 08-06)

**Severity:** MINOR
**Файл:** `app/server/src/routes/users/index.ts:137`, `:147`, `:165` (рус.) против `:187`, `:268`, `:308` (`ERROR_MESSAGES.USER_NOT_FOUND` = `User not found`)
**Описание:** новые GET-маршруты отвечают по-русски, а PATCH `/:id`, PATCH `/:id/group` и DELETE `/:id` в том же файле — по-английски. На клиенте английский отсекается, и пользователь видит «Запрос отклонён (код 404).» или запасной текст вызывающего вместо «Пользователь не найден».
**Сценарий отказа:** администратор правит пользователя, которого параллельно удалили, и получает безличную ошибку вместо понятной причины.
**Исправление:** одна константа на файл (или русская `ERROR_MESSAGES.USER_NOT_FOUND`, проверив серверные тесты на текст), применённая во всех пяти местах.

### CR-10: Ошибка перезагрузки списка пунктов меню после действия не видна, список остаётся в оптимистичном состоянии

**Severity:** MINOR
**Файл:** `app/web/app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx:188-200`, `:219-228`, `:265`, `:277`, `:296`
**Описание:** после первой успешной загрузки `loadedRef.current === true`, и неудачный `loadItems()` молча выходит: нет ни `setLoadError`, ни тоста. В `handleDragEnd` при отказе записи порядок откатывается через `loadItems()`. Если и перезагрузка упала, на экране остаётся отвергнутый сервером порядок. После успешного сохранения или переключения пользователь видит «Пункт обновлен», а список не обновился.
**Сценарий отказа:** обрыв связи во время перетаскивания: тост «Ошибка обновления порядка», а список показывает новый порядок, которого на сервере нет. Следующее перетаскивание отправит порядок, собранный из этого неверного состояния.
**Исправление:** при `loadedRef.current` и неудачной перезагрузке показывать тост «Не удалось обновить список. Обновите страницу.» (или блок `LoadErrorAlert` над списком). В `handleDragEnd` до перезагрузки откатывать к копии `items`, снятой перед оптимистичным обновлением.

### CR-11: 401 при недоступном refresh показывается как «Запрос отклонён (код 401).»

**Severity:** MINOR
**Файл:** `app/web/lib/session/client.ts:104-105`, `app/web/lib/http/errors.ts:26-33`
**Описание:** если refresh не удался из-за связи (`unavailable`), `fetchWithSession` возвращает исходный 401, и модуль запросов классифицирует его как `http` 401. Текст «Запрос отклонён (код 401).» звучит как отказ в правах, а на деле это временная проблема связи с сессией; блоки `LoadErrorAlert` при этом показывают «Повторить» (верно), но причина вводит в заблуждение.
**Сценарий отказа:** короткий обрыв на `/api/auth/refresh` в момент истечения access-токена → ученик или учитель видит «Запрос отклонён (код 401).» и думает, что у него отобрали доступ.
**Исправление:** в `failureMessage` для `kind === 'http' && status === 401` возвращать `NETWORK_MESSAGE` или «Не удалось подтвердить сессию. Повторите попытку.»; добавить случай в `errors.test.ts`.

### CR-12: Ленивая таблица эмодзи: шорткаты молча перестают работать, загрузка вопроса с `:x:` задерживается

**Severity:** MINOR
**Файл:** `app/web/components/editor/transformers/markdown-emoji-transformer.ts:13`, `app/web/components/editor/plugins.tsx:281`, `:358`, `app/web/components/editor/utils/mdx-converter.ts:43-52`, `app/web/components/editor/editor.tsx:42-56`
**Описание:** (1) `EMOJI.replace` без загруженной таблицы ничего не делает. Таблицу грузят только пикер (при открытии меню `:`) и `mdxToEditorState`. `MarkdownShortcutPlugin` и `MarkdownTogglePlugin` с `EMOJI` её не грузят: вставка текста с `:smile:` или обратное переключение из markdown до первого открытия пикера оставляют алиас текстом, хотя до фазы он превращался в эмодзи. (2) `EMOJI_ALIAS_PATTERN = /:[a-z0-9_]+:/` совпадает и с не-эмодзи, например «соотношение 1:2:3» (`:2:`). Тогда начальное содержимое ждёт загрузки чанка, а редактор всё это время пуст и `initialized === false`. Набранное в это окно не уходит в `onMdxChange` и затирается конвертацией.
**Сценарий отказа:** открыть вопрос с «1:2:3» на медленной сети и начать печатать до загрузки чанка — введённое пропадает. Вставить `:warning:` в новый вопрос — остаётся текстом.
**Исправление:** в `MarkdownShortcutPlugin`/`MarkdownTogglePlugin` при совпадении алиаса без таблицы запускать `loadEmojiTable()` и повторять трансформацию, или загружать таблицу при монтировании группы эмодзи. Сузить триггер ожидания: ждать загрузку, только если алиас есть в небольшом встроенном списке имён, или делать редактор `editable=false` до `initialized`.

### CR-13: `saveBlob` отзывает blob-URL синхронно сразу после `click()`

**Severity:** MINOR
**Файл:** `app/web/lib/http/download.ts:4-13`
**Описание:** `URL.revokeObjectURL(url)` вызывается в том же такте, что и `link.click()`. Chromium и Firefox успевают начать загрузку, у Safari (WebKit) известны срывы скачивания при немедленном отзыве (`WebKitBlobResource error 1`). Раньше код делал так же, но теперь это общий помощник для всех скачиваний ZIP.
**Сценарий отказа:** администратор на Safari экспортирует тест: тост «Тест экспортирован», а файла нет.
**Исправление:** `setTimeout(() => URL.revokeObjectURL(url), 0)` (или 1–10 с), проверить экспорт в Safari вручную.

### CR-14: После смены логина в профиле пользователя страница показывает «не найден»

**Severity:** MINOR
**Файл:** `app/web/components/users/dialogs/EditUserDialog.tsx:277-285`, `app/web/components/users/UserProfileAssignmentsPage.tsx:163-169`, `:865-873`
**Описание:** страница загружает пользователя по ключу `usersKeys.byLogin(login)` из URL. После сохранения с новым логином диалог инвалидирует ключ старого логина, тот отвечает 404, и страница переходит в состояние «пользователь не найден». URL на новый логин не меняется.
**Сценарий отказа:** администратор исправляет опечатку в логине ученика на его странице и сразу видит «не найден», хотя сохранение прошло.
**Исправление:** передавать в `onSaved` новый логин и при его смене делать `router.replace(`/profile/${encodeURIComponent(newLogin)}`)` до инвалидации.

### CR-15: Поиск остаётся в «Ищем…» при исходе `auth`

**Severity:** INFO
**Файл:** `app/web/components/Search/SearchDialog.tsx:173-185`
**Описание:** для `auth`/`aborted` `runSearch` выходит без `setLoading(false)`. Для `aborted` это недостижимо (контроллер уже сменён), для `auth` идёт переход на `/login`, но если путь входа не уводит со страницы (`isAuthPage`), индикатор висит.
**Исправление:** для `auth` сбрасывать `setLoading(false)` перед `return`.

### CR-16: Мёртвый код после 08-23 и дублирование лимита ZIP

**Severity:** INFO
**Файл:** `app/web/lib/session/object-access.ts` (+ `object-access.test.ts`) — не импортируется нигде, кроме своего теста; `app/web/lib/groups/group-form.ts:30-40` (`candidatesSource`, `candidatesHint`) — только в `group-form.test.ts`; `app/server/src/services/question-content/export.ts:15`, `:255-276` (`ZIP_RESPONSE_LIMIT_BYTES`, `buildTestArchive`, `buildTopicArchive`) — маршруты их больше не вызывают, а `4_400_000` теперь задан в двух местах (`config/export.ts:3` и `export.ts:15`)
**Исправление:** удалить вместе с тестами или перевести тесты на действующие функции; оставить одну константу лимита в `config/export.ts`.

### CR-17: Дубли слоёв запросов и обходы доменных ключей (остатки 08-23)

**Severity:** INFO
**Файл:** `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts:81-84`, `:111` — копия `parseQuestionTypes`/`questionTypesFetcher` из `lib/tests/admin-api.ts:139-153` (оба кладут в один ключ SWR одинаковую форму, поведение не расходится); `app/web/lib/users/role-traits.ts:18`, `:48-53` — строка `'/api/rbac/roles'` и свой фетчер вместо `rbacKeys.roles()`/`rbacRolesFetcher` (кэш общий с `admin/settings/rbac/page.tsx`, формы тел совпадают, сбоя нет); `app/web/lib/tests/admin-api.ts:11`, `:19` — тип `AdminTestListItem` из `@/app/(internal)/(protected)/admin/tests/types` (слой `lib` зависит от `app`); `app/web/components/users/UserProfileAssignmentsPage.tsx:869-872` — `onSaved` повторяет инвалидацию `byLogin` и списка, которую `EditUserDialog.tsx:279-283` уже сделал (два лишних запроса)
**Исправление:** один `questionTypesFetcher` из `admin-api`; `role-traits` на `rbacKeys.roles()`; перенести `Test` в `lib/tests/types`; убрать инвалидацию из `onSaved` либо из диалога.

### CR-18: Охранный тест web-запросов не видит массив-ключ SWR за тернарным оператором

**Severity:** INFO
**Файл:** `scripts/web-requests-guards.test.mjs` (правило «массив первым аргументом useSWR»); существующее нарушение `app/web/components/progress/StudentProgressSection.tsx:27-30`
**Описание:** шаблон `useSWR\s*(<…>)?\s*\(\s*\[` ловит только литерал массива сразу после скобки. `useSWR(cond ? ['progress-my-attempts', ids] : null, …)` проходит. В коде такое место уже есть; там же нет `LoadErrorAlert` и повтора («Не удалось загрузить попытки»).
**Исправление:** проверять первый аргумент целиком: от `useSWR(` до первой запятой верхнего уровня искать `[` (или разбирать через `oxc-parser`/TS AST). Перевести `StudentProgressSection` на строковый ключ и `LoadErrorAlert`.

### CR-19: `reinviteErrorText` гоняет тело через `JSON.stringify` → `JSON.parse` и может показать `HTTP 409`

**Severity:** INFO
**Файл:** `app/web/components/users/dialogs/ReinviteUserDialog.tsx:26-31`, `app/web/lib/users/invite-form.ts:59-63`
**Описание:** диалог сериализует `failure.body` в строку только затем, чтобы функция разобрала её обратно. При 409 без тела пользователь видит латинское `HTTP 409`. Сервер для 409 сейчас отдаёт русские тексты (`invites.ts:155`, `:158`), поэтому вживую ветка редкая.
**Исправление:** сигнатура `reinviteErrorText({ status, body })`, для пустого тела русский запасной текст.

## Вердикты по заметкам ведущей сессии

| Заметка | Вердикт | Где |
| --- | --- | --- |
| 08-09: `PROMPT_READ_CONCURRENCY = 123` | **Подтверждено, MINOR.** Это не ограничение, а число вопросов крупнейшего теста, подобранное под задержку сетевого хранилища 120 мс. На локальном диске параллельность фактически 4 (пул libuv), 123 задаёт только очередь и дескрипторы на запрос; при одновременных пользователях общей границы нет. Отказов не будет (EMFILE маловероятен), но очередь вытесняет `zlib` экспорта. Нужен перемер при 1–5 мс и потолок 16–32 или потолок от адаптера. | CR-06 |
| 08-06: `USER_NOT_FOUND` рус./англ. | **Подтверждено, MINOR.** Три 404 в том же файле (`:187`, `:268`, `:308`) остаются английскими и на клиенте превращаются в безличный текст. | CR-09 |
| 08-07: `MarkdownTogglePlugin` без `AUTOCOMPLETE` | **Подтверждено, MAJOR.** Подсказка не просто видна в режиме markdown, а становится текстом и сохраняется в вопрос после обратного переключения. Редактор вопроса использует `preset="full"`, переключатель там включён. | CR-03 |
| 08-16: занятый slug → «Ошибка сохранения» | **Подтверждено, MINOR.** 409 с английским текстом отсекается проверкой кириллицы; нужна привязка 409 к полю slug или русский текст на сервере. | CR-08 |
| 08-23: `object-access.ts` и тест | **Подтверждено, INFO.** Импортов вне собственного теста нет. | CR-16 |
| 08-23: `candidatesSource`/`candidatesHint` | **Подтверждено, INFO.** Используются только в тесте; `GroupSheet` строит ключ через `groupsKeys.candidates`. | CR-16 |
| 08-23: копия `parseQuestionTypes`/`questionTypesFetcher` | **Подтверждено, INFO.** Поведение совпадает (общий ключ, одинаковая проверка), дефекта нет. | CR-17 |
| 08-23: `reinviteErrorText` на тексте вместо `body` | **Подтверждено, INFO.** Работает, но с лишней сериализацией и латинским `HTTP 409` при пустом теле. | CR-19 |
| 08-23: дубль инвалидации в `UserProfileAssignmentsPage` | **Подтверждено, INFO.** Два лишних GET; отдельно найден связанный MINOR про смену логина. | CR-17, CR-14 |
| 08-23: `role-traits.ts` не на `rbacKeys.roles()` | **Подтверждено, INFO.** Кэш общий с экраном RBAC, формы тел одинаковые, сбоя нет. | CR-17 |
| 08-23: `AdminTestListItem` импортирует тип из `app/` | **Подтверждено, INFO.** Зависимость `lib → app`. | CR-17 |
| 08-23: охранный тест не видит массив-ключ за тернарником | **Подтверждено, INFO.** Нарушение уже есть в `StudentProgressSection.tsx:28`. | CR-18 |
| 08-25: `InviteClient.tsx:32` — «Загрузка» при обрыве | **Подтверждено, MAJOR, и шире заметки.** Кроме зависания: 5xx выдаётся за «Ссылка недействительна (404)», принятие показывает английские тексты сервера и zod (нарушение UI-SPEC §1), без `try` и без защиты от двойной отправки. Утверждение `deferred-items.md`, что файл не менялся в 08-25, неверно: `10f47fc` переписал эти строки. | CR-01, CR-02 |

---

_Проверено: 2026-10-05T13:23:28Z_
_Ревьюер: Claude (gsd-code-reviewer)_
_Глубина: deep_
