---
phase: 12-photos-on-session-authentication
plan: 06
subsystem: web
tags: [web, answer-photos, upload-queue, canvas, upload-window]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-03: контракт фото в @bio-exam/exam-core (ANSWER_PHOTO_MAX_COUNT, ANSWER_PHOTO_MAX_SIDE, ANSWER_PHOTO_LIMIT_MESSAGE, схемы ответов)"
provides:
  - "app/web/lib/tests/answer-photos-api.ts: uploadAnswerPhoto, listAnswerPhotos, deleteAnswerPhoto, answerPhotoUrl, AnswerPhotoTarget; все статические сегменты путей фото в одном файле"
  - "createPhotoUploadQueue: очередь без React, по одному, 3 автоповтора 1/3/9 с тем же photoId, лимит 5, безопасное удаление"
  - "prepareForUpload: уменьшение в браузере до ANSWER_PHOTO_MAX_SIDE, JPEG q0.8, возврат исходного файла при сбое"
  - "uploadWindowRefusalText(refusal, nowMs, action): тексты отказа окна для загрузки и удаления"
affects: [12-07, 12-08, 12-09, 13]

actuals:
  tokens: 8400
  tasks: 3
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Очередь фото — фабрика без React со швами clock/now, снимок для useSyncExternalStore"

key-files:
  created:
    - app/web/lib/tests/answer-photos-api.ts
    - app/web/components/tests/answer-photos/upload-queue.ts
    - app/web/components/tests/answer-photos/upload-queue.test.ts
    - app/web/components/tests/answer-photos/resize.ts
  modified:
    - app/web/lib/tests/upload-window.ts
    - app/web/lib/tests/upload-window.test.ts

key-decisions:
  - "Допущение 1 по умолчанию: текст отказа окна строит web по коду и uploadClosesAt; uploadWindowRefusalText получил третий аргумент action ('upload' | 'remove') по 12-UI-SPEC, расхождения 12-06 №1"
  - "Сообщение failed для 503 — readApiError(body), при отсутствии failureMessage (12-UI-SPEC, расхождения 12-06 №2)"
  - "Очередь строго последовательна и во время паузы повтора: следующий файл ждёт, удаление элемента в паузе снимает таймер и отпускает очередь"
  - "remove → 404: элемент убран, count = число оставшихся done; прочие ошибки удаления оставляют элемент с message"
  - "Признак removing (12-UI-SPEC №3, желательно) наружу не выведен: в 12-09-PLAN его нет; внутри очереди флаг есть и блокирует повторное удаление и retry"

requirements-completed: [PHOTO-02, PHOTO-06]

coverage:
  - id: D1
    description: "Очередь фото: по одному, 3 автоповтора тем же photoId, 4xx без повтора, лимит 5, удаление"
    requirement: PHOTO-02
    verification:
      - kind: unit
        ref: "app/web/components/tests/answer-photos/upload-queue.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Шестое фото отклоняется на клиенте текстом ANSWER_PHOTO_LIMIT_MESSAGE без запроса"
    requirement: PHOTO-06
    verification:
      - kind: unit
        ref: "app/web/components/tests/answer-photos/upload-queue.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Текст отказа окна для загрузки и удаления по UI-SPEC"
    requirement: PHOTO-02
    verification:
      - kind: unit
        ref: "app/web/lib/tests/upload-window.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 06: Клиент фото без React Summary

**Адреса API фото в одном файле через `request`, очередь `createPhotoUploadQueue` (по одному, три автоповтора 1/3/9 с тем же `photoId`, лимит 5 до запроса, удаление без «воскрешения»), уменьшение в браузере через `createImageBitmap` и canvas, тексты отказа окна для загрузки и удаления**

## Performance

- **Duration:** около 12 мин
- **Started:** 2026-10-16T15:20:00Z
- **Completed:** 2026-10-16T15:32:00Z
- **Tasks:** 3 из 3
- **Files modified:** 6 (4 новых, 2 изменённых)

## Accomplishments

- Tracer: один файл проходит `preparing → uploading → done`, `count` из ответа сервера, `upload` вызван с `photoId` из `randomId`.
- Таблицы `test.each`: повторяемые отказы (сеть, 500, 503 с текстом и без, 429, исключение в `upload`), отказы без повтора (413, 415, 400, 422 окна закрыто/нет, 422 с другим телом, `auth`, `aborted`), лимит 5 (пять готовых, семь разом, смесь готовых/сбойных/идущих/ожидающих), удаление (ok, 404, 422 закрыто/нет, сеть; `uploading` и ожидающий без удаления; пауза повтора; сбойное; отклонённое), `seed`, стабильность снимка.
- `upload-window.ts`: момент закрытия («в HH:mm» / «d MMM в HH:mm») вынесен во внутреннюю `closedMoment`, ею пользуются `uploadWindowView` и `uploadWindowRefusalText`; строки `uploadWindowView` в тесте не менялись и зелёные.
- `answer-photos-api.ts`: PUT с `FormData` (поле `file`), GET списка, DELETE, адрес раздачи `/api/answer-photos/:photoId/:variant`; ответы проверяются схемами exam-core; своего `fetch` нет.
- `resize.ts`: `createImageBitmap(file, { imageOrientation: 'from-image' })`, длинная сторона не больше `ANSWER_PHOTO_MAX_SIDE` без увеличения, JPEG q0.8, `bitmap.close()` и обнуление canvas в `finally`; ошибка, пустой контекст или `toBlob` с `null` → исходный файл.

## Таблица переходов очереди

| Исход | Статус | Повтор |
|-------|--------|--------|
| `add`, мест меньше 5 | `preparing` (ждёт очереди) → `uploading` | — |
| `add`, занято 5 мест (`done`, `preparing`, `uploading`, `retrying`, `failed`) | `refused`, `ANSWER_PHOTO_LIMIT_MESSAGE` | нет, `prepare`/`upload` не вызываются |
| 2xx | `done`, `photo` и `count` из ответа | — |
| сеть, исключение в `upload`, 5xx, 429 — попытки 1–3 | `retrying` | сам через 1000, 3000, 9000 мс тем же `photoId` |
| то же после трёх повторов | `failed`, `message`: 503 — `readApiError(body)` или `failureMessage`, прочие — `failureMessage` | «Повторить» (`retry`): счётчик сбрасывается, снова до трёх автоповторов |
| 422 с телом `UploadWindowRefusalSchema` | `refused`, `uploadWindowRefusalText(тело, now(), 'upload')` | нет |
| прочие 4xx (400, 413, 415, 422 с другим телом) | `refused`, `failureMessage` (кириллический `error` сервера) | нет |
| `auth`, `aborted`, `malformed` | `failed` | только вручную |
| `remove` у `done`/`retrying`/`failed` | таймер снят, очередь отпущена; ok → элемент убран, `count` из ответа; 404 → убран, `count` = оставшиеся `done`; 422 окна → остаётся, текст `'remove'`; прочее → остаётся с `message`, `retrying` → `failed` | — |
| `remove` у `preparing`/`uploading` | ничего | — |
| `remove` у `refused` | убран без запроса | — |
| `seed(photos)` | новые `done` в начало, `count = photos.length` | — |

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: tracer очереди** — не закоммичено
2. **Task 2: повторы, отказы, лимит, удаление, текст отказа окна** — не закоммичено
3. **Task 3: адреса API и уменьшение в браузере** — не закоммичено

## TDD

- RED: после записи таблиц Task 2 прогон `upload-queue.test.ts` упал (`TypeError: uploadWindowRefusalText is not a function`, остальные случаи против tracer-очереди не дошли до исполнения).
- GREEN: `vitest run upload-queue.test.ts upload-window.test.ts` — 2 файла, 53 теста, зелёные.

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests/answer-photos/upload-queue.test.ts lib/tests/upload-window.test.ts`: 53 passed.
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn workspace @bio-exam/web lint`: в файлах плана ни ошибок, ни предупреждений (остальные предупреждения — существующие).
- `node --test scripts/web-requests-guards.test.mjs scripts/api-routes-have-callers.test.mjs scripts/exam-core-no-private-copies.test.mjs`: 11 pass, 0 fail.
- `yarn verify: OK` с первого прогона (нагрузка 30 при параллельном api-исполнителе): rbac 37, exam-core 745, web 1690, server 2059, script-tests 236.
- Критерии приёмки по `grep`: `body: form` — 1, `fetch(` в `answer-photos-api.ts` — 0, `from 'react'` в очереди — 0, литералы `UPLOAD_WINDOW_CLOSED`, `9000`, `ANSWER_PHOTO_LIMIT_MESSAGE` и случай 503 с текстом сервера в тесте есть; «Фото не сохранено», «К этой попытке фото добавить нельзя» в `upload-window.ts`; «Фото нельзя удалить.» и «Фото этой попытки изменить нельзя.» в `upload-window.test.ts`.

`codegraph affected` по `answer-photos-api.ts`, `upload-queue.ts`, `resize.ts`, `upload-window.ts`:

```
Affected test files (4):

  app/web/components/tests/answer-photos/resize.ts
  app/web/components/tests/answer-photos/upload-queue.ts
  app/web/lib/tests/answer-photos-api.ts
  app/web/lib/tests/upload-window.ts
```

В worktree нет `.codegraph/`, CLI отвечает по индексу основного checkout, где новых файлов нет, поэтому список повторяет вход. По импортам: `upload-window.ts` используют `upload-window.test.ts`, `UploadWindowLine.tsx`, `TestRunner.tsx` (`codegraph impact uploadWindowView`); очередь и адреса пока никто не импортирует (12-09). Все тесты в наборе `yarn verify`, который прошёл.

## Files Created/Modified

- `app/web/lib/tests/answer-photos-api.ts` — адреса и запросы API фото.
- `app/web/components/tests/answer-photos/upload-queue.ts` — очередь, `PHOTO_RETRY_DELAYS_MS`, типы `PhotoItem`, `PhotoItemStatus`, `PhotoQueueState`, `PreparedPhoto`, `PhotoUploadQueue`, `PhotoUploadQueueOptions`.
- `app/web/components/tests/answer-photos/upload-queue.test.ts` — тесты очереди.
- `app/web/components/tests/answer-photos/resize.ts` — `prepareForUpload`.
- `app/web/lib/tests/upload-window.ts` — `closedMoment`, `uploadWindowRefusalText`, тип `UploadWindowAction`.
- `app/web/lib/tests/upload-window.test.ts` — строки `uploadWindowRefusalText`.

## Deviations from Plan

1. **[Контракт 12-UI-SPEC №1, №2]** `uploadWindowRefusalText` принимает третий обязательный аргумент `action`; 503 после повторов показывает текст сервера. Так велит действие 4 Task 2, отклонением от `<interfaces>` не считается, записано для сверки.
2. **[Rule 2]** Исключение в `upload` или `remove` считается сетевым сбоем, исключение в `prepare` — отправкой исходного файла: без этого очередь застревала бы с занятым слотом.
3. **[Rule 2]** `malformed` (2xx с неверным телом) → `failed` без автоповтора: фото могло сохраниться, повтор тем же `photoId` идемпотентен.
4. Тип `PreparedPhoto` экспортирует очередь, `resize.ts` возвращает его; `prepareForUpload` по форме совпадает с `<interfaces>` (`{ blob, fileName }`).

## Issues Encountered

- `oxfmt` с перечнем файлов в переменной оболочки zsh не нашёл файлов (zsh не делит строку по пробелам); повторено с явными путями.

## Не проверено

- `prepareForUpload` в настоящем браузере (уменьшение, EXIF-поворот, HEIC в Safari): юнит-теста нет по плану, проверка — e2e в 12-09 и шаги пользователя фазы.
- `answer-photos-api.ts` против настоящих маршрутов: их добавляют 12-07 и 12-08.

## Заметки для 12-09

- Хук: `useSyncExternalStore(queue.subscribe, queue.snapshot)`; снимок стабилен до следующего перехода. Очередь создаётся на сессию и вопрос, при размонтировании блока не уничтожать (UI-SPEC: блок размонтируется на «Далее»), `dispose()` — когда сессия ушла.
- Подключение: `upload: (id, blob, name) => uploadAnswerPhoto(target, id, blob, name)`, `remove: (id) => deleteAnswerPhoto(target, id)`, `prepare: prepareForUpload`, `randomId: () => crypto.randomUUID()`; при монтировании `listAnswerPhotos(target)` → `queue.seed(data.photos)`.
- Кнопка «Удалить» — у `done`, `failed`, `retrying`, `refused`; «Повторить» — у `failed`. Свёртка нескольких `refused` с `ANSWER_PHOTO_LIMIT_MESSAGE` в одну строку — в блоке.
- Признака `removing` в `PhotoItem` нет; если блоку нужен спиннер на «Удалить» (12-UI-SPEC №3), флаг уже есть во внутреннем `Entry`, достаточно вывести его в снимок.
- Картинка готового фото — `<img src={answerPhotoUrl(id, 'thumb')}>`, не `next/image`.

## Предлагаемое сообщение коммита

`feat: Клиент фото ответа без React: адреса API фото, очередь загрузки по одному с тремя автоповторами тем же photoId и лимитом 5, уменьшение в браузере до 2560 px, тексты отказа окна для загрузки и удаления`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/web/lib/tests/answer-photos-api.ts
- FOUND: app/web/components/tests/answer-photos/upload-queue.ts
- FOUND: app/web/components/tests/answer-photos/upload-queue.test.ts
- FOUND: app/web/components/tests/answer-photos/resize.ts
- Коммиты: не закоммичено (по правилу)
