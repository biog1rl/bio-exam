# Phase 6: Draft durability - Pattern Map

**Mapped:** 2026-10-04 (ветка `dev`, HEAD b861479, фаза 5 исполнена)
**Files analyzed:** 22 новых и меняемых
**Analogs found:** 20 / 22 (без аналога: примитив очереди с повторами, `.agents/skills`)

Все пути ниже отслеживаются git (`git ls-files`). Номера строк сняты с HEAD b861479.

## Сверка имён из 06-CONTEXT с кодом (фаза 5 исполнена)

| Имя из CONTEXT | Факт | Расхождение |
|---|---|---|
| `client-attempt-id.ts` | `app/web/components/tests/client-attempt-id.ts` (+ `.test.ts`): `clientAttemptIdKey`, `resolveClientAttemptId(storage, key, sessionId, createId)`, `forgetClientAttemptId`, тип `ClientAttemptStorage` | нет; ключ `test-client-attempt-${testId}-${userId}` |
| `attempt-submit-flow.ts` | `app/web/components/tests/attempt-submit-flow.ts` (+ `.test.ts`): `classifySubmitFailure`, `classifyStartFailure`, `isClientExpired`, `storageKeysToClear`, `bannerFor`, `blocksInteraction`, `SUBMIT_FLOW_TEXT`, типы `AttemptBanner`, `AttemptStorageEvent`, `AttemptStorageKey` | события очистки: `success`, `already-submitted`, `time-expired`, `not-found`, `start-not-assigned`, `submit-not-assigned`, `retry`, `session-replaced` (D-04 их переиспользует) |
| `storageKeysToClear` | `attempt-submit-flow.ts:80-82`, таблица `STORAGE_KEYS_BY_EVENT` `:64-73`, ключи `'session' \| 'wal' \| 'frozen' \| 'clientAttemptId'` | нет |
| `AttemptRequestError` | **`app/web/lib/tests/api.ts:31-43`** (`status`, `code`, `attemptId`), не в `attempt-submit-flow.ts`; `attempt-submit-flow.ts:3` импортирует его из `@/lib/tests/api` | модуль попытки в `components/tests` или `lib/tests` зависит от `api.ts` через этот класс |
| `ATTEMPT_GRACE_PERIOD_MINUTES` | `packages/exam-core/src/attempt-result.ts:9` (= 2), экспорт `index.ts:37`; сервер `services/attempt-sessions/sessions.ts:2,55`; web `attempt-submit-flow.ts:1,95` | нет |
| `services/attempt-sessions` | `app/server/src/services/attempt-sessions/{access,index,sessions,submit}.ts` | фаза 6 сервер не трогает |
| `SaveDraftAnswerSchema` | **`app/server/src/routes/tests/public.ts:548-562`**, не `:617-632` | сдвиг строк; схема локальная, не в `exam-core`, D-14 переносит её |
| `SessionInfo` | `app/web/lib/tests/types.ts:76-82` (не `:70-76`); поля `sessionId`, `startedAt`, `draftAnswers?`, `draftLastQuestionId?`, `draftTelemetry?` | сдвиг |
| `saveAnswer`, `saveSessionTelemetry` | `app/web/lib/tests/api.ts:~140-165`; статус ответа не читают, `Promise<void>` | совпадает с D-14 |
| `fetchAttemptJson` | `api.ts:60-76` (бросает `AttemptRequestError`); `fetchJson` `:11-24` бросает `Error(text)` | образец исхода для функции сохранения |
| `use-debounce` | `TestRunner.tsx:8,390-425` (`useDebouncedCallback`, 600 мс) | остаётся до плана 4 |
| `TestRunner.tsx` (1035 строк) | ключи `:173-175` и `:176`; `clearAttemptStorage` `:178-185`; `replaceTelemetry` `:192-213`; `hydrateFromServerSession` `:215-233` (`:218` пишет весь `SessionInfo` в `sessionKey`); `replaceWithNewSession` `:235-246`; старт `:252-329`; чтение WAL `:331-368`; WAL внутри дебаунса `:390-425`; `goToQuestion` `:483-495`; `doSubmit` `:506-587`; автосдача `:589-608`; видимость `:610-642`; предзагрузка `:644-661`; визит `:663-671`; `handleRetake` `:699-737`; `interactionDisabled` `:746-753`; панель навигации `:904-959`; `useCountdown` `:109-127`; `userId` с `'anonymous'` `:141` | номера из CONTEXT устарели, использовать эти |
| `use-debounce`, `saveAnswer` и т.п. в `TestRunner` | импорты `:8`, `:16` | уходят в модуль |
| `e2e` `test.fail()` | в `e2e/` нет ни одного `test.fail` и ни одного `page.route` | D-25 вводит их впервые; образца в репозитории нет |
| `.agents/skills` | каталога нет, в git нет ни одного SKILL.md | образец только внешний (см. «Навыки») |

## File Classification

| Новый / меняемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|---|---|---|---|---|
| `app/web/lib/drafts/save-queue.ts` (+ `.test.ts`) | service (чистый модуль, шов часов) | event-driven, request-response | `app/web/lib/session/keep-alive.ts` | role-match (повторы с паузами и `inFlight` там же) |
| `app/web/lib/tests/attempt-lifecycle/*.ts` или `components/tests/attempt-lifecycle/*.ts` (+ тесты) | service/store (фазы × события) | event-driven | `keep-alive.ts` (швы) + `attempt-submit-flow.ts` (исходы) + `client-attempt-id.ts` (хранилище) | role-match |
| `useAttemptLifecycle` (тонкий хук) | hook | pub-sub (`useSyncExternalStore`) | `components/providers/AuthProvider.tsx` (получение `me`) | partial |
| `app/web/components/tests/TestRunner.tsx` | component | request-response, event-driven | сам файл | exact (рефакторинг) |
| `app/web/components/tests/telemetry.ts` | utility | transform | сам файл + `telemetry.test.ts` | exact |
| `app/web/components/tests/client-attempt-id.ts`, `attempt-submit-flow.ts` | utility | transform | сами файлы | exact (вызываются модулем) |
| `app/web/lib/tests/api.ts` | service (HTTP) | request-response | `fetchAttemptJson`, `startTestSession` в нём | exact |
| `app/web/lib/tests/types.ts` | model | transform | `SessionInfo` в нём | exact |
| `packages/exam-core/src/*` + `index.ts` + `scripts/check-exam-core-dist.mjs` | model/schema | transform | `attempt-result.ts` (`SubmitAttemptRequestSchema`, `:163`), `telemetry.ts` | exact |
| `app/server/src/routes/tests/public.ts` (импорт схемы вместо локальной) | route | request-response | `:548-613` | exact |
| `.../questions/QuestionEditorPageClient.tsx` | component | CRUD, event-driven | сам файл | exact (рефакторинг) |
| `.../tests/components/QuestionEditor.tsx` | component | event-driven | сам файл | exact |
| модуль автосохранения черновика вопроса (`lib/drafts/question-draft-autosave.ts`) | service | CRUD | `save-queue.ts` (новый) + `QuestionEditorPageClient.tsx:234-293` | role-match |
| локальная копия черновика вопроса | utility | file-I/O (`localStorage`) | `client-attempt-id.ts` (`readStoredClientAttempt`, безопасная запись) | role-match |
| `app/web/store/unsavedChanges.store.ts` | store | pub-sub | сам файл (zustand) | exact |
| `app/web/components/Buttons/BackButton.tsx` | component | request-response | сам файл | exact |
| маршруты `question-drafts` (`routes/tests/index.ts:1075-1290`) | route | CRUD | не меняются; контракт для клиента | n/a |
| `e2e/tests/take-test.spec.ts`, `authoring.spec.ts` + `e2e/fixtures/exam.ts` | test (e2e) | request-response | `takeTest`, `openNewQuestion`, `saveQuestion` | role-match |
| охранный тест фазы 6 (`scripts/*.test.mjs`) | test | batch | `scripts/attempt-integrity-guards.test.mjs` | exact |
| `scripts/check-docs-commands.mjs` (`DOC_FILES`) | config/script | batch | сам файл `:23` | exact |
| `.agents/skills/bio-exam-{web,api,data}/SKILL.md`, `AGENTS.md` | config/doc | n/a | внешний `~/.claude/skills/writing-for-agents`; таблица `AGENTS.md` «Routing» | no analog |

## Pattern Assignments

### Примитив очереди сохранения и модуль попытки (`lib/drafts/`, `attempt-lifecycle/`)

**Analog:** `app/web/lib/session/keep-alive.ts` (130 строк) и `keep-alive.test.ts` (309 строк).

**Шов-интерфейсы и фабрика** (`keep-alive.ts:8-37`): типы шва экспортируются, дефолты часов подставляются в деструктуризации.
```typescript
export type KeepAliveDocument = {
	readonly visibilityState: string
	addEventListener(type: 'visibilitychange', listener: () => void): void
	removeEventListener(type: 'visibilitychange', listener: () => void): void
}
export type KeepAliveOptions = {
	refresh: () => Promise<RefreshOutcome>
	...
	doc: KeepAliveDocument
	now?: () => number
	setTimer?: (callback: () => void, ms: number) => unknown
	clearTimer?: (handle: unknown) => void
}
export function createKeepAlive({
	...,
	now = () => Date.now(),
	setTimer = (callback, ms) => setTimeout(callback, ms),
	clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: KeepAliveOptions): KeepAlive {
```

**Состояние в замыкании, `stopped`-флаг, один запрос в полёте** (`:38-42`, `:81-105`): `inFlight`, `stopped`, `clear()` перед `arm()`, исход API превращается в событие (`ok`/`rejected`/иное), исключение API приравнено к `unavailable`.
```typescript
async function run(): Promise<void> {
	if (inFlight || stopped) return
	inFlight = true
	clear(); dueAt = null
	let outcome: RefreshOutcome
	try { outcome = await refresh() } catch { outcome = { kind: 'unavailable' } }
	inFlight = false
	if (stopped) return
	...
	scheduleIn(REFRESH_RETRY_MS)
}
```

**Подписка на видимость и снятие** (`:107-128`): `doc.addEventListener` при создании, `stop()` снимает слушатель, таймер и обнуляет `dueAt`. Для модуля попытки шов `visibility` (`isHidden`, подписка, `pagehide`, `online`) строить по тому же принципу, `dispose` = `stop`.

**Ограничение таймера** (`:6`): `MAX_TIMER_MS = 2_147_483_647`; не нужен для секундного тика, нужен, если паузы повторов считаются от `dueAt`.

**Тесты без DOM:** `keep-alive.test.ts:14-33` (`fakeDocument` со `Set` слушателей и `setVisibility`), `:37-58` (`setup()` собирает швы и `vi.fn`), `:60-67` (`vi.useFakeTimers()` + `vi.setSystemTime(START)` в `beforeEach`, `useRealTimers` в `afterEach`), `:73-81` (`vi.advanceTimersByTimeAsync(...)`, граничные значения `-1` и `+1`), `:137` (`vi.getTimerCount() === 0` после остановки), `:212-233` (ручной `deferred`-промис для запроса в полёте). Это ответ на «шов или `vi.useFakeTimers`» из Discretion: образец использует **оба**: швы `now`/`setTimer`/`clearTimer` передаются реальными, а время гонит `vi.useFakeTimers`.

**Нет аналога:** очередь с версиями значений, дебаунсом 600/700 мс и наибольшим ожиданием 5 с, повторами 1, 2, 5, 10, 30 с, `keepalive`. Взять только форму (замыкание, швы, `inFlight`, `stopped`); логика по D-10, D-13, D-16.

### Хранилище WAL и ключи (`attempt-lifecycle`)

**Analog:** `app/web/components/tests/client-attempt-id.ts` и `client-attempt-id.test.ts`.

**Шов хранилища** (`client-attempt-id.ts:1`): `export type ClientAttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`. Использовать для шва `storage` (D-01), общий тип с этой фазы.

**Безопасное чтение/запись** (`:11-37`): чтение в `try/catch` с `null` при любой негодной записи, запись глотает исключение и возвращает значение из памяти.
```typescript
function readStoredClientAttempt(storage, key) {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<StoredClientAttempt> | null
		if (!parsed || typeof parsed.sessionId !== 'string' || ...) return null
		return {...}
	} catch { return null }
}
```
Копировать для чтения WAL v2 и прежних форм; по D-08 вместо ручных `typeof` проверять `AnswerValueSchema` и `TelemetryMapSchema` из `@bio-exam/exam-core` (`index.ts:36`, `:124`), негодное значение отбрасывается по ключу.

**Тест хранилища** (`client-attempt-id.test.ts:6-23`): `memoryStorage(initial)` на `Map` с экспозицией `data`; `sequentialIds()` детерминирует идентификаторы. Скопировать `memoryStorage` в тест модуля попытки (или вынести общий помощник), в том числе для проверки «в `sessionKey` нет содержимого ответов» (D-26 п. 9) и «ключей нет после `reset`».

**Что заменяет:** обращения к `localStorage` в `TestRunner.tsx:180-183`, `:197-207`, `:218`, `:241`, `:255`, `:263`, `:271`, `:333`, `:396-412`, `:503`, `:525`, `:604`, `:714-717`. Особенно `:218` и `:241`: `localStorage.setItem(sessionKey, JSON.stringify(serverSession))` с `draftAnswers` нарушает D-08; в новом коде писать `{ sessionId, startedAt }`.

**Очистка ключей** (`attempt-submit-flow.ts:64-82` + `TestRunner.tsx:178-185`): оставить таблицу `STORAGE_KEYS_BY_EVENT` и `storageKeysToClear` как есть, `clearAttemptStorage` (цикл по ключам) переезжает в модуль как единственное место. Образец таблицы (`attempt-submit-flow.ts:67-73`): `'session-replaced': ['wal', 'frozen', 'clientAttemptId']`, `'not-found': ['session', 'clientAttemptId']`, `success: ALL_ATTEMPT_KEYS`. Для D-12 (404 и 403 на `/start` оставляют WAL, но переводят в `sessionId: null`) добавить действие над WAL поверх существующей строки таблицы, не менять её.

### Исходы API и таблица «Поведение» (`attempt-lifecycle`, тест строк фазы 5)

**Analog:** `attempt-submit-flow.ts` и `attempt-submit-flow.test.ts`.

**Классификация исхода** (`attempt-submit-flow.ts:84-96`): `classifySubmitFailure` / `classifyStartFailure` принимают `unknown`, смотрят `error instanceof AttemptRequestError` и `status`/`code`. Модуль вызывает их и превращает в события (D-04).
```typescript
if (error.status === 409 && error.code === SUBMIT_ERROR_CODES.alreadySubmitted) {
	return { kind: 'already-submitted', attemptId: error.attemptId }
}
if (error.status === 422 && error.code === SUBMIT_ERROR_CODES.timeExpired) return { kind: 'time-expired' }
```

**Табличный тест** (`attempt-submit-flow.test.ts:16-50`): `describe` + `test.each([[title, error, expected], ...])` с `new AttemptRequestError(status, code, attemptId)`. Этот стиль для D-04 п. 8: каждая строка «Поведение» как последовательность событий с поддельным `api`, который бросает `AttemptRequestError` нужного статуса; проверять фазу и оставшиеся ключи `memoryStorage`.

**Серверная часть для PATCH** (D-13): статусы PATCH приходят из `public.ts:565-612` (400 при разборе, 403/404 из `denyAttemptAccess`, 404 `Session not found or already submitted`). Сейчас `saveAnswer` их не читает; новая функция сохранения возвращает исход (`ok`, статус, сбой сети) и принимает `keepalive`: взять форму `fetchAttemptJson` (`api.ts:60-76`) и `AttemptRequestError`, но без броска, плюс `keepalive` в `init` передаётся `apiFetch`.

**Ограничение:** `scripts/attempt-integrity-guards.test.mjs:15,267-281` сканирует `components/tests` и `lib/tests` на `computeVerdicts(`, `getQuestionStatus`, `results: unknown[]`, догадки о видимости ключа. Модуль в этих каталогах их содержать не должен.

### `TestRunner.tsx` (component; меняется, см. D-03)

**Analog:** сам файл. Что остаётся в компоненте, образцы форм:

- Диалоги и баннеры: `bannerFor(banner)` `:744`, `SUBMIT_FLOW_TEXT` `:789-1031`, `AlertDialog` для «Начать тест?» `:961-975`, `timeExpiredOpen` `:977-987`, «Есть неотвеченные вопросы» `:989-1010`, `Dialog` «Попытка уже сдана» `:1012-1031`.
- Тосты: `toast.info(SUBMIT_FLOW_TEXT.sessionReplaced)` `:291`, `toast.info('Сессия восстановлена')` `:295`, `toast.warning('Осталась 1 минута — тест будет сдан автоматически', { duration: 8000 })` `:597`, `toast.error('Не удалось начать тест. Попробуйте ещё раз.')` `:691`.
- Панель навигации: `<section className="h-fit w-full shrink-0 ... tab:sticky tab:top-4 tab:w-48">` `:904`, блок `Отвечено: X / N` `:915-927`. Строка индикатора D-23 вставляется после `<p className="text-xs text-muted-foreground">Отвечено…</p>` `:916-918`, класс текста по соседству (`text-xs text-muted-foreground`); точные разметка и `aria-live` в `06-UI-SPEC.md` поверхность 1.
- Предзагрузка картинок `:644-661` и `extractImagePaths` `:87-105` не трогать (07-09).
- Таймер: `useCountdown` `:109-127` и `formatTime` `:129-137` заменяются секундным тиком модуля; отображение `secondsLeft`/`redThresholdSeconds` `:905-914` остаётся.
- Хендлеры ответа: `onSelectRadio`, `onToggleCheckbox`, `onSelectMatching`, `onInputTextAnswer` `:427-456` превращаются в вызовы `answer(questionId, value)`. Вычисление следующего значения (`:434-435`, `:443-447`) сейчас внутри `setAnswers`-обновления с побочным вызовом сохранения (`:436`, `:448`); перенести расчёт значения в модуль или в чистую функцию вне React.
- Охранный тест D-29 п. 7: в файле не должно остаться `localStorage`, `visibilitychange`, `useDebouncedCallback`, `setInterval` (сейчас `:8`, `:122`, `:630`, много `localStorage`).

### `lib/tests/api.ts` и контракты (`exam-core`)

**Analog:** `fetchAttemptJson` (`api.ts:60-76`), `SubmitAttemptRequestSchema` (`packages/exam-core/src/attempt-result.ts`, тип `:163`).

Перенос `SaveDraftAnswerSchema` (`public.ts:548-562`, `z.object({questionId: z.string().uuid().optional(), value: AnswerValueSchema.optional(), telemetry: TelemetryMapSchema.optional()}).superRefine(...)`) в пакет по образцу `SubmitAttemptRequestSchema`: схема + `z.infer` тип, экспорт в `packages/exam-core/src/index.ts` (рядом со строками `:36`, `:47`, `:61`, `:124`), имя схемы добавить в `EXPECTED_EXPORTS` `scripts/check-exam-core-dist.mjs:9-...` (список отсортирован по алфавиту, первым идёт `ALLOWED_...`), иначе `yarn verify` красный. `public.ts` импортирует схему вместо локального `const`. Тест схемы рядом: `packages/exam-core/src/attempt-result.test.ts`.

### Автосохранение черновика вопроса

**Analog 1:** `QuestionEditorPageClient.tsx` (530 строк).

- Дебаунс-константа `:38` (`QUESTION_DRAFT_SAVE_DEBOUNCE_MS = 700`).
- Гидратация один раз `:147-169`, флаги `isDraftHydratedRef`, `latestDraftQuestionRef`, `lockVersionRef` `:98-101`; `extractQuestionFromDraftPayload` `:73-94` (`{ question }` или голый объект) оставить для чтения серверного и локального payload.
- Корень LIFE-04: снятие таймера при размонтировании без досылки `:171-178`.
- PATCH и 409 `:234-273` (тело `{ payload: { question: payloadQuestion }, lockVersion }`, `payloadQuestion = { ...normalizeQuestionForSave(q), id: undefined, order: testData.questions.length }`): форму payload сохранить (D-22). Ответ сервера `{ draft: { lockVersion } }` (`routes/tests/index.ts:1245`, `res.json({ draft: toQuestionDraftResponse(updated) })`); клиент читает `data?.draft?.lockVersion ?? data?.lockVersion` `:264-265`.
- Сейчас 409 показывает `data?.error` (английская строка `Question draft lock version mismatch`, `routes/tests/index.ts:229`) `:254-258` (D-21).
- Оболочка автосохранения `handleQuestionDraftChange` `:275-293` заменяется вызовом модуля; `console.warn` на `:287-289` уходит в состояние `error`.
- `handleSaveQuestion` `:361-414`: порядок «POST вопроса → DELETE черновика → `mutate()` → тост → `backToTestEditor`»; по D-20 перед ним отменить автосохранение и дождаться запроса в полёте, после DELETE модуль `closed`. Образец тоста: `toast.success(appendAsNew ? 'Вопрос добавлен' : 'Вопрос сохранен')` `:402`.
- Экраны ошибки загрузки с «Назад к тесту» `:441-472` (на них досылать нечего, D-17).
- Подключение: `<QuestionEditor ... onDraftChange={isDraftMode ? handleQuestionDraftChange : undefined} onCancel={backToTestEditor} headerActions=... isSaving={isSaving} />` `:476-490`.

**Analog 2:** `QuestionEditor.tsx` (292 строки). `useEffect(() => { setForm({ ...question }) }, [question])` `:61-63` и `useEffect(() => { onDraftChange?.(form) }, [form, onDraftChange])` `:65-67` дают вызов `onDraftChange` на инициализацию (корень D-20, сравнение сериализации с последним подтверждённым). Header: `<div className="flex flex-wrap gap-2">{headerActions}<Button variant="secondary" onClick={onCancel} ...>Отмена</Button><Button ... onClick={handleSave}>` `:134-146`; «Отмена» уходит через `onCancel`, строка состояния и ожидание ложатся рядом (место в `06-UI-SPEC.md` поверхность 2). Кнопка с `Loader2` при сохранении: `:141-145` (`<span className={isSaving ? 'invisible' : ''}>` + абсолютный `Loader2`) копировать для «ожидание на кнопках ухода».

**Локальная копия** (`question-draft-wal-${draftId}-${userId}`, `{ v: 1, payload, baseLockVersion }`): безопасное чтение/запись и тест на `memoryStorage` как в `client-attempt-id.ts`. Применять копию до монтирования `QuestionEditor`: `QuestionEditorPageClient.tsx:147-169` решает, из чего заполнить `setDraftQuestion`; Lexical переинициализируется при смене `initialMdxContent` (`components/editor/editor.tsx:42-57`), поэтому копию применять в той же ветке, где сейчас `extractQuestionFromDraftPayload(...)`, один раз перед `isDraftHydratedRef.current = true`. `userId` брать из `useAuth()` (`TestRunner.tsx:10,140`).

**Маршруты `question-drafts`** (не меняются): PATCH `routes/tests/index.ts:1176-1256` с `UpdateQuestionDraftSchema` (`schemas/tests.ts:129-134`): `lockVersion` опционален; при совпадении `lock_version` обновление, при несовпадении 409 `QUESTION_DRAFT_LOCK_CONFLICT_ERROR` (`:229`), при отсутствии 404 `QUESTION_DRAFT_NOT_FOUND_ERROR`; 403 даёт `requirePerm('tests', 'write')` до обработчика. Клиент D-21 различает 409/403/404/сеть по `res.status`.

### `unsavedChanges.store.ts` и `BackButton.tsx`

**Analog:** сами файлы. Стор: zustand `create`, `dirtyByPath: Record<string, boolean>`, `setDirty`, `isDirty`, `clear` (`unsavedChanges.store.ts:5-30`). `dirtyByPath` сейчас никто не ставит (`setDirty` не вызывается). Расширять тем же стилем: рядом с `dirtyByPath` добавить `flushByPath: Record<string, () => Promise<boolean>>` и `registerFlush(path, fn | null)`; `clear(path)` (`:20-26`) заодно снимает и досылку.

`BackButton.tsx`:
```typescript
const pathname = usePathname() || '/'
const isDirty = useUnsavedChanges((s) => s.isDirty(pathname))
const clearDirty = useUnsavedChanges((s) => s.clear)
const [open, setOpen] = useState(false)
const onClick = () => { if (isDirty) { setOpen(true); return } doNavigate() }
```
Диалог «Есть несохранённые изменения / Уйти без сохранения?» с «Остаться» / «Выйти» `:61-82`; «Выйти» делает `clearDirty(pathname)` и `router.back()`. Правка по D-17: в `onClick` при зарегистрированной досылке сначала `await flush()`, успех → `doNavigate()`, неудача → `setOpen(true)`; без досылки ветка прежняя. Ключ пути: `usePathname()` страницы черновика совпадает с путём, под которым страница регистрирует досылку и `dirty`. Кнопка ожидания: `Loader2` из `lucide-react` как в `QuestionEditor.tsx:141-145`. «Отмена» идёт через общую функцию ухода и тот же диалог (диалог либо выносится в общий компонент, либо открывается из стора: решение за планом).

`BackButton` смонтирован в `components/AppLayout/AppLayout.tsx:~49` в шапке, вне страницы черновика; поэтому связь страница ↔ кнопка только через стор.

`beforeunload`: слушатель подключается по состоянию автосохранения (`pending`/`saving`/`error`) и снимается при подтверждении (D-18); в `app/web` образца нет (`beforeunload`, `pagehide`, `keepalive` нигде не используются); шов окна по образцу `KeepAliveDocument` (`keep-alive.ts:8-12`), тип с `addEventListener`/`removeEventListener` для `'beforeunload'` и `'pagehide'`.

### Web-тесты без DOM

`vitest.config.ts`: `environment: 'node'`, `include: ['**/*.test.ts']`, алиас `@` на корень `app/web`. Образцы:

| Что проверять | Образец |
|---|---|
| Модуль с часами, таймерами, видимостью, последовательностями событий | `lib/session/keep-alive.test.ts` (`vi.useFakeTimers`, `fakeDocument`, `advanceTimersByTimeAsync`, `getTimerCount`) |
| Хранилище `localStorage` | `components/tests/client-attempt-id.test.ts` (`memoryStorage`, `describe`/`test`, `expect`) |
| Табличные исходы API, фазы | `components/tests/attempt-submit-flow.test.ts` (`test.each`) |
| Чистые функции телеметрии | `components/tests/telemetry.test.ts` (`node:assert/strict` + `test`) |
| Запрос в полёте, ручной промис | `keep-alive.test.ts:212-233` (`deferred`), `lib/session/client.test.ts:13-18` (`deferred<T>()`), ответы `new Response(JSON.stringify(body), { status })` `:20-22` |
| Исходный охранный тест на содержимое файлов | `lib/session/client.test.ts:479-493` (`readdirSync`/`readFileSync` по каталогу модуля) |

Стиль: `import assert from 'node:assert/strict'` и `test` из `vitest` (keep-alive, telemetry) либо `expect` (client-attempt-id, attempt-submit-flow); новые файлы следуют ближайшему соседу по каталогу. Один вид импорта на файл. Тесты D-26 п. 1-16 пишутся строго без React.

### E2E (красные проверки и ручные сценарии)

**Analog:** `e2e/tests/take-test.spec.ts` и `e2e/fixtures/exam.ts`, `e2e/tests/authoring.spec.ts`.

- Студент: `takeTest(page, seedTest, answers)` `exam.ts:155-181` (проходит всё до submit); для D-25 п. 1 нужен собственный сценарий: `answerQuestion(page, question, answers[...])` `:168-172` для Q1, клик `Далее`, ответ Q2, затем `page.reload()` до 600 мс и проверка `Отвечено: 2 / N` (текст `:166`, `:173`).
- Фикстуры `studentPage`, `adminPage` `exam.ts:78-90`; сид `seedTest(projectKey(testInfo), 'all-templates')` (`take-test.spec.ts:16`).
- Учитель: `openNewQuestion` (`authoring.spec.ts:30-37`, создаёт черновик и ведёт на `/questions/drafts/<uuid>`), `typePrompt` `:46-51`, `saveQuestion` `:61-67`; `page.getByRole('button', { name: 'Отмена' })`.
- `test.fail()` и `page.route` в репозитории отсутствуют: взять API Playwright напрямую; D-25 «красные» проверки первые в порядке планов.
- Проекты `chromium-desktop` и `chromium-mobile` в `e2e/playwright.config.ts`.

### Охранный тест фазы 6

**Analog:** `scripts/attempt-integrity-guards.test.mjs` (node:test, `.mjs`). Константы путей `:15-16`, `collectSources(root, dir)` и `scanFiles(root, [files], checks)` с массивами проверок вида `{ label, match: (line) => ... }` `:20-60`, `:146-152`; тесты уровня `test('...', () => ...)` `:267-340`, проба с копией файла во временном каталоге `:329-340` (вставка запрещённой строки даёт нарушение). Для D-29 п. 7 добавить проверки для `TestRunner.tsx` на `localStorage`, `visibilitychange`, `useDebouncedCallback`, `setInterval` тем же приёмом, плюс детектор-тест «находит запрещённое / пропускает разрешённое» как `:219-265`. Дополнительный образец: `scripts/auth-no-role-string-checks.test.mjs`, `scripts/exam-core-no-private-copies.test.mjs`.

### Навыки `.agents/skills` и `AGENTS.md`

**Analog:** в репозитории нет (каталога `.agents/skills` и SKILL.md нет в git). Внешний образец оформления: `~/.claude/skills/writing-for-agents/SKILL.md` (frontmatter `name`, `description`, `metadata`; для навыков проекта по D-28 только `name` и `description`) и его `SKILL-MECHANICS.md`. Структура `AGENTS.md`: разделы `## CodeGraph`, `## Decisions and plans`, `## Project commands`, `## Scope and safety`, `## Routing` (таблица колонок `Area | Where | Read first`, строки 42-52); навыки добавляются колонкой или строками таблицы «Routing». `scripts/check-docs-commands.mjs:23` `export const DOC_FILES = ['README.md', 'app/server/README.md', 'AGENTS.md']` расширяется на `.agents/skills/*/SKILL.md` (обход каталога по образцу цикла `for (const file of DOC_FILES)` `:126`), тест рядом `scripts/check-docs-commands.test.mjs`. Выдавать пути в навыках только существующие: `app/web/lib/session/`, `app/server/src/services/access-policy`, `app/server/src/services/attempt-sessions`, `scripts/with-test-db.mjs`.

## Shared Patterns

### Безопасная работа с `localStorage` (WAL попытки и копия черновика вопроса)
**Source:** `app/web/components/tests/client-attempt-id.ts:11-37`. Любая ошибка чтения даёт `null`, запись в `try/catch` без выброса, работа продолжается в памяти (D-01, D-09).

### Швы вместо глобалов
**Source:** `app/web/lib/session/keep-alive.ts:14-37`. `now`, `setTimer`, `clearTimer`, `doc`: без `Date.now()`, `setInterval`, `document` внутри модулей (охранный тест D-29).

### Исход запроса как значение, а не исключение
**Source:** `app/web/lib/tests/api.ts:31-76` (`AttemptRequestError` + `fetchAttemptJson`) и `attempt-submit-flow.ts:84-96`. Новая функция сохранения возвращает исход; тексты и классификация остаются в `attempt-submit-flow.ts`.

### Контракт в `exam-core`, не копия
**Source:** `packages/exam-core/src/attempt-result.ts` (`SubmitAttemptRequestSchema`), `telemetry.ts` (`mergeTelemetryMaps`, `TelemetryMapSchema`). `scripts/exam-core-no-private-copies.test.mjs` запрещает копии; новые экспорты добавлять в `EXPECTED_EXPORTS`.

### Без комментариев в коде, русские тексты UI
Код без комментариев (правило пользователя; существующие комментарии в `TestRunner.tsx`, `keep-alive.ts` образцом не считать). Тексты и тосты по-русски, как в `SUBMIT_FLOW_TEXT`.

### Форматирование
Табуляции, одинарные кавычки, без точки с запятой (oxfmt): видно во всех образцах.

## No Analog Found

| Файл | Роль | Поток | Причина |
|---|---|---|---|
| `lib/drafts/save-queue.ts` (логика очереди) | service | event-driven | дебаунс с наибольшим ожиданием, повторы с паузами, версии значений, `keepalive` в проекте не встречаются; брать только форму из `keep-alive.ts` |
| `useAttemptLifecycle` (`useSyncExternalStore`) | hook | pub-sub | в `app/web` нет `useSyncExternalStore`; ближайшее по подписке zustand-стор `unsavedChanges.store.ts` |
| `.agents/skills/*/SKILL.md` | doc | n/a | в репозитории нет ни одного навыка; образец оформления внешний |
| e2e `test.fail()` и `page.route` | test | n/a | в `e2e/` не применялись |
| `beforeunload`, `pagehide`, `keepalive` | utility | event-driven | нигде в `app/web` |

## Metadata

**Analog search scope:** `app/web/{components/tests,components/Buttons,lib/session,lib/tests,store,app/(internal)/(protected)/admin/tests}`, `app/server/src/{routes/tests,services/attempt-sessions}`, `packages/exam-core/src`, `scripts`, `e2e`, `AGENTS.md`.
**Files scanned:** ~35 (прочитаны полностью: `TestRunner.tsx`, `keep-alive.ts` и тест, `attempt-submit-flow.ts`, `client-attempt-id.ts`, `telemetry.ts`, `unsavedChanges.store.ts`, `BackButton.tsx`, `api.ts`, `QuestionEditorPageClient.tsx` по частям, `QuestionEditor.tsx:1-150`).
**Pattern extraction date:** 2026-10-04
