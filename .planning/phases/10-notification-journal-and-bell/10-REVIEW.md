---
phase: 10-notification-journal-and-bell
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - app/server/drizzle/0027_notification_journal.sql
  - app/server/drizzle/meta/_journal.json
  - app/server/drizzle/migrations-manifest.json
  - app/server/src/db/schema.ts
  - app/server/src/db/user-deletion-rule.test.ts
  - app/server/src/routes/index.ts
  - app/server/src/routes/notifications.ts
  - app/server/src/routes/notifications.test.ts
  - app/server/src/routes/notification-open.test.ts
  - app/server/src/routes/tests/assignments.ts
  - app/server/src/routes/tests/assignment-notifications.test.ts
  - app/server/src/routes/tests/publish-notifications.test.ts
  - app/server/src/routes/users/index.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/src/services/notifications/channels.ts
  - app/server/src/services/notifications/cursor.ts
  - app/server/src/services/notifications/index.ts
  - app/server/src/services/notifications/kinds.ts
  - app/server/src/services/notifications/notifications.test.ts
  - app/server/src/services/notifications/open.ts
  - app/server/src/services/notifications/producers/test-assigned.ts
  - app/server/src/services/notifications/read.ts
  - app/server/src/services/notifications/record.ts
  - app/server/src/services/question-content/relocate.ts
  - app/web/app/(internal)/(protected)/notifications/[id]/NotificationOpenClient.tsx
  - app/web/app/(internal)/(protected)/notifications/[id]/page.tsx
  - app/web/components/AppLayout/AppLayout.tsx
  - app/web/components/auth/AccessDeniedState.tsx
  - app/web/components/notifications/NotificationBell.tsx
  - app/web/components/notifications/NotificationList.tsx
  - app/web/components/notifications/NotificationListSkeleton.tsx
  - app/web/components/notifications/UnreadTitlePrefix.tsx
  - app/web/lib/navigation/crumbs.ts
  - app/web/lib/navigation/paths.ts
  - app/web/lib/notifications/api.ts
  - app/web/lib/notifications/format.ts
  - app/web/lib/notifications/time.ts
  - e2e/tests/notifications.spec.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

Проверены миграция 0027, модуль `services/notifications` (запись, каналы, курсор, чтение, открытие, таблица видов, производитель `test.assigned`), три пути назначения через `addAssignments`, публикация в `updateTestSettings`, маршруты `/api/notifications`, колокольчик, список, префикс вкладки, страница `/notifications/[id]`, сид и e2e.

Что проверено и признано корректным:

- Границы транзакций: внутри `addAssignments`, обеих веток `updateTestSettings`, `recordNotifications`, `inboxChannel.schedule`, `visibleTestTitle` и `recordTestPublished` нет вызовов модульного `db`: только `tx`. Риска исчерпания пула нет.
- Гонка назначения и публикации (D-18): назначение вставляет `test_assignments` (FK берёт `FOR KEY SHARE` на строку теста), затем `FOR SHARE` на `tests`; публикация держит `FOR NO KEY UPDATE` (или `FOR UPDATE` при переносе) и читает назначения обычным SELECT. При любом порядке ровно одна сторона пишет событие: если назначение взяло `FOR SHARE` первым, публикация ждёт его фиксации и новым снимком видит назначение; если первой была публикация, `FOR SHARE` ждёт её и перечитывает уже опубликованную версию строки. Взаимной блокировки нет: вставки назначений и событий отсортированы, публикация не берёт блокировок на строки, которые держит назначение.
- Upsert: дубли пары `(recipient_id, dedupe_key)` в одном пакете снимает `uniqueSorted` (иначе было бы «ON CONFLICT DO UPDATE command cannot affect row a second time»); `ref_seq + 1`, `last_event_at = now()`, `read_at = NULL` (drizzle не отбрасывает `null`), `RETURNING` отдаёт id и для обновлённых строк, так что доставка `inbox` обновляет `sent_at`.
- Курсор: `to_char(... 'US')` даёт ровно 6 знаков, регулярка требует 6 знаков и `Z`, `Date.parse` в Node принимает микросекунды; сравнение строк `(last_event_at, id) < (ts, id)` совпадает с `ORDER BY last_event_at DESC, id DESC`, равные метки (весь сид в одной транзакции) разводятся по `id`. Неверный base64/JSON/массив в `cursor` даёт 400.
- IDOR: `markRead`, `openNotification`, список и счётчик фильтруют по `ownedBy(userId)`; чужой, несуществующий и неверный id на `open` дают одинаковый 403 `NO_ACCESS`, на `read` одинаковый 404.
- Ответы существующих маршрутов назначения (`{ ok: true }`, `{ ok: true, assigned }`) и коды (403, 409 по версии) не изменились.
- React: `startedFor` в `ref` защищает `open` от двойного эффекта строгого режима; ключи SWR содержат `userId`; `UnreadTitlePrefix` не зацикливается (пишет, только если заголовок отличается) и снимает ровно один префикс.
- Цикла импортов `relocate.ts -> notifications -> kinds.ts -> attempt-sessions` нет: `attempt-sessions` не импортирует `question-content`.

Найдены две проблемы уровня WARNING: обход проверки внутреннего `href` перед `router.replace` и потеря события публикации в гонке со снятием публикации.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `isInternalHref` пропускает адрес, который браузер разбирает как внешний

**File:** `app/web/lib/notifications/format.ts:4`, `app/web/lib/notifications/format.ts:27-29`, `app/web/lib/notifications/api.ts:81`, `app/web/app/(internal)/(protected)/notifications/[id]/NotificationOpenClient.tsx:26`
**Issue:** Проверка `^\/(?![/\\])` смотрит только на второй символ. Парсер URL вырезает из адреса табуляцию и переводы строки, поэтому `"/\t/evil.example/x"` (и `"/\n/evil.example/x"`, `"/\r/..."`) проходит проверку, а `new URL("/\t/evil.example/x", origin)` даёт `https://evil.example/x` (проверено в Node). В Next 16.3 `router.replace` для адреса с чужим origin делает жёсткий переход (`navigate-reducer.js:34`, `isExternalUrl -> completeHardNavigation`), то есть защита от открытого редиректа, заявленная в UI-SPEC («web принимает только путь, начинающийся с одного `/`»), обходится. Сейчас сервер строит `href` через `encodeURIComponent`, поэтому эксплуатация требует ошибки в будущем обработчике вида или подмены ответа; но это единственная клиентская защита, и e2e `a foreign href from the server is not followed` проверяет только `//evil.example/x`.
**Fix:** сравнивать origin после разбора и отвергать управляющие символы:
```ts
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function isInternalHref(href: string, origin: string): boolean {
	if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/\\') || CONTROL_CHARS.test(href)) return false
	try {
		return new URL(href, origin).origin === origin
	} catch {
		return false
	}
}
```
В `api.ts:81` вызывать `isInternalHref(outcome.data.href, window.location.origin)`; в `format.test.ts` и e2e добавить случаи `"/\t/evil.example/x"` и `"/\\evil.example"`.

### WR-02: Публикация теряет событие `test.assigned`, если параллельно сняли публикацию

**File:** `app/server/src/services/question-content/relocate.ts:439`, `app/server/src/services/question-content/relocate.ts:462`, `app/server/src/services/question-content/relocate.ts:484-491`, `app/server/src/services/question-content/relocate.ts:294-311`
**Issue:** `shouldIncrementVersion` (он же признак перехода false -> true для `recordTestPublished`) вычисляется по `existingTest`, прочитанному модульным `db` до транзакции. Оптимистичная защита — только `version`, а снятие публикации версию не меняет. Последовательность: запрос A читает `isPublished = true, version = 3`; запрос B снимает публикацию (version остаётся 3); пока тест черновик, ученикам назначают тест — `visibleTestTitle` возвращает `null`, событий нет (D-18); A сохраняет с `isPublished: true`: условие `version = 3` выполнено, тест снова опубликован, но `shouldIncrementVersion = false`, `recordTestPublished` не вызывается и версия не растёт. Назначенные в окне B ученики события не получат никогда (следующего перехода false -> true не будет). То же в ветке переноса: `lockPlannedTest` сверяет `slug`, `topicId`, `version`, но не `isPublished`.
**Fix:** добавить состояние публикации в оптимистичную проверку обеих веток, чтобы гонка давала 409, как остальные изменения:
```ts
.where(
	and(
		eq(tests.id, testId),
		eq(tests.slug, existingTest.slug),
		eq(tests.topicId, existingTest.topicId),
		eq(tests.version, existingTest.version),
		eq(tests.isPublished, existingTest.isPublished)
	)
)
```
и в `lockPlannedTest` передавать `isPublished: existingTest.isPublished` и сравнивать с `locked.isPublished` (если `lockTest` его не возвращает — добавить столбец в его выборку). Тест: снять публикацию между чтением и сохранением, ожидать 409 и отсутствие публикации без события.

## Info

### IN-01: Неиспользуемые экспорты из входа модуля

**File:** `app/server/src/services/notifications/index.ts:1-25`
**Issue:** `UNKNOWN_KIND_TEXT`, `OpenContext`, `testAssignedDedupeKey`, `TEST_ASSIGNED_KIND`, `NotificationItem`, `NotificationsPage` вне модуля не используются; `recordNotification` и `notificationText` — только в тестах. Вход глубокого модуля (ADR-0005) шире, чем нужно.
**Fix:** убрать неиспользуемые экспорты из `index.ts`; тестам при необходимости импортировать из файла модуля.

### IN-02: Оркестрация «назначение + событие» живёт в файле маршрута

**File:** `app/server/src/routes/tests/assignments.ts:46-63`, `app/server/src/routes/users/index.ts:32`
**Issue:** `addAssignments` (транзакция, вставка и вызов производителя) экспортируется из модуля маршрутов и импортируется другим роутером (`users/index.ts`). Логика записи назначений не принадлежит HTTP-слою (ADR-0005, «Express владеет данными» — через сервисы).
**Fix:** перенести `addAssignments` (и `removeAssignment`) в сервис назначений, например `services/test-assignments/index.ts`, роутеры вызывают его.

### IN-03: Префикс вкладки снимает законное начало заголовка вида «(N) »

**File:** `app/web/lib/notifications/format.ts:2`, `app/web/lib/notifications/format.ts:16-18`
**Issue:** `withTitlePrefix` всегда снимает `^\(\d+\+?\) `, даже если это часть настоящего заголовка страницы (например, название теста «(2) Клетка» в `metadata.title`), и при уходе числа в ноль заголовок теряет эту часть.
**Fix:** снимать только тот префикс, который компонент поставил сам: хранить последний применённый префикс в `ref` и убирать именно его.

### IN-04: «Прочитать все» зависит только от числа, а не от списка

**File:** `app/web/components/notifications/NotificationBell.tsx:51`, `app/web/components/notifications/NotificationBell.tsx:103-104`
**Issue:** если запрос `unread-count` не удался до первой загрузки (`data` нет, `count = 0`), список в поповере может показывать непрочитанные строки, а кнопка неактивна и нажатие ничего не делает.
**Fix:** считать кнопку активной, если `count > 0` или в загруженном списке есть `read === false`; либо при ошибке числа не блокировать кнопку.

### IN-05: Догрузка теряется при перезапросе первой страницы во время запроса

**File:** `app/web/components/notifications/NotificationList.tsx:55`, `app/web/components/notifications/NotificationList.tsx:80-84`
**Issue:** если во время «Показать ещё» SWR перезапросил первую страницу (фокус окна, `refreshNotifications`) и данные изменились, `current` становится `null` и пришедшая страница отбрасывается: для пользователя нажатие выглядит пустым, кнопка остаётся. Сброс догрузок при смене первой страницы описан в UI-SPEC, но молчаливая потеря запроса в полёте — нет.
**Fix:** после ответа сравнивать `base` с текущим `data` и при несовпадении не показывать пустой результат: например, повторить догрузку от нового `nextCursor` или вернуть фокус на кнопку.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
