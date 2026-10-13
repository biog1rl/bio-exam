---
phase: 08-client-requests-runtime-and-decomposition
plan: 04
subsystem: web
tags: [http, swr, errors, LoadErrorAlert, HTTP-01, HTTP-02]
status: complete

requires:
  - phase: 08-01
    provides: чистое дерево и команда снимка 08-plan-files.cjs
provides:
  - модуль запросов app/web/lib/http (request, requestJson, requestBlob, RequestError, MalformedBodyError, createRequester) поверх apiFetch
  - тексты отказов и вид блока ошибки (failureMessage, failureOf, loadErrorView, readApiError, exportFailureMessage)
  - swrFetcher и fetcherWith со строковым ключом SWR
  - saveBlob и hasZipEndOfCentralDirectory
  - компонент components/feedback/LoadErrorAlert.tsx
  - доменный слой lib/settings/api.ts и переведённый экран диапазона графика
affects: [08-05, 08-11, 08-12, 08-13, 08-14, 08-15, 08-16, 08-17, 08-18, 08-19, 08-20, 08-21, 08-22, 08-23, 08-24, 08-28]

actuals:
  tokens: 11750
  tasks: 3
  commits: 0
plan_head_before: ceb436455f4f3c8ce7793f4df771e0233597f877
plan_head_after: ceb436455f4f3c8ce7793f4df771e0233597f877

tech-stack:
  added: []
  patterns:
    - "Отказ запроса — значение { ok: false, kind, status?, message, body? }; request не бросает, requestJson бросает RequestError с теми же полями"
    - "parse(body: unknown): T бросает MalformedBodyError; любой бросок parse даёт kind malformed со status"
    - "Ключ SWR — строка из *Keys.*() доменного слоя; parse передаётся фетчером fetcherWith(parse), созданным на уровне модуля"
    - "Текст отказа: 5xx проверяется раньше тела ответа (текст сервера 5xx не показывается), затем русский error, затем 403, затем запасной текст"
    - "Блок ошибки только при error && data === undefined и раньше состояния загрузки: во время повтора SWR снова ставит isLoading, блок остаётся на месте"

key-files:
  created:
    - app/web/lib/http/request.ts
    - app/web/lib/http/request.test.ts
    - app/web/lib/http/errors.ts
    - app/web/lib/http/errors.test.ts
    - app/web/lib/http/swr.ts
    - app/web/lib/http/swr.test.ts
    - app/web/lib/http/download.ts
    - app/web/lib/http/download.test.ts
    - app/web/components/feedback/LoadErrorAlert.tsx
    - app/web/lib/settings/api.ts
    - app/web/lib/settings/api.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/settings/chart/ChartSettingsPageClient.tsx

key-decisions:
  - "request.ts импортирует failureMessage из errors.ts, errors.ts импортирует RequestError из request.ts: цикл только внутри тел функций, на верхнем уровне модулей вызовов нет; третьего файла в files_modified нет"
  - "Метод по умолчанию: GET без тела, POST при json или body; Content-Type ставится только при json и только если вызывающий его не задал"
  - "RequestError.message равен failure.message (для auth и aborted пустая строка), чтобы failureOf возвращал готовый текст без пересчёта"
  - "failureOf(AuthExpiredError) даёт auth: блок не рисуется, даже если вызывающий бросил исходную ошибку сессии"
  - "readApiError(body) принимает разобранное тело и возвращает только текст с кириллицей, иначе null"
  - "exportFailureMessage для 403 всегда даёт полный текст 403 (Поверхность 6), для network со status — «Не удалось скачать архив. Попробуйте ещё раз.»"
  - "getChartRange возвращает RequestOutcome (не бросает), как и saveChartRange"
  - "Фокус после успешного повтора переносится в cleanup useLayoutEffect блока: он выполняется до удаления DOM-узла блока, поэтому видно, был ли фокус внутри"

duration: ~35min
completed: 2026-10-05
---

# Phase 8 Plan 04: типизированный модуль запросов и блок ошибки загрузки (HTTP-01) Summary

Модуль `app/web/lib/http` поверх `apiFetch` с исходом `{ ok, kind, status, message, body }`, тексты отказов Поверхностей 2 и 6, строковые фетчеры SWR, проверка конца центрального каталога ZIP, компонент `LoadErrorAlert` с «Повторить» и экран диапазона графика, переведённый на модуль как трассер.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `gsd/phase-08`.

## Что сделано

- Task 1 (tracer): `lib/http/request.ts` (`createRequester(fetchImpl)`, модуль по умолчанию на `apiFetch` из `lib/session/client`, реэкспорт `AuthExpiredError`), `lib/http/swr.ts`, `lib/settings/api.ts` (`settingsKeys.chartRange()`, `parseChartRange`, `chartRangeFetcher`, `getChartRange`, `saveChartRange`), экран `ChartSettingsPageClient.tsx` на `useSWR(settingsKeys.chartRange(), chartRangeFetcher, { revalidateOnFocus: false })` и `saveChartRange`; импорты `@/lib/fetcher` и `@/lib/api-fetch` из экрана ушли. Шлюз tracer: `vitest run lib/http lib/settings` (34 passed) и `typecheck` повторены после реализации — зелёные, затем расширение.
- Task 2: `lib/http/errors.ts` (полные тексты), `requestBlob` (имя из `filename*=UTF-8''…`, затем `filename=`, затем запасное), `lib/http/download.ts` (`saveBlob`, `hasZipEndOfCentralDirectory`).
- Task 3: `components/feedback/LoadErrorAlert.tsx` по разметке Поверхности 1; на экране блок «Не удалось загрузить настройку» в `CardContent` вместо `Select` и «Сохранить», `onRetry` — `mutate()`, фокус после успешного повтора — `CardTitle` с `tabIndex={-1}`.

## Итоговые сигнатуры

Совпадают с `<interfaces>` плана. Дополнительно экспортируются типы `BlobRequestOptions`, `FetchImpl` (`request.ts`) и `LoadErrorView` (`errors.ts`); у `request` и `requestJson` параметр типа по умолчанию `unknown`. `createRequester` возвращает `{ request, requestJson, requestBlob }` с теми же сигнатурами, что и модульные функции.

```typescript
export function request<T = unknown>(url: string, options?: RequestOptions<T>): Promise<RequestOutcome<T>>
export function requestJson<T = unknown>(url: string, options?: RequestOptions<T>): Promise<T>
export function requestBlob(url: string, options: BlobRequestOptions): Promise<RequestOutcome<{ blob: Blob; filename: string }>>
```

## codegraph impact (по индексу основного дерева: в worktree `.codegraph/` нет)

- `apiFetch` (`lib/session/client.ts:162`): 144 затронутых символа в 43 файлах — `lib/drafts/question-draft-api.ts`, `use-question-draft-autosave.ts`, `admin/tests/TestsClient.tsx`, `test-editor-api.ts`, `useTestEditorModel.ts`, `components/groups/GroupSheet.tsx` и далее. Сам `apiFetch` не менялся; модуль только вызывает его.
- `fetcher` из `lib/fetcher.ts` (`--file`): 1 символ — сама функция; по общему имени `fetcher` 17 локальных определений в экранах (`GroupsClient`, `rbac/page`, `TestsClient`, `TopicTestsClient` и др.). Единственный импортёр `lib/fetcher` — `ChartSettingsPageClient.tsx` (виден в графе `fetcher` у `GroupsClient` как файл-сосед по имени); после плана импортёров нет, файл не удалён (удаление — 08-23).
- `ChartSettingsPageClient`: 4 символа — функция, `admin/settings/chart/page.tsx` (`ChartSettingsPage`), маршрут `/web/app/admin/settings/chart`.

## codegraph affected

`codegraph affected` по всем файлам плана: `No test files affected by the changed files.` Новые файлы `lib/http/*`, `lib/settings/*`, `components/feedback/*` в индексе основного дерева отсутствуют; у экрана диапазона графика тестов и e2e-сценариев нет. Тесты плана прогнаны напрямую и в `yarn verify`.

## TDD

- RED (Task 1): `yarn workspace @bio-exam/web vitest run lib/http lib/settings` — `Test Files 3 failed (3)`, `Tests no tests`: модули `./request`, `./swr`, `@/lib/settings/api` отсутствовали.
- GREEN (Task 1): `Test Files 3 passed (3)`, `Tests 34 passed (34)`.
- RED (Task 2): `vitest run lib/http` — `Test Files 3 failed | 1 passed (4)`, `Tests 18 failed | 39 passed (57)`: `download.ts` отсутствовал, `readApiError`/`loadErrorView`/`exportFailureMessage` не экспортировались, 413 давал заглушку вместо текста сервера.
- GREEN (Task 2): `vitest run lib/http lib/settings` — `Test Files 5 passed (5)`, `Tests 70 passed (70)`.

## Deviations from Plan

1. **Порядок работ:** `requestBlob` написан в Task 1 вместе с ядром (общие `send`, `readText`, `httpFailure`); его тесты добавлены в Task 2, как в плане. Пять из семи тестов `requestBlob` были зелёными уже на RED Task 2; красным был 413 (текст из заглушки `failureMessage`).
2. **[Rule 2] `failureOf(AuthExpiredError)` → `auth`:** behavior плана называл только `RequestError` и «прочее → network». Без этой ветки исходная ошибка сессии, брошенная вызывающим мимо модуля, дала бы блок «Нет связи с сервером…» во время перехода на вход.
3. **Блок ошибки раньше состояния загрузки на экране:** при повторе SWR снова ставит `isLoading` (данных нет), и при старом порядке блок сменялся бы на «Загрузка…», кнопка теряла бы фокус, а `aria-busy` не был бы виден. Порядок: блок при `error && data === undefined`, затем «Загрузка…», затем форма.
4. **auth на экране:** `LoadErrorAlert` ничего не рисует, поэтому `CardContent` пуст до перехода на вход (раньше там было бы «Загрузка…» до ответа). Переход делает `apiFetch` сразу.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. T-8-07: модуль вызывает только `apiFetch` из `lib/session/client`, тесты `AuthExpiredError → auth` и `401 при недоступном refresh → http 401`. T-8-08: тексты 5xx и тексты без кириллицы не показываются (тесты `failureMessage`). T-8-09: `parseChartRange` бросает `MalformedBodyError` на `{ error }` и чужие значения, не-2xx — `kind http`. T-8-SC: установок пакетов нет.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/http lib/settings` — 5 файлов, 70 passed.
- `yarn workspace @bio-exam/web typecheck` — без ошибок.
- `yarn workspace @bio-exam/web lint` — в файлах плана предупреждений нет, кроме старого `react(set-state-in-effect)` у `useEffect(() => setSelected(...))` экрана (строка не менялась).
- `yarn oxfmt --check` по файлам плана — формат верный; комментариев в коде нет.
- `LoadErrorAlert.tsx`: «Повторить», `aria-busy`, `aria-disabled`; атрибута `disabled` у кнопки нет.
- `yarn verify` — `yarn verify: OK` (web 57 файлов тестов / 1095 тестов, server 65, exam-core 12, rbac 1).
- `yarn e2e` — код 0, `178 passed (1.4m)` на chromium-desktop и chromium-mobile; четыре отметки `✘` — ожидаемые `test.fail()` проверок `promptText` из 08-01 (известный дефект до 08-07), не падения. Сборка `next build` с файлами плана прошла.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-04` — `08-04 changed only its files`.
- Находки вне плана (`lib/swr-config.ts` без импортёров, старое предупреждение `set-state-in-effect` экрана) записаны в `deferred-items.md`.

## Файлы к коммиту

- app/web/lib/http/request.ts
- app/web/lib/http/request.test.ts
- app/web/lib/http/errors.ts
- app/web/lib/http/errors.test.ts
- app/web/lib/http/swr.ts
- app/web/lib/http/swr.test.ts
- app/web/lib/http/download.ts
- app/web/lib/http/download.test.ts
- app/web/components/feedback/LoadErrorAlert.tsx
- app/web/lib/settings/api.ts
- app/web/lib/settings/api.test.ts
- app/web/app/(internal)/(protected)/admin/settings/chart/ChartSettingsPageClient.tsx
- .planning/phases/08-client-requests-runtime-and-decomposition/08-04-SUMMARY.md
- .planning/phases/08-client-requests-runtime-and-decomposition/deferred-items.md (две строки 08-04)

## Передачи между планами

- 08-05 … 08-23 (все переводы HTTP-02): ключ SWR — только строка из `*Keys.*()` доменного слоя; фетчер с `parse` создаётся на уровне модуля слоя через `fetcherWith(parse)`, не в теле компонента и не в кортеже ключа. Для общих ключей (`/api/users`, `/api/tests`, `/api/tests/topics`, `/api/rbac/roles`, `/api/groups`) `parse` только проверяет конверт и возвращает тело без преобразования.
- `parse` бросает `MalformedBodyError` (экспорт `lib/http/request`); любой бросок `parse` даёт `kind: 'malformed'` со status ответа. `parse` применяется только к 2xx; тело не-2xx лежит в `failure.body` (разобранный JSON или `undefined`) — для `AttemptRequestError` (`code`, `attemptId`) в 08-23.
- Экраны: блок `LoadErrorAlert` при `error && data === undefined` и раньше ветки загрузки (иначе при повторе блок сменится на загрузку); ошибка ревалидации при данных — без блока и тоста; экран с локальной формой из данных SWR передаёт `revalidateOnFocus: false`. Заголовки — из таблицы Поверхности 1; `focusTarget` — ref заголовка с `tabIndex={-1}`.
- Тосты действий: `failureMessage(outcome, '<запасной текст вызывающего>')`; пустая строка (auth, aborted) — тоста нет. Текст 5xx сервера не показывается даже на русском; 403 без русского текста — полный текст 403 при любом запасном.
- `readApiError(body)` модуля принимает разобранное тело и возвращает только русский текст или `null`. Старый `readApiError(response, fallback)` в `test-editor-api.ts` (его импортирует и `TestsClient.tsx`) другой сигнатуры остаётся до перевода в 08-11.
- 08-11 (экспорт): `requestBlob(url, { filename: 'test.zip' | \`${topicSlug}.zip\`, fallbackMessage: 'Ошибка экспорта' })`; при ok — `hasZipEndOfCentralDirectory(blob)` перед `saveBlob`; усечённый архив обрабатывать как `{ kind: 'network', status }` и показывать `exportFailureMessage(failure, 'Ошибка экспорта')` — это даёт «Не удалось скачать архив. Попробуйте ещё раз.».
- 08-23: `lib/fetcher.ts` больше никем не импортируется; `lib/swr-config.ts` не импортировался и до плана; `lib/api-fetch.ts` импортируют 24 файла web.
- 08-28: вид блока на 375px и перенос фокуса после повтора проверяются в браузере (ниже).

## Состояние планирования

- STATE.md, ROADMAP.md и REQUIREMENTS.md не менялись (как в 08-01 … 08-03): общий `.planning` у параллельных worktree, отметку HTTP-01/HTTP-02 и продвижение плана делает оркестратор.

## Deferred human verification

- Вид блока «Не удалось загрузить настройку» на экране «Диапазон графика» при недоступном сервере на 375px и на десктопе (Поверхность 1, backstop): кнопка «Повторить» во всю ширину ниже `mob`, высота 44px, причина переносится по словам; во время повтора `Loader2` и `aria-busy`; после успешного повтора фокус на заголовке карточки. Сводно в 08-28: e2e-сценария этого экрана нет, а Vitest веба идёт без DOM.
- Коммит файлов плана делает ведущая сессия.

## Self-Check: PASSED

Все 11 созданных файлов и SUMMARY на месте, экран изменён; `commits: 0` — по правилу пользователя изменения оставлены в рабочем дереве.
