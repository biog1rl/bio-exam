---
phase: 13-token-qr-and-phone-page
plan: 07
subsystem: web
tags: [react, dialog, qr, next-dynamic, sessionStorage, playwright]

requires:
  - phase: 13-token-qr-and-phone-page
    provides: "13-01 @lglab/react-qr-code 1.7.3; 13-03 issueUploadLink/readUploadContext; 13-05 PhotoBlock.actions, usePhotoListSync, SessionPhotoHandle; 13-06 phoneUploadUrl, phoneRefusalOf"
provides:
  - "QrUploadDialog: кнопка «С телефона» и диалог «Добавить фото с телефона» по .planning/design/qr-dialog.md"
  - "QrCode.tsx: ReactQRCode с параметрами qr-dialog.md § QR, подключается только через next/dynamic"
  - "usePointerKind(): 'fine' | 'coarse' | 'unknown'; usePhotoSources поверх него"
  - "lib/upload-link/link-cache.ts: адрес ссылки в sessionStorage по <sessionId>:<questionId>"
affects: [13-08, 13-10]

actuals:
  tokens: 9000
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "тяжёлая клиентская библиотека за next/dynamic ssr:false в отдельном файле-обёртке; проверка маркера в firstLoadChunkPaths маршрута"

key-files:
  created:
    - app/web/components/tests/answer-photos/QrUploadDialog.tsx
    - app/web/components/tests/answer-photos/QrCode.tsx
    - app/web/components/tests/answer-photos/use-pointer-kind.ts
    - app/web/lib/upload-link/link-cache.ts
  modified:
    - app/web/components/tests/TestRunner.tsx
    - app/web/components/tests/answer-photos/SubmittedPhotos.tsx
    - app/web/components/tests/answer-photos/use-photo-sources.ts
    - e2e/tests/photo-upload-link.spec.ts
    - e2e/tests/answer-photos.spec.ts

key-decisions:
  - "Тексты и вид диалога — по .planning/design/qr-dialog.md (новее выжимки 13-UI-CONTRACT § 1): пояснение «…Фото сразу появятся в ответе к вопросу {n}.», «Скопировать» → «Скопировано», «Ссылка для телефона», строка приватности; тексты отказов 403 и выключенных фото совпадают в обоих"
  - "Кэш хранит адрес ссылки; токен извлекается из фрагмента, повреждённое значение — как отсутствующее; при каждом открытии адрес из кэша подтверждается readUploadContext, 404 — dropCachedLink и новая выдача, 422 — экран окна, сеть и 5xx — «Не удалось создать ссылку»"
  - "403 выдачи показывается текстом FORBIDDEN_TEXT контракта (причина не берётся из тела ответа), «Повторить» нет по loadErrorView (403 терминальный)"
  - "Время окна истекло, пока диалог открыт: состояние «окно закрыто» строится из useUploadWindowView без запроса, опрос выключается"
  - "Кнопка «С телефона» до сдачи скрыта, пока раннер блокирует блок фото (ручная сдача идёт); после сдачи — внутри SubmittedPhotos, который сам ничего не рисует при закрытом окне"

patterns-established:
  - "actions у PhotoBlock — место для QrUploadDialog в раннере и SubmittedPhotos"

requirements-completed: [QR-01, QR-02, QR-05]

coverage:
  - id: D1
    description: "«С телефона» → ссылка в диалоге (data-testid=upload-link, QR с aria-label) → телефон во втором контексте загружает JPEG → счётчик диалога и блок раннера показывают новое фото без перезагрузки"
    requirement: QR-05
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#«С телефона» на компьютере"
        status: pass
    human_judgment: false
  - id: D2
    description: "После перезагрузки раннера адрес в диалоге тот же, открытая страница телефона продолжает загружать; диалог на 375 px без горизонтальной прокрутки; Esc возвращает фокус на «С телефона»"
    requirement: QR-01
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#после перезагрузки раннера"
        status: pass
    human_judgment: false
  - id: D3
    description: "Погашенная ссылка в кэше молча заменяется новой выдачей"
    requirement: QR-01
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#погашенная ссылка в кэше"
        status: pass
    human_judgment: false
  - id: D4
    description: "Отказ выдачи 403 без «Повторить» и выключенные фото (409) по контракту"
    requirement: QR-02
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#отказ выдачи 403 и выключенные фото"
        status: pass
    human_judgment: false
  - id: D5
    description: "Библиотека QR не входит в первую загрузку маршрута /tests/[topicSlug]/[testSlug]/start; editor:budget зелёный"
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/web build; route-bundle-stats.json firstLoadChunkPaths без finder-patterns-outer; yarn editor:budget"
        status: pass
    human_judgment: false
  - id: D6
    description: "Кнопка «С телефона» в окне фото после сдачи по дедлайну; ссылка, выданная до сдачи, после сдачи недействительна; «нет связи» после двух неудач опроса; чтение QR камерами"
    verification: []
    human_judgment: true
    rationale: "В helpers e2e нет сдачи по дедлайну для нового ученика (единственная засеянная просроченная сессия занята deadline-finalised.spec); серверная часть покрыта интеграционными тестами 13-03; камеры — приёмка 13-08"

duration: 35min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 07: QR-диалог на компьютере Summary

**У блока фото открытого вопроса в раннере (pointer fine, до сдачи и в открытом окне после сдачи) появилась кнопка «С телефона». Она открывает диалог «Добавить фото с телефона» с QR `@lglab/react-qr-code` в цветах токенов (загружается лениво через `next/dynamic`), ссылкой текстом, копированием, счётчиком «N из M фото», строкой окна и опросом раз в 2,5 с. Адрес ссылки кэшируется в `sessionStorage` и подтверждается при каждом открытии. Отказы показываются по контракту**

## Performance

- **Duration:** около 35 мин
- **Tasks:** 3 из 3
- **Files modified:** 9 (4 новых, 5 изменённых)

## Accomplishments

- `use-pointer-kind.ts`: `usePointerKind()` на `matchMedia('(pointer: coarse)')` и `'(pointer: fine)'` через `useSyncExternalStore`, на сервере `'unknown'`. `usePhotoSources` построен поверх: `coarse` → камера и галерея, иначе — «Добавить фото».
- `QrCode.tsx`: `ReactQRCode` с параметрами qr-dialog.md § «QR» (`size` 240, `level="Q"`, `marginSize={4}`, `#fffdf2`, `leaf` `#182610`, `rounded-lg`/`circle` `#4b6b38`, `aria-label`). Ширина `size-56` до 500 px и `size-60` с 500 px.
- `QrUploadDialog.tsx`:
  - триггер `Button outline sm rounded-full` с `Smartphone`, текстом «С телефона» и `aria-label` «Добавить фото с телефона»;
  - `DialogContent max-w-md bg-popover`, заголовок и пояснение с номером вопроса;
  - QR подключается через `dynamic(() => import('./QrCode'), { ssr: false, loading })`, заглушка `Skeleton` 240×240;
  - счётчик `{N} из {M} фото` (`Images`, `aria-live`) из снимка очереди слота; строка лимита; строка окна (`Clock3` и `font-medium` при `closing`/`last-minute`); «Нет связи с сервером…» при `failures >= 2`;
  - подпись «Ссылка для телефона», `Input readOnly` (`data-testid="upload-link"`, выделение по фокусу), «Скопировать» → «Скопировано» с `Check` на 3 с, скрытый `aria-live`; при отказе буфера — `execCommand('copy')`, затем текст сбоя; строка приватности; «Закрыть» в подвале и крестик;
  - состояния: готовится (`Skeleton`, `Loader2`, «Создаём ссылку…», копирование `disabled`); готово; не удалось (`LoadErrorAlert` «Не удалось создать ссылку», «Повторить»; у 403 причина «Недостаточно прав…» без «Повторить»); окно закрыто (`TimerOff`, «Время для добавления фото закончилось {в HH:mm}. QR-код больше не работает.», «Загруженные фото остались в ответе.»); окна нет; фото выключены (`ImageOff`). Во всех трёх отказах счётчик остаётся, опрос стоит;
  - фокус: при открытии на «Закрыть», при переходе в «готово» — на «Скопировать», если фокус не уводили; Esc закрывает, фокус возвращается на «С телефона» (`DialogTrigger`).
- `link-cache.ts`: `readCachedLink`, `storeCachedLink`, `dropCachedLink` по ключу `<sessionId>:<questionId>`.
- `TestRunner.tsx`: `actions` у `PhotoBlock` до сдачи при `usePointerKind() === 'fine'` и незаблокированном блоке; тот же `QrUploadDialog` в `SubmittedPhotos` (новый проп `actions`). Условие `question.allowPhotos` у обоих мест уже было (W1).

## Проверки

- Tracer: `yarn e2e e2e/tests/photo-upload-link.spec.ts e2e/tests/answer-photos.spec.ts` — 43 passed, 9 skipped (desktop-only на mobile).
- Полный `yarn e2e` — 415 passed, 6,2 мин.
- `yarn workspace @bio-exam/web test` — 1809 passed; `typecheck` — 0; корневой `yarn typecheck` — 0; `lint` — 0 (предупреждение `TestRunner.tsx:116` старое, не в строках плана); `yarn format:check` — 0; `node --test scripts/*.test.mjs` — 193/193.
- Первая загрузка раннера: `yarn workspace @bio-exam/web build` (код 0). Маркер есть в библиотеке: `grep -c "finder-patterns-outer" node_modules/@lglab/react-qr-code/dist/index.es.js` → `2`. Проверка:

```
node -e "…route-bundle-stats.json → route '/tests/[topicSlug]/[testSlug]/start' → firstLoadChunkPaths → файлы со строкой finder-patterns-outer"
route /tests/[topicSlug]/[testSlug]/start firstLoadChunkPaths 29 files with finder-patterns-outer: 0
chunks with marker in .next/static/chunks: 1
```

  Библиотека лежит в одном ленивом чанке и в первую загрузку маршрута не входит.
- `yarn editor:budget` → `editor bundle OK` (`/admin/tests/[topicSlug]/[testSlug]/questions/[questionId]`: raw 2618936, gzip 734028).
- Критерии приёмки:
  - `dynamic(` в `QrUploadDialog.tsx` есть;
  - `@lglab/react-qr-code` импортирует только `QrCode.tsx`;
  - `data-testid="upload-link"` есть;
  - тексты «Создаём ссылку…», «Не удалось создать ссылку», «QR-код больше не работает», «Нет связи с сервером. Фото с телефона появятся, когда связь вернётся.», «Недостаточно прав для этого действия», «QR-код не нужен» есть;
  - `actions=` в `TestRunner.tsx` есть.

## Task Commits

1. **Task 1 (tracer): «С телефона» → ссылка → фото с телефона на компьютере** — не закоммичено
2. **Task 2: кэш, опрос, состояния, копирование, фокус, вес маршрута** — не закоммичено
3. **Task 3: отказ выдачи 403 и выключенные фото** — не закоммичено

`git add` не запускался.

## Files Created/Modified

- `app/web/components/tests/answer-photos/QrUploadDialog.tsx` — кнопка и диалог
- `app/web/components/tests/answer-photos/QrCode.tsx` — обёртка библиотеки QR
- `app/web/components/tests/answer-photos/use-pointer-kind.ts` — вид указателя
- `app/web/components/tests/answer-photos/use-photo-sources.ts` — источники поверх `usePointerKind`
- `app/web/lib/upload-link/link-cache.ts` — кэш адреса ссылки
- `app/web/components/tests/TestRunner.tsx` — `actions` у `PhotoBlock` и `SubmittedPhotos`
- `app/web/components/tests/answer-photos/SubmittedPhotos.tsx` — проп `actions`
- `e2e/tests/photo-upload-link.spec.ts` — четыре сценария диалога
- `e2e/tests/answer-photos.spec.ts` — `exact: true` у кнопки «Добавить фото»

## Тексты «ждёт Bioexam design»

Не осталось: отказ 401/403, выключенные фото и подтверждение кэшированной ссылки описаны в `qr-dialog.md` и `13-UI-CONTRACT.md` § 1.

## Deviations from Plan

1. **[Rule 1] `e2e/tests/answer-photos.spec.ts` вне списка плана.** `getByRole('button', { name: 'Добавить фото' })` по умолчанию сравнивает подстрокой и теперь находил бы и «Добавить фото с телефона» (`aria-label` из контракта). Добавлено `exact: true`.
2. **Тексты по `qr-dialog.md`.** Там, где `13-UI-CONTRACT.md` § 1 расходится с `qr-dialog.md` (пояснение «Фото появятся в списке выше», «Скопировать ссылку» → «Ссылка скопирована»), взят `qr-dialog.md`: план и CONTEXT («Поправки W3» 1) называют его источником вида и текстов, он новее.
3. **e2e сдачи по дедлайну не написан.** В helpers нет сдачи по дедлайну для отдельного ученика: засеянная просроченная сессия одна и занята `deadline-finalised.spec.ts`. Сценарий «кнопка в окне после сдачи и мёртвая ссылка до сдачи» в e2e не проверен; код — ветка `SubmittedPhotos` с тем же компонентом, серверная часть покрыта интеграционными тестами 13-03.
4. **Порядок задач.** Код задач 2 и 3 написан до tracer-прогона задачи 1. e2e прогнан один раз на полном коде, зелёный.

## Issues Encountered

None.

## User Setup Required

None. Чтение QR камерами iPhone и Android — приёмка 13-08 (`13-SPIKE.md`).

## Next Phase Readiness

- 13-08: в UAT проверить кнопку «С телефона» в окне фото после сдачи по дедлайну, «Нет связи с сервером…» после двух неудач опроса (офлайн компьютера) и чтение QR камерами 240/224 px.
- 13-10 (экран списка вопросов после сдачи) может подключить тот же `QrUploadDialog` через `actions`.

## Self-Check: PASSED

- FOUND: QrUploadDialog.tsx, QrCode.tsx, use-pointer-kind.ts, link-cache.ts
- Коммитов нет по правилам фазы (не закоммичено).

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
