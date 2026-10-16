---
phase: 13-token-qr-and-phone-page
plan: 06
subsystem: web
tags: [nextjs, upload-link, sessionStorage, playwright, security-headers]

requires:
  - phase: 13-token-qr-and-phone-page
    provides: "13-03 lib/upload-link/api.ts и маршруты /api/upload/*; 13-04 анонимная оболочка /photo-upload; 13-05 транспорт ссылки, usePhotoListSync, PhotoBlock touch"
provides:
  - "страница телефона /photo-upload со всеми экранами 13-UI-CONTRACT § 2"
  - "lib/upload-link/phone-link.ts: PHONE_UPLOAD_PATH, phoneUploadUrl, readPhoneToken, phoneRefusalOf, isInAppBrowser"
  - "заголовки ответа /photo-upload в next.config.ts"
  - "e2e двух контекстов photo-upload-link.spec.ts и сид photo-link-*"
affects: [13-07, 13-08]

actuals:
  tokens: 11500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "обёртка транспорта на странице: исход list/upload/remove разбирается phoneRefusalOf и переводит страницу на экран отказа"

key-files:
  created:
    - app/web/app/(internal)/photo-upload/page.tsx
    - app/web/app/(internal)/photo-upload/PhotoUploadClient.tsx
    - app/web/lib/upload-link/phone-link.ts
    - app/web/lib/upload-link/phone-link.test.ts
    - app/web/lib/mdx/fallback-text.ts
    - e2e/tests/photo-upload-link.spec.ts
  modified:
    - app/web/next.config.ts
    - e2e/fixtures/seed.json
    - app/web/components/tests/answer-photos/use-answer-photos.ts
    - app/web/lib/tests/upload-window.ts
    - app/web/lib/mdx/compile.ts

key-decisions:
  - "Фрагмент токена в адресе не стирается (решение владельца 2026-10-16, п. 3): e2e проверяет, что hash после загрузки фото равен #<токен>"
  - "Неверный по форме фрагмент даёт «Ссылка недействительна», копия из sessionStorage в этом случае не подставляется; без фрагмента берётся копия"
  - "404, 422 и 409 ANSWER_PHOTO_FORBIDDEN на любом запросе ловит обёртка транспорта (list, upload, remove); миниатюры не оборачиваются: 404 миниатюры удалённого фото не гасит страницу"
  - "Подсказка встроенных браузеров только по условиям А и Б (13-UI-CONTRACT), постоянной строки из UI-SPEC нет"
  - "Сид: отдельные тесты photo-link-{desktop,mobile} с одним открытым вопросом вместо назначения на тесты с окнами 120 и 0"

patterns-established:
  - "Ссылка телефона строится и читается только через lib/upload-link/phone-link.ts (смена фрагмента на путь по D-01 — один модуль)"

requirements-completed: [QR-01, QR-02, QR-03, QR-04]

coverage:
  - id: D1
    description: "Телефон без входа открывает ссылку, видит «Вопрос 1», тест, текст вопроса, «0 из 5», камеру и галерею, загружает JPEG — «1 из 5», миниатюра, фото видно в списке слота на компьютере; фрагмент на месте; запросов /api/auth/ нет"
    requirement: QR-02
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#телефон без входа открывает ссылку (desktop и mobile)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Неизвестный токен и пустой фрагмент — «Ссылка недействительна» с фокусом на h1"
    requirement: QR-01
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#неизвестный токен и пустой фрагмент"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ответ страницы: Referrer-Policy no-referrer, X-Robots-Tag noindex, X-Frame-Options DENY, CSP frame-ancestors 'none', meta referrer"
    requirement: QR-04
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#ответ страницы"
        status: pass
    human_judgment: false
  - id: D4
    description: "375 px без горизонтальной прокрутки, контраст текста AA"
    requirement: QR-02
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#рабочий экран на 375 px"
        status: pass
    human_judgment: false
  - id: D5
    description: "allowPhotos = false — экран «Фото к этому вопросу не принимаются» без блока фото; Telegram UA — подсказка и «Скопировать ссылку», обычный — нет"
    requirement: QR-02
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#контекст с allowPhotos = false; #встроенный браузер Telegram"
        status: pass
    human_judgment: false
  - id: D6
    description: "Разбор токена, отказов и User-Agent"
    verification:
      - kind: unit
        ref: "app/web/lib/upload-link/phone-link.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Условие Б подсказки (30 с без change), плашка «Нет связи с интернетом», экраны 422 закрыто/нет окна и 409 во время работы на живых отказах, поведение на реальных телефонах"
    verification: []
    human_judgment: true
    rationale: "e2e закрывает только invalid и forbidden-при-открытии; остальные экраны идут тем же путём компонента, разбор отказов покрыт юнитами; устройства — матрица 13-SPIKE.md и приёмка 13-08"

duration: 35min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 06: страница телефона /photo-upload Summary

**Анонимная страница `/photo-upload`. Токен читается из фрагмента, копия лежит в `sessionStorage`, фрагмент из адреса не стирается. На рабочем экране вопрос обычным текстом, строка окна, плашка сети, подсказка встроенных браузеров и `PhotoBlock` по ссылке с опросом 2,5 с. Экраны «Ссылка недействительна», «Время для фото закончилось», «Фото к этому тесту больше не принимаются», «Фото к этому вопросу не принимаются» и «Не удалось открыть страницу» сделаны по контракту. Ответ идёт с заголовками no-referrer, noindex и запретом фреймов. Есть e2e двух контекстов**

## Performance

- **Duration:** около 35 мин
- **Tasks:** 3 из 3
- **Files modified:** 11 (6 новых, 5 изменённых)

## Accomplishments

- `phone-link.ts`:
  - `PHONE_UPLOAD_PATH`, `phoneUploadUrl(origin, token)` → `<origin>/photo-upload#<токен>`;
  - `readPhoneToken(hash, storage)`: сначала фрагмент (43 символа base64url), его копия кладётся в `sessionStorage`; без фрагмента берётся копия; неверная форма — `null`. `replaceState` нет;
  - `phoneRefusalOf(failure)`: 404 → недействительна, 422 по `UploadWindowRefusalSchema` → закрыто или нет окна, 409 с `ANSWER_PHOTO_FORBIDDEN_MESSAGE` → фото выключены;
  - `isInAppBrowser(userAgent)`: шаблоны Telegram, VK, Instagram, Facebook, приложения Яндекса; `YaBrowser` не входит.
- `page.tsx`: `metadata` (title «Фото к ответу», `referrer: 'no-referrer'`, robots без индексации), `viewport: { viewportFit: 'cover' }` для безопасных полей iPhone.
- `PhotoUploadClient.tsx`:
  - свой `<main className="h-dvh overflow-y-auto overscroll-contain">`, колонка `max-w-xl` с полями `env(safe-area-inset-*)`;
  - рабочий экран: `h1` «Вопрос {n}» с фокусом, название теста, `section aria-label="Текст вопроса"` с `mdxFallbackText` (пусто — «В вопросе только рисунок. Откройте вопрос на компьютере.»), строка окна `until · countdown` с `role="status"`, плашка «Нет связи с интернетом» (офлайн или `failures >= 2`), подсказка встроенных браузеров (условие А по User-Agent, условие Б — 30 с после «Сделать фото» или «Выбрать из галереи» без `change`, слушатели capture на обёртке), `PhotoBlock` с `['camera','gallery']` и `touch`;
  - экраны состояний `max-w-sm`, круг `size-12 bg-muted`, `Link2Off`, `TimerOff`, `ImageOff`; тексты дословно из `13-UI-CONTRACT.md` § 2;
  - загрузка — `Skeleton` и `role="status"` «Загрузка…»; сеть, 5xx и 429 первого запроса — `LoadErrorAlert` «Не удалось открыть страницу» с «Повторить»;
  - без `MdxRenderer`, без `dangerouslySetInnerHTML`, без внешних ресурсов, ссылок наружу нет.
- `next.config.ts` `headers()` для `/photo-upload` и `/photo-upload/:path*`: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`.
- Сид: аккаунты `photo-link-student-desktop` и `photo-link-student-mobile` в конце списков, тесты `photo-link-desktop` и `photo-link-mobile` (тема `e2e-deadline`, один открытый вопрос).

## Проверки

- `yarn workspace @bio-exam/web test lib/upload-link lib/mdx` — 146 passed; весь web — 110 файлов, 1809 passed.
- `yarn workspace @bio-exam/web typecheck` — 0; корневой `yarn typecheck` — 0; `lint` — 0, по файлам плана предупреждений нет; `yarn format:check` — 0.
- `node --test scripts/*.test.mjs` — 193/193.
- `yarn e2e e2e/tests/photo-upload-link.spec.ts` — 7 passed (6 desktop, 1 mobile), 5 skipped (desktop-only на mobile).
- Полный `yarn e2e` — 411 passed, 5 skipped, 6,1 мин: новые аккаунты и тесты сида ничего не сломали.
- Критерии приёмки:
  - `MdxRenderer|dangerouslySetInnerHTML|https?://` в `app/(internal)/photo-upload` нет;
  - `replaceState` в `lib/upload-link` нет;
  - шесть текстов экранов и подсказки в `PhotoUploadClient.tsx` есть;
  - `frame-ancestors 'none'` в `next.config.ts` есть.
- Бандл: в чанках `page_client-reference-manifest.js` страницы (20 чанков, вместе с корневым layout) нет кода `remark-gfm`, `rehype-raw`, `micromark`, `next-mdx-remote`.
- `13-SPIKE.md` на момент работы — пустой шаблон, решение D-01 «переход на путь» не записано, поэтому предусловие задачи 1 выполнено.

## Task Commits

1. **Task 1 (tracer): ссылка открывается без входа и принимает фото** — не закоммичено
2. **Task 2: состояния, плашка сети, заголовки ответа** — не закоммичено
3. **Task 3: экран «фото не принимаются» и подсказка встроенных браузеров** — не закоммичено

`git add` не запускался, всё в рабочем дереве worktree.

## Files Created/Modified

- `app/web/app/(internal)/photo-upload/page.tsx` — метаданные и viewport
- `app/web/app/(internal)/photo-upload/PhotoUploadClient.tsx` — страница и её экраны
- `app/web/lib/upload-link/phone-link.ts`, `phone-link.test.ts` — адрес, токен, разбор отказов, User-Agent
- `app/web/lib/mdx/fallback-text.ts` — `mdxFallbackText` без компилятора MDX; `compile.ts` реэкспортирует
- `app/web/next.config.ts` — заголовки страницы
- `app/web/components/tests/answer-photos/use-answer-photos.ts` — экспорт `createPhotoHandle`
- `app/web/lib/tests/upload-window.ts` — экспорт `closedMoment`
- `e2e/fixtures/seed.json` — аккаунты и тесты `photo-link-*`
- `e2e/tests/photo-upload-link.spec.ts` — e2e телефона

## Тексты «ждёт Bioexam design»

Не осталось: экран `allowPhotos = false` и подсказка встроенных браузеров внесены в `13-UI-CONTRACT.md` (Bioexam design 2026-10-16), тексты взяты дословно.

## Deviations from Plan

1. **e2e проверяет, что фрагмент остался.** В задаче 1 плана написано «в адресе нет `#`», но это противоречит решению владельца 2026-10-16 (п. 3, `replaceState` не вызывается) и must_have D-01 того же плана. Тест проверяет `hash === #<токен>`. Возвращать старую проверку не нужно.
2. **[Rule 3] Файлы вне списка плана:**
   - `use-answer-photos.ts` — экспорт `createPhotoHandle(transport, maxCount)` (переименованный внутренний `createQueueHandle`). Страница оборачивает транспорт ссылки, чтобы ловить отказы на любом запросе; иначе загрузка с 404 или 409 осталась бы ошибкой строки.
   - `upload-window.ts` — экспорт `closedMoment` для «закрылось {в HH:mm}» / «{d MMM} в {HH:mm}» без копии форматирования.
   - `lib/mdx/fallback-text.ts` и реэкспорт в `compile.ts` ([Rule 2], производительность телефона): `compile.ts` импортирует `next-mdx-remote/serialize`, remark и rehype, и импорт `mdxFallbackText` оттуда тянул бы компилятор в бандл страницы. Существующие импорты `@/lib/mdx/compile` не менялись.
3. **Сид.** Вместо назначения на тесты с окнами 120 и 0 добавлены отдельные `photo-link-{desktop,mobile}`, чтобы не задеть `deadline-finalised` и `answer-photos`. Полный e2e зелёный.
4. **Отказы ловит обёртка транспорта**, а не `lastFailure` хука: так покрыты и загрузка, и удаление, а не только опрос. Опрос тоже идёт через обёртку.
5. **Строка окна** собрана по формату UI-SPEC (`until · countdown`, `tabular-nums`, жирность в `closing` и `last-minute`), а не через `UploadWindowLine` раннера. **Подсказка** по 13-UI-CONTRACT (только условия А и Б), а не постоянная строка UI-SPEC.
6. **Порядок задач.** Код задач 2 и 3 написан до tracer-прогона задачи 1. e2e прогнан один раз на полном коде, зелёный с первого раза.

## Issues Encountered

- Линтер React Compiler отметил `Date.now` в рендере, ref в ленивом инициализаторе и синхронный setState в эффекте. Исправлено: время отказа хранится в состоянии экрана (`seenAtMs`), колбэк отказа стабильный (`useCallback`), первое открытие идёт через `.then`.

## User Setup Required

None. Матрица устройств — `13-SPIKE.md` (шаг владельца). Caddy для `/photo-upload*` — шаг владельца из 13-08.

## Next Phase Readiness

- 13-07 (диалог QR): адрес строить `phoneUploadUrl(window.location.origin, token)`. Наблюдать отказы — по образцу `observedTransport` + `phoneRefusalOf`, хотя у диалога свои тексты.
- `usePhotoListSync` считает неудачи по возвращённым исходам (правка 13-05); плашка телефона показывается при `failures >= 2`.
- Эвристики для UAT 13-08: шаблоны `isInAppBrowser` (в том числе Telegram на iOS, где UA может не содержать маркера; там остаётся условие Б) и сравнение подписи кнопки для условия Б.
- Не проверено e2e: условие Б, плашка офлайна, живые 422 и 409 во время работы — см. coverage D7.

## Self-Check: PASSED

- FOUND: page.tsx, PhotoUploadClient.tsx, phone-link.ts, phone-link.test.ts, fallback-text.ts, photo-upload-link.spec.ts
- Коммитов нет по правилам фазы (не закоммичено).

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
