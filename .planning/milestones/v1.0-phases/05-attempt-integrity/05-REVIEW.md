---
phase: 05-attempt-integrity
reviewed: 2026-10-04T00:00:00Z
depth: deep
files_reviewed: 24
files_reviewed_list:
  - app/server/drizzle/0022_attempt_sessions.sql
  - app/server/drizzle/0023_attempt_results_version.sql
  - app/server/src/db/schema.ts
  - app/server/src/services/attempt-sessions/access.ts
  - app/server/src/services/attempt-sessions/sessions.ts
  - app/server/src/services/attempt-sessions/submit.ts
  - app/server/src/services/scored-attempt/facts.ts
  - app/server/src/services/scored-attempt/view.ts
  - app/server/src/services/scored-attempt/read.ts
  - app/server/src/services/scored-attempt/legacy.ts
  - app/server/src/services/scored-attempt/legacy-fact.ts
  - app/server/src/services/scored-attempt/storable-fact.ts
  - app/server/src/routes/tests/public.ts
  - app/server/src/routes/tests/index.ts
  - packages/exam-core/src/attempt-result.ts
  - packages/exam-core/src/scoring.ts
  - app/web/components/tests/TestRunner.tsx
  - app/web/components/tests/attempt-submit-flow.ts
  - app/web/components/tests/client-attempt-id.ts
  - app/web/components/tests/runner-result-card.ts
  - app/web/components/tests/attempt-review/attempt-review-utils.ts
  - app/web/components/tests/attempt-review/QuestionAnswerReview.tsx
  - app/web/lib/tests/api.ts
  - app/web/lib/tests/types.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 5: ревью кода

**Проверено:** 2026-10-04
**Глубина:** deep (сервер, exam-core и web вместе, с выкаткой D-25)
**Файлов:** 24 (дифф `3f57bb2..106a949`, ветка `gsd/phase-05`)
**Статус:** issues_found

## Итог

BLOCKER и MAJOR не найдено. Серверное ядро проверено по сценариям:

- `/start`: открытая сессия под `FOR UPDATE`, `ON CONFLICT DO NOTHING` по частичному индексу, повторное чтение. Гонка «просроченная сессия плюс два `/start`» тоже сходится к одной открытой сессии: второй `FOR UPDATE` после перепроверки строки возвращает пусто, вставка упирается в конфликт, повторное чтение видит новую строку.
- Черновик: блокировка строки, сданная или закрытая сессия даёт 404.
- `precheckSubmit`: порядок «сдана → закрыта → просрочена» верный. Повтор после потери ответа отдаёт попытку и после окончания льготы.
- Транзакция submit: под блокировкой сессии параллельные запросы уходят в `replayed` или `conflict`.
- Утечка ключа студенту: `discloseToStudent` без показа ключа не отдаёт `key`, `missed` и `expected`. При откате старый server прогоняет строки версии 2 через `SubmitResultItemSchema`, а `z.object` отбрасывает `key` и `verdicts`. Так что оговорка D-25 «повтор отдал бы сырые факты» даже строже, чем нужно.
- Ключ на момент сдачи: у версии 2 он хранится в фактах, у версии 1 берётся из `correctAnswer` или из истории `answer_keys` по `created_at <= submitted_at`.

Найденное относится к web-потоку восстановления после автосдачи, к обещанию runbook D-25 о «Без оценки» и к строгому разбору старых строк.

Severity из запроса пересчитана в счётчики frontmatter так: BLOCKER → critical, MAJOR и MINOR → warning, INFO → info.

## Warnings

### CR-01 [MINOR]: после автосдачи восстановление говорит «ответы не засчитаны» про сохранённую попытку и молча запускает новую попытку с таймером

**Файл:** `app/web/components/tests/TestRunner.tsx:534-555` (задержка до очистки хранилища), `:273-284` (локальное решение «время вышло»), `:289-291` и `:235-246` (замена сессии без подтверждения)

**Сценарий отказа:**
1. Лимит истёк, автосдача отправила запрос, сервер создал попытку и сдал сессию.
2. Клиент 1,5 с показывает «Время вышло» (`await new Promise(... 1500)`) и только потом вызывает `clearAttemptStorage('success')`. Студент закрывает вкладку в эти 1,5 с, или ответ теряется в сети. В `localStorage` остаются `session`, `frozen`, `clientAttemptId` и WAL.
3. Студент возвращается позже, чем через лимит плюс 2 минуты. `restoreSession` по `isClientExpired` сам, без сервера, открывает диалог «Время вышло, ответы не засчитаны» и чистит хранилище. На деле попытка засчитана и лежит в «Мои попытки».
4. Если студент вернулся раньше, `/start` создаёт новую сессию, потому что прежняя сдана. `replaceWithNewSession` её принимает, показывает «Предыдущая попытка закрыта, начата новая» и запускает таймер новой попытки без диалога «Начать тест?». Результат сданной попытки студент не видит, а обратный отсчёт уже идёт.

**Минимальная правка:** сначала очистить хранилище, потом делать паузу:
```tsx
const result = await submitPublicTestAnswers(...)
debouncedSaveAnswer.cancel()
clearAttemptStorage('success')
if (isAutoSubmit) { setShowTimeUp(true); await new Promise((r) => setTimeout(r, 1500)); setShowTimeUp(false) }
setSubmitResult(result)
```
Для теста с лимитом в `restoreSession`: если `/start` вернул другой `sessionId`, сбросить состояние и показать `setAwaitingStart(true)`, а не запускать таймер молча. Новую сессию сервер уже создал, но таймер на экране не стартует без согласия студента.

### CR-02 [MINOR]: в окне «web раньше server» (D-25) карточка результата остаётся без подписи, а не «Без оценки», как обещает runbook

**Файл:** `app/web/components/tests/runner-result-card.ts:12-14`, вызов `app/web/components/tests/TestRunner.tsx:812`

**Сценарий отказа:** новый web выкачен, server ещё старый. Ответ submit приходит в прежней форме, без `status`. `runnerResultCard(undefined)` возвращает `{ ...CARDS[undefined] }`, то есть `{}`. Объект истинный, поэтому карточка рисуется, но `label` и `className` у неё `undefined`: пустой `<p>` и блок без рамки и фона. В runbook D-25 (`05-11-SUMMARY.md:214`) и в CONTEXT D-25 п. 5 написано «карточки вопросов показывают «Без оценки»», это неверно. Тест `runner-result-card.test.ts` проверяет только валидные статусы.

**Минимальная правка:**
```ts
export function runnerResultCard(status: QuestionStatus | undefined): RunnerResultCard {
	return { ...(CARDS[status as QuestionStatus] ?? CARDS.ungraded) }
}
```
Добавить тест на `undefined`. Есть второй вариант: исправить текст runbook. Но тогда preview из D-25 п. 2 покажет пустые карточки.

### CR-03 [MINOR]: строгий zod при чтении старой попытки превращает любую аномалию строки в 500, а страница администратора показывает 404

**Файл:** `packages/exam-core/src/attempt-result.ts:112-123` (`LegacyAttemptResultItemSchema.questionId: z.string()`) против `:125` (`AttemptQuestionViewSchema.questionId: z.string().uuid()`); `app/server/src/services/scored-attempt/legacy.ts:25,54` и `view.ts:76`; `read.ts:18-23,112`; `app/web/app/(internal)/(protected)/admin/attempts/[id]/page.tsx:25-26,42-43`

**Сценарий отказа:** строка версии 1 с `questionId`, который не UUID, проходит схему старой строки. `legacy.ts` такой случай прямо предусматривает (`UUID_PATTERN`, `question: null`). Затем `buildAttemptView` вызывает `AttemptViewSchema.parse`, получает `ZodError`, и наружу уходит 500. То же будет при любой строке, которая не прошла `AdminAttemptViewSchema.parse`, например `telemetry` не по `TelemetryMapSchema`. `AttemptResultsShapeError` экспортируется, но ни один маршрут её не ловит. Web при `!res.ok` вызывает `notFound()`. Администратор видит «страница не найдена» у попытки, которая есть и раньше открывалась. Прежний обработчик отдавал сырые данные. Набор полей на проде в D-16 проверяет пользователь (`<specifics>` п. 7), но код внутренне противоречив: адаптер принимает не-UUID, вид такие отвергает.

**Минимальная правка:** сделать `questionId` в `AttemptQuestionViewSchema` тоже `z.string()` или пропускать такие элементы в `readLegacyFacts` с `logger.warn`. В обработчике `/admin/attempts/:attemptId` ловить `AttemptResultsShapeError` и `ZodError`, отвечать 422 или 500 с понятным телом. В web различать 404 и прочие ошибки, а не сводить всё к `notFound()`.

## Info

### CR-04 [INFO]: после перезагрузки во время автосдачи экран остаётся замороженным и не досдаёт ответы (было до фазы)

**Файл:** `app/web/components/tests/TestRunner.tsx:255-257, 601-606, 746-753`

**Сценарий:** автосдача поставила `frozen` в `localStorage`, запрос до сервера не дошёл, студент перезагрузил страницу в пределах льготы. При монтировании `setFrozen(true)`, `/start` возвращает ту же открытую сессию, `hydrateFromServerSession` не снимает `frozen`. Эффект автосдачи требует `!frozen` и не срабатывает, кнопки «Завершить» отключены через `interactionDisabled`. Когда льгота кончится, следующая загрузка покажет «Время вышло», и ответы пропадут. Фаза поведение не ухудшила: раньше в конце получался вечный 422, теперь можно начать заново. Но этот поток фаза переписывала.
**Правка:** если `frozen` восстановлен, а сервер вернул ту же открытую сессию, снять `frozen` и `autoSubmitFiredRef`, чтобы эффект досдал ответы при `secondsLeft === 0`.

### CR-05 [INFO]: «Начать заново» при сдвинутых часах клиента возвращает старую сессию с черновиком

**Файл:** `app/web/components/tests/attempt-submit-flow.ts:100-105`, `TestRunner.tsx:273-284, 699-737`

**Сценарий:** часы клиента спешат относительно БД, и `isClientExpired` уже `true`, а на сервере сессия ещё в льготе. Диалог обещает «пустые ответы и полное время». `handleRetake` → подтверждение → `/start` возвращает ту же сессию с прежним `startedAt` и черновиком, `hydrateFromServerSession` вливает черновик, `secondsLeft` сразу 0, и автосдача уходит мгновенно.
**Правка:** решение «время вышло» при восстановлении принимать по ответу сервера, а не по `Date.now()` клиента. Минимум: в `handleRetake` после `/start` проверять, что `sessionId` новый, иначе продолжать прежнюю сессию без обещания «полного времени».

### CR-06 [INFO]: `draft_updated_at` теперь пишется `now()` в колонку без часового пояса

**Файл:** `app/server/src/services/attempt-sessions/sessions.ts:152` (раньше `new Date()`), `app/server/src/db/schema.ts` (`draftUpdatedAt: timestamp('draft_updated_at')`)
**Сценарий:** drizzle писал `Date` как UTC-время, `now()` пишет время в поясе сессии БД. Если `TimeZone` БД не UTC, старые и новые значения сдвинуты друг относительно друга. От этого поля зависит read-only SQL тихого окна D-25 (`coalesce(draft_updated_at, started_at) > now() - interval '3 hours'`). На проде пояс UTC (D-19), поэтому сейчас эффекта нет.
**Правка:** писать `sql\`now() AT TIME ZONE 'UTC'\`` или оставить как есть и записать допущение «БД в UTC» рядом с D-19.

---

_Проверено: 2026-10-04_
_Ревьюер: Claude (gsd-code-reviewer)_
_Глубина: deep_
