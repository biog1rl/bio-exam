---
phase: 13-token-qr-and-phone-page
plan: 05
subsystem: web
tags: [react, swr, upload-queue, photo-transport, object-url]

requires:
  - phase: 13-token-qr-and-phone-page
    provides: "13-03: app/web/lib/upload-link/api.ts (listLinkPhotos, uploadLinkPhoto, deleteLinkPhoto, loadLinkThumb); 13-04: линия web"
provides:
  - "transport.ts: PhotoTransport, sessionPhotoTransport(target), linkPhotoTransport(token)"
  - "очередь фото: sync(photos, since) и mark(), обязательный maxCount"
  - "use-answer-photos: SessionPhotoHandle, createLinkPhotoHandle(token, maxCount), usePhotoListSync(handle, { intervalMs, enabled })"
  - "PhotoBlock: actions, touch, миниатюра из транспорта (url или blob), PhotoViewer только при fullView"
affects: [13-06, 13-07, 13-08]

actuals:
  tokens: 9500
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "транспорт фото — объект с list/upload/remove/thumb/fullView и ключом опроса без токена; адаптеры сессии и ссылки"
    - "сверка очереди с ответом списка по метке mark(), снятой до запроса"

key-files:
  created:
    - app/web/components/tests/answer-photos/transport.ts
  modified:
    - app/web/components/tests/answer-photos/upload-queue.ts
    - app/web/components/tests/answer-photos/upload-queue.test.ts
    - app/web/components/tests/answer-photos/use-answer-photos.ts
    - app/web/components/tests/answer-photos/PhotoBlock.tsx
    - app/web/components/tests/answer-photos/SubmittedPhotos.tsx

key-decisions:
  - "Защита от устаревшего ответа опроса — монотонная метка очереди mark() вместо времени: снимается до запроса списка, sync(photos, since) не убирает done с меткой завершения позже since и не возвращает фото, удалённые локально позже since"
  - "count после sync — число done в очереди; в установившемся состоянии равно длине списка сервера, а свежая локальная загрузка, которой ещё нет в устаревшем ответе, считается"
  - "seed — синоним sync; useAnswerPhotos и primeListing ходят через listInto, который снимает mark() до transport.list()"
  - "maxCountOf у useAnswerPhotoSession обязателен; ANSWER_PHOTO_MAX_COUNT остаётся в TestRunner как запасное значение вопроса без maxPhotos"
  - "usePhotoListSync не бросает из fetcher: SWR 2.3.8 при закэшированной ошибке пропускает опрос по интервалу (node_modules/swr/dist/index/index.mjs:598, !getCache().error), поэтому неудача возвращается значением и считается в onSuccess"
  - "fullView у транспорта: sessionPhotoTransport — true (PhotoViewer по answerPhotoUrl), linkPhotoTransport — false (миниатюра не кликабельна, PhotoViewer не монтируется)"

patterns-established:
  - "Новый источник фото — новый адаптер PhotoTransport; PhotoBlock и очередь не знают адресов"

requirements-completed: [QR-02, QR-05]

coverage:
  - id: D1
    description: "sync очереди: добавляет фото сервера, убирает удалённые, не трогает активные, сбойные, отклонённые и удаляемые, не дублирует, устаревший ответ не стирает свежее и не возвращает удалённое, тот же список не меняет снимок"
    requirement: QR-05
    verification:
      - kind: unit
        ref: "app/web/components/tests/answer-photos/upload-queue.test.ts#sync"
        status: pass
    human_judgment: false
  - id: D2
    description: "Лимит очереди только из maxCount вопроса"
    requirement: QR-02
    verification:
      - kind: unit
        ref: "app/web/components/tests/answer-photos/upload-queue.test.ts#лимит берётся из maxCount вопроса"
        status: pass
    human_judgment: false
  - id: D3
    description: "Раннер на компьютере грузит, показывает и удаляет фото через sessionPhotoTransport"
    requirement: QR-05
    verification:
      - kind: e2e
        ref: "e2e/tests/answer-photos.spec.ts (chromium-desktop и chromium-mobile)"
        status: pass
    human_judgment: false
  - id: D4
    description: "linkPhotoTransport, blob-миниатюра с revokeObjectURL, usePhotoListSync, actions и touch"
    requirement: QR-02
    verification: []
    human_judgment: true
    rationale: "Потребителей ещё нет (страница телефона 13-06, диалог QR 13-07); vitest в web без DOM, хук и компонент проверяются e2e этих планов"

duration: 30min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 05: транспорт фото и сверка очереди Summary

**`PhotoBlock` и очередь работают через `PhotoTransport` с двумя адаптерами: сессия по cookie и ссылка по токену в заголовке, у ссылки миниатюры через object URL. Очередь умеет `sync` со списком сервера и не стирает свежие фото устаревшим ответом. `usePhotoListSync` опрашивает список и считает неудачи подряд. У `PhotoBlock` появились места `actions` и режим `touch`**

## Performance

- **Duration:** около 30 мин
- **Tasks:** 2 из 2
- **Files modified:** 6 (1 новый, 5 изменённых)

## Accomplishments

- `transport.ts`: `PhotoTransport = { key, list, upload, remove, thumb, fullView }`. `thumb` бывает двух видов: `{ kind: 'url', src }` и `{ kind: 'blob', load(photoId, signal) }`.
  - `sessionPhotoTransport(target)` построен на `answer-photos-api.ts`, ключ `answer-photos:<testId>:<sessionId>:<questionId>`, миниатюра `answerPhotoUrl(id, 'thumb')`.
  - `linkPhotoTransport(token)` построен на `lib/upload-link/api.ts`. Строка ключа: `const LINK_PHOTOS_KEY = 'upload-link:photos'`. Миниатюра — `blob` через `loadLinkThumb`, при неудаче `null`.
- `upload-queue.ts`: `maxCount` обязателен, импорт `ANSWER_PHOTO_MAX_COUNT` убран. Метка `settledMark` ставится при завершении загрузки и при добавлении из списка; локальные удаления и удаления сверкой оставляют надгробие с меткой. `sync(photos, since = mark())`:
  - добавляет фото сервера как `done` перед первым незавершённым элементом;
  - убирает `done` без флага удаления, которых нет на сервере, если они завершились не позже `since`;
  - не возвращает фото, удалённое позже `since`;
  - не трогает остальные статусы;
  - зовёт подписчиков только при изменении.
- `use-answer-photos.ts`:
  - ручка `{ transport, queue, listed, markListed }`, у сессии ещё `target` (`SessionPhotoHandle`, его читает `SubmittedPhotos` для «Готово»);
  - `listInto(handle)` снимает `mark()`, зовёт `transport.list()` и сверяет;
  - `createLinkPhotoHandle(token, maxCount)`;
  - `usePhotoListSync(handle, { intervalMs, enabled })`: SWR с ключом `handle.transport.key` (`null` при `!enabled`), `refreshInterval`, `refreshWhenHidden: false`, `revalidateOnReconnect: true`, `shouldRetryOnError: false`. Отдаёт `{ failures, lastFailure }`, на успехе сброс.
- `PhotoBlock.tsx`:
  - `Thumbnail` по источнику транспорта: `url` — прежний `img`, `blob` — загрузка с `AbortController`, `URL.createObjectURL`, `revokeObjectURL` при смене фото и размонтировании, неудача — значок `ImageOff`;
  - `PhotoViewer` монтируется и миниатюра кликабельна только при `transport.fullView`;
  - `actions` рисуется после кнопок источников;
  - `touch` даёт кнопки источников и строк `h-11` без `tab:h-8`.
- Экспорты `PhotoViewer` и `answerPhotoUrl` не менялись.

## codegraph impact

Индекс основного checkout (`/Users/kdvornichenko/bio-exam/.codegraph`; в worktree каталога нет, код символов на HEAD 8ec1d20 тот же):

```
useAnswerPhotos — 7: use-answer-photos.ts useAnswerPhotos:111; PhotoBlock.tsx PhotoBlock:202; TestRunner.tsx AttemptRunner:103; SubmittedPhotos.tsx SubmittedPhotos:27 (+ файлы)
createPhotoUploadQueue — 6: upload-queue.ts:82; use-answer-photos.ts createQueueHandle:31, createSessionRegistry:50; upload-queue.test.ts setup:56 (+ файлы)
AnswerPhotoQueueHandle — 16: use-answer-photos.ts (createQueueHandle, createSessionRegistry, primeListing, createCountStore, useAnswerPhotos, AnswerPhotoSession, useAnswerPhotoSession, useAnswerPhotoCounts, SessionRegistry); PhotoBlock.tsx (PhotoBlock, PhotoBlockProps); SubmittedPhotos.tsx (Props, SubmittedPhotos)
```

Других вызывающих вне `answer-photos` и `TestRunner` нет. `TestRunner` правок не потребовал: `maxCountOf` он уже передавал.

## Проверки

- `yarn workspace @bio-exam/web test components/tests/answer-photos` — 2 файла, 46 passed (в том числе `sync` — 6 случаев `test.each` и «тот же список не меняет снимок»).
- `yarn workspace @bio-exam/web typecheck` — 0; `lint` — 0. Предупреждение `next(no-img-element)` на `PhotoBlock.tsx` было и до плана: тот же `<img>`.
- `node --test scripts/*.test.mjs` — 193/193; после правки хука повторно `web-requests-guards` и `api-routes-have-callers` — 6/6.
- `yarn e2e e2e/tests/answer-photos.spec.ts` — 30 passed, desktop и mobile, 44 с.
- `yarn format:check` — 0.
- Критерии приёмки:
  - `ANSWER_PHOTO_MAX_COUNT` в `answer-photos` нет;
  - `listAnswerPhotos(`, `uploadAnswerPhoto(`, `deleteAnswerPhoto(` вызываются только в `transport.ts`;
  - `revokeObjectURL` есть в `PhotoBlock.tsx:83`, `refreshWhenHidden: false` — в `use-answer-photos.ts`;
  - ключ ссылки — константа без интерполяции (строка выше).

## Task Commits

1. **Task 1 (tracer): очередь со sync и транспорт сессии** — не закоммичено
2. **Task 2: адаптер ссылки, опрос списка, места для телефона и QR** — не закоммичено

## Files Created/Modified

- `app/web/components/tests/answer-photos/transport.ts` — транспорт и два адаптера
- `app/web/components/tests/answer-photos/upload-queue.ts` — `sync`, `mark`, обязательный `maxCount`
- `app/web/components/tests/answer-photos/upload-queue.test.ts` — `maxCount` в фабрике, сообщение `answerPhotoLimitMessage(MAX)`, лимит вопроса, таблица `sync`
- `app/web/components/tests/answer-photos/use-answer-photos.ts` — ручка на транспорте, `SessionPhotoHandle`, `createLinkPhotoHandle`, `usePhotoListSync`
- `app/web/components/tests/answer-photos/PhotoBlock.tsx` — миниатюры из транспорта, `fullView`, `actions`, `touch`
- `app/web/components/tests/answer-photos/SubmittedPhotos.tsx` — тип `SessionPhotoHandle`

## Decisions Made

См. `key-decisions`. Главное:
- Метка `mark()` вместо времени. Сквад формулировал это как «метка старта против времени завершения»; монотонный счётчик даёт то же, но не зависит от часов и не требует общего `now` у хука и очереди.
- `count` после `sync` равен числу `done`.
- `seed` теперь синоним `sync` и может убрать `done`, которых нет в списке; напрямую его зовут только тесты.

## Deviations from Plan

1. **[Rule 1] `usePhotoListSync` не бросает из fetcher.** Первая версия бросала ошибку при неудаче списка. В SWR 2.3.8 интервальный опрос при закэшированной ошибке пропускается (`if (!getCache().error && …)` в `node_modules/swr/dist/index/index.mjs:598`). После первой неудачи опрос встал бы, а `failures` застрял бы на 1: это ломает «число неудач подряд» и текст 13-07 «нет связи после 2 неудач». Теперь fetcher возвращает исход, неудача считается в `onSuccess`, исключения перехвачены как сетевая неудача. Опции плана сохранены; `shouldRetryOnError: false` теперь ни на что не влияет.
2. **Порядок задач.** Код задачи 2 (адаптер ссылки, blob-миниатюра, `actions`/`touch`, `usePhotoListSync`) написан до tracer-проверки задачи 1. Ворота задачи 1 (юниты, typecheck, lint, e2e `answer-photos.spec.ts`) прогнаны один раз на полном коде и зелёные. На результат это не влияет.

## Issues Encountered

- Случай `sync` «не трогает идущие…» сначала ждал `uploading`, а получил `preparing`: не хватало шага таймеров после `add`. Поправлен сам тест.

## User Setup Required

None.

## Next Phase Readiness

- 13-06 (телефон):
  - `createLinkPhotoHandle(token, maxCount)` и `<PhotoBlock photos={handle} sources={['camera','gallery']} touch disabled={…} />`;
  - `usePhotoListSync(handle, { intervalMs: 2500, enabled })` для фото с компьютера;
  - миниатюры по ссылке не кликабельны, `PhotoViewer` не монтируется.
- 13-07 (диалог QR): `usePhotoListSync(photoSession.photosFor(questionId), { intervalMs: 2500, enabled: dialogOpen && windowOpen })`; `failures >= 2` — строка «Нет связи с сервером…»; кнопка «С телефона» передаётся в `PhotoBlock` через `actions`.
- Ключ SWR у ссылки постоянный: на странице телефона одна ссылка за раз.
- Не проверено: хук `usePhotoListSync` и blob-миниатюра без DOM-тестов (vitest в web — `node`). Их проверяют e2e 13-06 и 13-07.

## Self-Check: PASSED

- FOUND: app/web/components/tests/answer-photos/transport.ts
- Коммитов нет по правилам фазы (не закоммичено), изменения в рабочем дереве worktree.

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
