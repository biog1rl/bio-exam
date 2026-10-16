---
phase: 13-token-qr-and-phone-page
plan: 10
subsystem: web
tags: [react, test-runner, photo-upload-window, alert-dialog]

requires:
  - phase: 13-token-qr-and-phone-page
    provides: "13-07 QrUploadDialog, usePointerKind; 13-05 PhotoBlock.actions, SessionPhotoHandle, listInto"
provides:
  - "PostSubmitPhotos: список открытых вопросов с фото в окне после сдачи, одна «Готово, фото загружены» с подтверждением"
  - "post-submit-rows.ts: postSubmitRows (порядок, missing, needsConfirm) и missingPhotosText"
affects: [13-08, 13-11]

actuals:
  tokens: 6500
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "порядок строк фиксируется один раз после сверки списков всех слотов (listInto), до этого Skeleton"

key-files:
  created:
    - app/web/components/tests/answer-photos/PostSubmitPhotos.tsx
    - app/web/components/tests/answer-photos/post-submit-rows.ts
    - app/web/components/tests/answer-photos/post-submit-rows.test.ts
  modified:
    - app/web/components/tests/TestRunner.tsx
    - app/web/components/tests/answer-photos/use-answer-photos.ts
    - e2e/tests/attempt-review-pending.spec.ts
    - e2e/tests/deadline-finalised.spec.ts
  deleted:
    - app/web/components/tests/answer-photos/SubmittedPhotos.tsx

key-decisions:
  - "Вариант B (решение владельца 2026-10-17, передано Bioexam main): панель под существующей секцией результата, строки — PhotoBlock; плитки 64×64, замена зоны раннера, итоговая панель «Работа отправлена на проверку» и вариант TimerOff отложены в 13-11"
  - "Порядок строк считается один раз после того, как списки всех слотов сверены с сервером (listInto), иначе первая отрисовка до загрузки фото поставила бы все вопросы в группу «без фото»"
  - "needsConfirm и номера без фото пересчитываются в момент нажатия «Готово» по текущим очередям"
  - "h2 панели не забирает фокус: фокус при показе остаётся на h2 секции результата («Ответ принят»/«Результат»), которую план не трогает"

patterns-established:
  - "Логика «Готово, фото загружены» (completeAnswerUploads, UploadWindowRefusalSchema как успех) живёт в одном файле — PostSubmitPhotos"

requirements-completed: [QR-01, QR-05]

coverage:
  - id: D1
    description: "Порядок строк (без фото сверху, по номеру внутри групп), needsConfirm и текст подтверждения со склонением"
    verification:
      - kind: unit
        ref: "app/web/components/tests/answer-photos/post-submit-rows.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "После сдачи с открытым окном — панель «Добавьте фото к ответам», плашка «Нет фото», «Готово» → подтверждение «Нет фото у 1 вопроса: 2.» → «Отправить» → панель уходит, на проверке; контраст и 375/768/1280 без прокрутки"
    requirement: QR-05
    verification:
      - kind: e2e
        ref: "e2e/tests/attempt-review-pending.spec.ts#a student submits a test with an open question"
        status: pass
    human_judgment: false
  - id: D3
    description: "Сдача по дедлайну: «Ответ принят» с фокусом и строкой окна в секции результата при панели фото ниже"
    verification:
      - kind: e2e
        ref: "e2e/tests/deadline-finalised.spec.ts#TIME-01, TIME-03"
        status: pass
    human_judgment: false
  - id: D4
    description: "Два открытых вопроса с фото, порядок и сдача по дедлайну с QR в строке"
    verification: []
    human_judgment: true
    rationale: "e2e двух открытых вопросов — план 13-08"

duration: 25min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 10: экран фото после сдачи Summary

**После сдачи, пока окно фото открыто, под секцией результата показывается панель `PostSubmitPhotos` «Добавьте фото к ответам». В ней строка окна, строки всех открытых вопросов с фото («Вопрос n», начало текста, плашка «Нет фото», `PhotoBlock` с «С телефона») и одна «Готово, фото загружены» с подтверждением «Отправить работу без части фото?». Блок одного вопроса `SubmittedPhotos` удалён**

## Performance

- **Duration:** около 25 мин
- **Tasks:** 2 из 2
- **Files:** 3 новых, 4 изменённых, 1 удалён

## codegraph impact SubmittedPhotos

Индекс основного checkout (`/Users/kdvornichenko/bio-exam/.codegraph`; в worktree каталога нет):

```
Impact of changing "SubmittedPhotos" — 4 affected symbols:
function SubmittedPhotos (tsx) — app/web/components/tests/answer-photos/SubmittedPhotos.tsx:28
app/web/components/tests/TestRunner.tsx  function AttemptRunner:105, function TestRunner:99, file TestRunner.tsx:1
```

Вызывающий один, `TestRunner`. Контракт блок одного вопроса не оставляет, поэтому файл удалён `rm`, ссылок не осталось (`rg SubmittedPhotos app/web e2e` пусто).

## Accomplishments

- `post-submit-rows.ts`:
  - `postSubmitRows(questions, counts)` → `{ order, missing, needsConfirm }`: сначала вопросы без фото, затем с фото, внутри групп по номеру;
  - `missingPhotosText(numbers)` — текст подтверждения со склонением `pluralRu` («1 вопроса», «2 вопросов», «5 вопросов») и номерами через запятую и «и».
- `PostSubmitPhotos.tsx`:
  - панель `max-w-3xl rounded-3xl border bg-card p-4 tab-sm:p-5`; шапка — h2, `UploadWindowLine`, подпись;
  - строки `ul` с `border-t` и `py-4`; в строке «Вопрос {n}», плашка «Нет фото» (`border-warning-border bg-warning-soft text-warning`, `CircleAlert`), если готовых фото 0 и ничего не грузится; начало текста `mdxFallbackText` в `line-clamp-2`; `PhotoBlock` с ручкой `photoSession.photosFor(id)`, `sources` и `actions` с `QrUploadDialog` при `usePointerKind() === 'fine'`;
  - низ `border-t pt-4`: «Готово, фото загружены» (`h-11 w-full` до 768 px, `Loader2` и `aria-busy` при отправке), `disabled`, пока любая очередь в `preparing`/`uploading`/`retrying`; тогда подпись «Дождитесь, пока загрузятся все фото.»;
  - ошибка отправки — `failureMessage` или «Не удалось завершить загрузку. Повторите попытку.»; отказ окна `UploadWindowRefusalSchema` обрабатывается как успех;
  - `AlertDialog` подтверждения при вопросах без фото;
  - панель не рисуется при окне `none`/`closed`.
- `TestRunner.tsx`: блок `SubmittedPhotos` в разборе каждого вопроса убран. Один `PostSubmitPhotos` (`key={uploadClosesAt}`) стоит после секции `outcome.kind === 'result'`, при `submitResult`, `photoSessionId` и вопросах `open` с `allowPhotos`. `uploadsDone` и `onUploadsDone` прежние; секция итога, разбор, навигация и боковая панель не менялись.
- `use-answer-photos.ts`: экспорт `listInto` (сверка списков перед фиксацией порядка).

## Тексты экрана (дословно из `post-submit-photos.md`)

- «Добавьте фото к ответам»
- «Тест сдан. Добавьте фото решений, пока открыто время для фото.»
- «Вопрос {n}», «Нет фото»
- «Готово, фото загружены»
- «После нажатия окно загрузки закроется, и работа сразу попадёт к проверяющему.»
- «Дождитесь, пока загрузятся все фото.»
- «Не удалось завершить загрузку. Повторите попытку.»
- «Отправить работу без части фото?»
- «Нет фото у {K} {вопроса/вопросов}: {номера}. Вопрос без текста и без фото получит 0 баллов. После отправки добавить фото будет нельзя.»
- «Вернуться», «Отправить»
- Строка окна — `UploadWindowLine`; тексты строк фото — `PhotoBlock`; «С телефона» — `qr-dialog.md`.

## Проверки

- `yarn workspace @bio-exam/web test components/tests/answer-photos/post-submit-rows.test.ts` — 7 passed; весь web — 111 файлов, 1816 passed.
- `yarn workspace @bio-exam/web typecheck` — 0; корневой `yarn typecheck` — 0; `lint` — 0 (предупреждение `TestRunner.tsx:116` старое); `yarn format:check` — 0; `node --test scripts/*.test.mjs` — 193/193.
- Полный `yarn e2e` — 415 passed, 6,2 мин. В том числе `attempt-review-pending` (новая панель, плашка, подтверждение «Нет фото у 1 вопроса: 2.», контраст и ширины 375/768/1280) и `deadline-finalised`.
- Критерии приёмки:
  - `completeAnswerUploads` вызывается только в `PostSubmitPhotos.tsx`;
  - `SubmittedPhotos` в `TestRunner.tsx` нет;
  - `PostSubmitPhotos` в `TestRunner.tsx` — импорт и одна вставка.

## Task Commits

1. **Task 1: порядок строк, подтверждение и PostSubmitPhotos** — не закоммичено
2. **Task 2: подключение в TestRunner и e2e** — не закоммичено

`git add` не запускался; удаление `SubmittedPhotos.tsx` сделано `rm`.

## Files Created/Modified

- `app/web/components/tests/answer-photos/PostSubmitPhotos.tsx` — панель окна после сдачи
- `app/web/components/tests/answer-photos/post-submit-rows.ts`, `post-submit-rows.test.ts` — порядок и текст подтверждения
- `app/web/components/tests/TestRunner.tsx` — один `PostSubmitPhotos` вместо `SubmittedPhotos` в каждом вопросе
- `app/web/components/tests/answer-photos/use-answer-photos.ts` — экспорт `listInto`
- `e2e/tests/attempt-review-pending.spec.ts` — «Готово» через новую панель и подтверждение
- `e2e/tests/deadline-finalised.spec.ts` — строка окна ищется в секции «Ответ принят»: вторая такая же строка теперь есть в панели фото
- удалён `app/web/components/tests/answer-photos/SubmittedPhotos.tsx`

## Deviations from Plan

1. **Отклонение от контракта `post-submit-photos.md` (вариант B, решение владельца 2026-10-17).** Не сделано и отложено в 13-11:
   - плитки миниатюр 64×64 с удалением в углу и строкой ошибки под плитками — строка использует `PhotoBlock` с его раскладкой, заголовком «Фото к ответу» и своим счётчиком, поэтому отдельного счётчика справа в строке нет;
   - замена зоны раннера — панель стоит под секцией результата, карточка вопроса, навигация и боковая панель остаются;
   - итоговая панель «Работа отправлена на проверку»;
   - вариант с `TimerOff` при закрытии окна по времени — панель просто исчезает, как раньше `SubmittedPhotos`.
2. **Фокус при показе остаётся на h2 секции результата**, а не на h2 панели, как требует контракт. Иначе панель забирала бы фокус у «Ответ принят»/«Результат», а секцию итога план трогать не велит (её проверяет `deadline-finalised`).
3. **Строка окна теперь в двух местах:** в секции результата (не трогается) и в шапке панели (по контракту). Уберёт 13-11 вместе с заменой зоны.
4. **e2e: `answer-photos.spec.ts` не менялся** — сценариев окна после сдачи в нём нет. Переведены сценарии, которые зависели от прежнего блока: `attempt-review-pending.spec.ts` («Готово») и `deadline-finalised.spec.ts` (строка окна стала неоднозначной). `timed-attempt.spec.ts` от экрана не зависит и не менялся.
5. **[Rule 3] `use-answer-photos.ts` вне списка плана:** экспорт `listInto` для фиксации порядка строк после сверки со списком сервера.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- 13-08: e2e двух открытых вопросов (порядок 4, 7, плашка пропадает, порядок не меняется, подтверждение «Нет фото у 1 вопроса: 7…») и сдача по дедлайну с «С телефона» в строке.
- 13-11: пункты отклонения 1–3.

## Self-Check: PASSED

- FOUND: PostSubmitPhotos.tsx, post-submit-rows.ts, post-submit-rows.test.ts; SubmittedPhotos.tsx удалён.
- Коммитов нет по правилам фазы (не закоммичено).

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
