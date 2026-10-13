---
phase: 08-client-requests-runtime-and-decomposition
plan: 22
subsystem: web/search, web/editor (картинки и медиатека)
tags: [HTTP-02, D-05, D-06, D-08, D-09, search, assets, abort]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: request, requestJson, RequestOutcome, RequestError, MalformedBodyError, failureMessage, loadErrorView, LoadErrorAlert
  - phase: 08-07
    provides: редактор рендерится на сервере без document/window, editor.ssr.test.ts
  - phase: 08-21
    provides: образец загрузки без SWR с блоком ошибки (new RequestError(outcome), loadedRef, auth/aborted без изменений)
provides:
  - lib/search/api.ts — searchAll(query, scope?, limit?, signal?) → RequestOutcome<SearchResponse>, parseSearchResponse
  - lib/assets/api.ts — assetsKeys.page, listAssets, uploadAsset(FormData), deleteAsset({ path }), fetchSignedUrl, parseAssetsPage, parseUploadedAsset, parseSignedUrl, UPLOAD_FAILED_MESSAGE; типы AssetsPage, UploadedAsset, DeleteAssetBody
  - глобальный поиск с отменой прежнего запроса и блоком «Не удалось выполнить поиск»
  - медиатека, вставка картинки и вставка перетаскиванием на модуле запросов; блок «Не удалось загрузить изображения» в «Библиотеке»
affects: [08-23, 08-25, 08-28]

actuals:
  tokens: 9800
  tasks: 3
  commits: 0
plan_head_before: 8b704feccdebe307b529da1c8337896e908a8b0f
plan_head_after: 8b704feccdebe307b529da1c8337896e908a8b0f

tech-stack:
  added: []
  patterns:
    - "Поиск с отменой: AbortController в ref; новый запрос и cleanup эффекта отменяют прежний; ответ применяется, только если его контроллер всё ещё текущий; aborted и auth состояние не меняют"
    - "Загрузка картинок через FormData в request({ body }) без Content-Type; текст отказа — failureMessage(outcome, UPLOAD_FAILED_MESSAGE), пустая строка (auth) — без тоста"

key-files:
  created:
    - app/web/lib/assets/api.ts
    - app/web/lib/assets/api.test.ts
    - app/web/lib/search/api.test.ts
  modified:
    - app/web/lib/search/api.ts
    - app/web/components/Search/SearchDialog.tsx
    - app/web/lib/image-signed-url-cache.ts
    - app/web/lib/image-signed-url-cache.test.ts
    - app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx
    - app/web/components/editor/plugins/images-plugin.tsx
    - app/web/components/editor/plugins/drag-drop-paste-plugin.tsx

key-decisions:
  - "searchAll без fallbackMessage: заголовок блока уже «Не удалось выполнить поиск», при 5xx причина — «Ошибка сервера (код N).», а не повтор заголовка (решение исполнителя, автономно)"
  - "Фокус после успешного «Повторить» в поиске — поле «Введите запрос» (focusTarget = ref CommandInput): UI-SPEC держит фокус поиска в поле (решение исполнителя, автономно)"
  - "Блок ошибки поиска стоит внутри области результатов (padded div в CommandList) вместо AnimatePresence; motion.div и его параметры не менялись (08-25)"
  - "При ошибке видна только вкладка «Все»: visibleTabs = ['all'], results сбрасывается, tab = 'all'"
  - "Медиатека: блок — только пока первая страница ни разу не загрузилась (loadedRef, как 08-21); перезагрузка первой страницы после загрузки файла при уже показанной сетке даёт прежний тост «Не удалось загрузить изображения», сетка остаётся (решение исполнителя, автономно)"
  - "fetchSignedUrl лежит в lib/assets/api.ts (requestJson + parseSignedUrl, бросает RequestError); image-signed-url-cache.ts вызывает его, кэш и TTL 50 минут прежние"
  - "Тексты удаления — deleteErrorMessage(outcome.status ?? 0, outcome.body) из delete-error.ts, как в 07; auth/aborted — без текста"
  - "Типы types/assets.d.ts не менялись (вне allow-list): AssetsPage и UploadedAsset — псевдонимы AssetsListResponse и UploadAssetResponse"

metrics:
  duration: 25min
  completed: 2026-10-05
---

# Phase 8 Plan 22: Глобальный поиск с отменой, ссылки на картинки и медиатека на модуле запросов Summary

Поиск идёт через `request` с `signal`: новый ввод отменяет прежний запрос, отказ показывает блок «Не удалось выполнить поиск» вместо «Ничего не найдено…»; подписанные ссылки, медиатека и обе загрузки картинок в редакторе переведены на `lib/assets/api.ts` поверх `apiFetch` (401 теперь уходит в веб-сессию).

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

- **Задача 1 (tracer).** `lib/search/api.ts`: `searchAll(query, scope = 'all', limit = 10, signal?)` → `request('/api/search?q=&scope=&limit=', { parse: parseSearchResponse, signal })`; `parseSearchResponse` проверяет объект с массивом `categories`, тело отдаёт как есть. `SearchDialog.tsx`: `runSearch(q)` с `AbortController` в ref; задержка 300 мс и порог 2 символа прежние; cleanup эффекта и закрытие диалога отменяют запрос; ответ отменённого или устаревшего контроллера не применяется; `auth` — ничего; `network`/`malformed`/`http` — `LoadErrorAlert` «Не удалось выполнить поиск» в области результатов, видна только вкладка «Все», «Повторить» (скрыта при 403/404) вызывает `runSearch` с тем же запросом без задержки. Тексты «Введите минимум 2 символа для поиска», «Ищем…», «Ничего не найдено в разделе "…"» не менялись. Проверка гейта tracer: `vitest run lib/search` повторён после SearchDialog — зелёный.
- **Задача 2.** `lib/assets/api.ts`: `assetsKeys.page(limit, offset)`, `listAssets` (проверка `{ assets: [], total: number }`), `uploadAsset(form)` (POST, `body: FormData`, без Content-Type, запасной текст «Не удалось загрузить изображение»), `deleteAsset({ path })` (DELETE с JSON-телом, как раньше), `fetchSignedUrl(src)` (GET `/api/docs/assets/signed?path=<encoded>`, `{ signedUrl: string }` → строка, иначе `RequestError`). `image-signed-url-cache.ts` берёт `fetchSignedUrl`, кэш и TTL прежние. `MediaLibrary.tsx`: первая страница — `listAssets`, отказ — блок «Не удалось загрузить изображения» во вкладке «Библиотека» вместо тоста и «Изображения ещё не загружены», «Повторить» перезагружает первую страницу; «Загрузить ещё» при отказе — прежний `toast.error('Не удалось загрузить изображения')`; удаление — `deleteAsset` + `deleteErrorMessage`; загрузка — `uploadAsset` + `failureMessage(…, 'Не удалось загрузить изображение')`. `images-plugin.tsx` и `drag-drop-paste-plugin.tsx` — `uploadAsset`, тот же текст, `auth` без тоста. Классы анимаций не тронуты.
- **Задача 3.** `codegraph affected`, `yarn verify`, `yarn e2e`, сверка файлов — ниже.

## codegraph

`codegraph impact` (до правок, индекс основного дерева):
- `searchAll` (web `lib/search/api.ts:4`) → `SearchDialog.tsx`; одноимённая функция в `app/server/src/routes/teacher-zone-search.matrix.test.ts:116` к web не относится.
- `getSignedUrl` → `prefetchSignedUrls`, `image-signed-url-cache.test.ts`, `MdxRenderer.tsx` (`MdxImage`, `MdxRenderer`), `TestRunner.tsx` (`AttemptRunner`), `editor-ui/image-component.tsx` (`ImageComponent`), `nodes/image-node.tsx` (`decorate`). Сигнатура `getSignedUrl` не менялась.
- `MediaLibrary` → `toolbar/block-insert/insert-media-library.tsx` (`InsertMediaLibrary`), `editor/plugins.tsx`.
- `ImagesPlugin` → `editor/plugins.tsx`.
- `DragDropPastePlugin` → `editor/plugins.tsx`.

`codegraph affected` по файлам плана (44 файла; лог `scratchpad/08-22-affected.txt`): web — `lib/image-signed-url-cache.test.ts`, `lib/assets/delete-error.test.ts`, `components/tests/MdxRenderer.tsx`, `components/tests/TestRunner.tsx`, `admin/tests/components/QuestionEditor.tsx`, `admin/tests/layout.tsx`, `admin/tests/question-types/layout.tsx`, `admin/tests/scoring/layout.tsx`; server — 36 тестов (связь по путям `/api/docs/assets` и общим именам: `assets.characterization.test.ts`, `uploads.test.ts`, `storage.*`, `question-content/*`, `access-policy/*` и др.). Все входят в `yarn verify` и зелёные.

## Проверки

| Проверка | Итог |
|----------|------|
| `yarn workspace @bio-exam/web vitest run lib/search` | 7 passed (RED до реализации: 6 failed) |
| `yarn workspace @bio-exam/web vitest run lib/assets lib/image-signed-url-cache.test.ts` | 4 файла, 36 passed (RED: 3 failed + `api.test.ts` без модуля) |
| `yarn workspace @bio-exam/web vitest run components/editor …` (вкл. `editor.ssr.test.ts`) | 10 файлов, 101 passed — редактор на сервере рендерится с новым графом импортов |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| проверка «нет голого fetch / fetcher / lib/api-fetch» в шести файлах | `search and images ok` |
| `yarn verify` (финальный прогон после всех правок) | `yarn verify: OK`; web 72 файла / 1379 тестов, server 76 / 1670, exam-core 605, rbac 9 |
| `yarn e2e` | 194 passed (chromium-desktop и chromium-mobile), спецификации не правились |
| `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-22` | `08-22 changed only its files` |

Первый `yarn verify` тоже дал OK, но шёл параллельно с последней правкой `MediaLibrary.tsx` (loadedRef); поэтому после `yarn e2e` выполнен второй, финальный прогон — OK.

## TDD Gate Compliance

RED → GREEN соблюдён по сути без коммитов (правило пользователя): `lib/search/api.test.ts` написан и красный (6 failed) до правки `api.ts`; `lib/assets/api.test.ts` и перевод `image-signed-url-cache.test.ts` на `vi.mock('@/lib/session/client')` красные (3 failed, модуль не найден) до `lib/assets/api.ts` и правки кэша. REFACTOR не понадобился.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] «Загрузить ещё» сдвигал offset до ответа**
- **Found during:** Задача 2
- **Issue:** `handleLoadMore` увеличивал `offset` до запроса; после отказа повторное «Загрузить ещё» пропускало страницу.
- **Fix:** `offset` выставляется в `loadAssets` только при успехе (`setOffset(currentOffset)`); кнопка запрашивает `offset + PAGE_SIZE`.
- **Files modified:** `MediaLibrary.tsx`
- **Commit:** не выполнялся (правило пользователя)

**2. [Plan wording] Тест кэша ссылок потребовал не только замены подделки**
- `toHaveBeenCalledWith(url)` не подходит для `apiFetch(url, init)`; проверки переведены на список URL первых аргументов (`calledUrls()`), ответы — настоящие `Response`. Ожидания (один запрос в пределах 50 минут, повтор после, исключение на 400, prefetch только API-адресов) прежние.

Прочее — по плану.

## Threat Flags

Нет новой поверхности. T-8-50 (загрузка голым fetch без обновления сессии) закрыт: `uploadAsset`, `listAssets`, `deleteAsset`, `fetchSignedUrl` идут через `apiFetch`. T-8-51 (гонка ответов поиска) закрыт: ответ применяется только для текущего контроллера, прежний запрос отменяется. T-8-52 — выдача поиска и `snippetHtml` не менялись.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Блок ошибки поиска и медиатеки на 375px (Поверхности 1 и 5, backstop): открыть поиск, вызвать отказ (остановить API или ответить 500), убедиться, что блок в области результатов, «Повторить» во всю ширину, высота 44px, видна только вкладка «Все», фокус остаётся в поле; в редакторе открыть медиатеку при отказе `/api/docs/assets` — блок во вкладке «Библиотека». Сводно — в 08-28.
- Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-23: `@/lib/api-fetch` в web больше импортируют только `app/(internal)/(protected)/dashboard/DashboardClient.tsx` и `lib/session/client.test.ts`. `lib/search/api.ts` его не импортирует.
- 08-25 (reduced-motion, Поверхность 8): в `SearchDialog` блок `LoadErrorAlert` стоит в `div.min-h-full.px-2.py-3` внутри `CommandList` веткой `searchError ? <LoadErrorAlert/> : <AnimatePresence>…`; `motion.div`, `fadeVariants`, `blurFilter`, `animate-pulse` у «Ищем…» и `…` не менялись. В `MediaLibrary` блок стоит первой веткой в `ScrollArea` вкладки «Библиотека» (`loadError ? … : isLoading ? … : assets.length === 0 ? … : сетка`); классы миниатюры (`transition-transform group-hover:scale-105`) и кнопки удаления (`opacity-0 transition-all group-hover:opacity-100`, `title="Удалить"`) не тронуты — `aria-label` и `focus-visible:opacity-100` добавляет 08-25.
- 08-28: проверка 375px блоков поиска и медиатеки (см. Deferred).
- Все: картинки — `fetchSignedUrl`/`getSignedUrl`; загрузка — `uploadAsset(form)`; версию к адресам `/api/docs/assets/proxy?path=…` добавлять только через `versionedUrl` (этот план адреса не меняет).

## Файлы к коммиту

- app/web/lib/search/api.ts
- app/web/lib/search/api.test.ts (новый)
- app/web/components/Search/SearchDialog.tsx
- app/web/lib/image-signed-url-cache.ts
- app/web/lib/image-signed-url-cache.test.ts
- app/web/lib/assets/api.ts (новый)
- app/web/lib/assets/api.test.ts (новый)
- app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx
- app/web/components/editor/plugins/images-plugin.tsx
- app/web/components/editor/plugins/drag-drop-paste-plugin.tsx

## Self-Check: PASSED
