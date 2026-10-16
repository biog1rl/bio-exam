---
phase: 13-token-qr-and-phone-page
plan: 08
subsystem: testing
tags: [playwright, e2e, debt-02, skills, phase-gate]

requires:
  - phase: 13-token-qr-and-phone-page
    provides: "13-06 страница телефона, 13-07 QR-диалог, 13-09 навыки api/data и ADR-0004, 13-10 PostSubmitPhotos"
provides:
  - "e2e переходов ссылки в двух контекстах: удаление и лимит, снятие назначения, гашение ссылки после сдачи и новая из окна, «Готово» закрывает окно телефона, тест без окна, сдача по дедлайну с «С телефона», список вопросов после сдачи с подтверждением, мобильный сценарий"
  - "newPhoneContext и openExpiredSeedSession в e2e/fixtures/exam.ts"
  - "e2e DEBT-02: картинка 404 и один Toaster"
  - "навык bio-exam-web по зоне фазы"
  - "ворота фазы зелёные"
affects: [13-11, приёмка фазы 13]

actuals:
  tokens: 9500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "контекст телефона без storageState: newPhoneContext (desktop — 375 px, isMobile, hasTouch; mobile — параметры устройства проекта)"
    - "сдача по дедлайну для отдельного ученика — засеянная просроченная сессия и openExpiredSeedSession"

key-files:
  created:
    - e2e/tests/not-found-and-toaster.spec.ts
  modified:
    - e2e/tests/photo-upload-link.spec.ts
    - e2e/fixtures/exam.ts
    - e2e/fixtures/seed.json
    - .agents/skills/bio-exam-web/SKILL.md
    - e2e/tests/question-draft-durability.spec.ts

key-decisions:
  - "Тест без окна (photoUploadWindowMinutes 0): ссылка, выданная до сдачи, после сдачи даёт «Ссылка недействительна» (issuedBeforeSubmit в uploadLinkSlot проверяется раньше окна), поэтому экран «Фото к этому тесту больше не принимаются» в e2e проверяется подменой ответа context на 422 UPLOAD_WINDOW_NONE"
  - "Лимит на телефоне проверяется на M = 5 (сид не задаёт maxPhotos вопросу; лимит вопроса покрыт юнитами очереди 13-05 и серверными тестами)"
  - "Сдача по дедлайну — засеянная сессия photo-deadline-desktop (startedMinutesAgo 10, лимит 5 мин) и openExpiredSeedSession, как в deadline-finalised.spec.ts; test-support не понадобился"

patterns-established:
  - "Сценарий компьютер ↔ телефон только на desktop-проекте (test.skip), мобильный проект — страница телефона и раннер без «С телефона»"

requirements-completed: [QR-01, QR-02, QR-03, QR-04, QR-05, DEBT-02]

coverage:
  - id: D1
    description: "Телефон удаляет фото — счётчик открытого диалога и блока компьютера уменьшается; 5 из 5 — кнопки телефона aria-disabled и текст лимита"
    requirement: QR-03
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#телефон удаляет фото и упирается в лимит"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ссылка, выданная до обычной сдачи, после сдачи — «Ссылка недействительна»; QR в окне после сдачи даёт новую рабочую ссылку; «Готово, фото загружены» — телефон «Время для фото закончилось»"
    requirement: QR-04
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#телефон удаляет фото и упирается в лимит"
        status: pass
    human_judgment: false
  - id: D3
    description: "Снятие назначения — открытая страница телефона «Ссылка недействительна»"
    requirement: QR-04
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#админ снимает назначение"
        status: pass
    human_judgment: false
  - id: D4
    description: "Тест без окна: ссылка до сдачи недействительна; экран 422 NONE"
    requirement: QR-02
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#тест без окна после сдачи"
        status: pass
    human_judgment: false
  - id: D5
    description: "Список вопросов после сдачи: без фото сверху, плашка «Нет фото» пропадает, порядок прежний, подтверждение «Нет фото у 1 вопроса: 3. …», после «Отправить» панель исчезает"
    requirement: QR-05
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#после сдачи список вопросов с фото"
        status: pass
    human_judgment: false
  - id: D6
    description: "Сдача по дедлайну: «Ответ принят», в строке PostSubmitPhotos «С телефона», фото с телефона приходит в строку"
    requirement: QR-05
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#сдача по дедлайну"
        status: pass
    human_judgment: false
  - id: D7
    description: "Мобильный проект: страница телефона на 375 px без прокрутки, камера и галерея, в раннере нет «С телефона»"
    requirement: QR-02
    verification:
      - kind: e2e
        ref: "e2e/tests/photo-upload-link.spec.ts#mobile"
        status: pass
    human_judgment: false
  - id: D8
    description: "DEBT-02: картинка 404 загружена (complete, naturalWidth > 0); один [data-sonner-toaster], одно сообщение один раз"
    requirement: DEBT-02
    verification:
      - kind: e2e
        ref: "e2e/tests/not-found-and-toaster.spec.ts"
        status: pass
    human_judgment: false
  - id: D9
    description: "Ворота фазы: yarn e2e, yarn verify, dist rbac и exam-core, сборка web, editor:budget"
    verification:
      - kind: other
        ref: "yarn e2e; yarn verify; check-rbac-dist; check-exam-core-dist; yarn workspace @bio-exam/web build; yarn editor:budget"
        status: pass
    human_judgment: false
  - id: D10
    description: "Спайк на устройствах и шаги владельца на сервере"
    verification: []
    human_judgment: true
    rationale: "13-SPIKE.md — пустой шаблон, решения D-01, D-17, QR, HEIC не записаны; Caddy, 0034 и заголовки после выкатки выполняет владелец"

duration: 30min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 08: e2e фазы, DEBT-02, навык web, ворота Summary

**Сквозные сценарии ссылки в двух контекстах браузера (удаление и лимит, снятие назначения, гашение ссылки после сдачи и новая из окна, «Готово», тест без окна, сдача по дедлайну с «С телефона», список вопросов после сдачи с подтверждением, мобильный проект), проверка DEBT-02 (картинка 404, один Toaster) и навык web по зоне фазы. Все ворота фазы прошли: `yarn e2e` 428 passed, `yarn verify: OK`, dist, сборка web, `editor:budget`**

## Performance

- **Duration:** около 30 мин
- **Tasks:** 3 из 3
- **Files:** 1 новый, 5 изменённых

## Accomplishments

- `e2e/fixtures/exam.ts`:
  - `newPhoneContext(browser, testInfo, userAgent?)` — без `storageState`; на desktop 375×812, `isMobile`, `hasTouch`; на mobile — параметры устройства проекта;
  - `openExpiredSeedSession(page, { topic, slug, sessionId, startedMinutesAgo })` — кладёт засеянную сессию в `localStorage` и открывает раннер, сервер сдаёт её по дедлайну.
- `e2e/fixtures/seed.json` (desktop):
  - аккаунты `photo-flow-student`, `photo-revoke-student`, `photo-deadline-student` в конце списка;
  - тесты темы `e2e-deadline`: `photo-single` (окно 120, один открытый), `photo-many` (окно 120, три открытых), `photo-revoke` (окно 120), `photo-none` (окно 0), `photo-deadline` (лимит 5 мин, окно 120);
  - просроченная сессия для `photo-deadline`.
- `photo-upload-link.spec.ts`: локальный `phoneContext` заменён на `newPhoneContext`. Добавлены шесть сценариев:
  1. Desktop: телефон грузит 5 фото — «5 из 5», кнопки `aria-disabled="true"`, текст лимита, «5 из 5 фото» в диалоге компьютера; удаление по одному уменьшает счётчик диалога до «0 из 5 фото» и блока компьютера. После обычной сдачи открытая страница телефона — «Ссылка недействительна»; «С телефона» в строке `PostSubmitPhotos` даёт новый адрес, фото с него приходит; «Готово» без подтверждения — панель исчезает, телефон показывает «Время для фото закончилось».
  2. Desktop: три открытых вопроса, фото у первого до сдачи; после сдачи порядок «Вопрос 2, 3, 1»; «Нет фото» у 2 и 3; фото во второй — плашка пропала, порядок тот же; «Готово» — подтверждение «Нет фото у 1 вопроса: 3. Вопрос без текста и без фото получит 0 баллов. После отправки добавить фото будет нельзя.» → «Отправить» → панели нет.
  3. Desktop: админ снимает назначение (`DELETE /api/users/:userId/test-assignments/:testId`) — открытая страница телефона «Ссылка недействительна».
  4. Desktop: тест с окном 0 — фото по ссылке, сдача API-запросом, телефон «Ссылка недействительна»; подмена `context` на 422 `UPLOAD_WINDOW_NONE` — «Фото к этому тесту больше не принимаются».
  5. Desktop: сдача по дедлайну — «Ответ принят», в строке панели «С телефона», фото с телефона приходит в строку («1 из 5»).
  6. Mobile: в раннере нет «С телефона», есть «Сделать фото»; страница телефона по ссылке API-выдачи — камера, галерея, без горизонтальной прокрутки.
- `not-found-and-toaster.spec.ts`: `/no-such-page-e2e` под сессией — 404, `img[src$="/img/not-found.svg"]` `complete` и `naturalWidth > 0`; ошибка валидации в редакторе — один `[data-sonner-toast]` с сообщением и один `[data-sonner-toaster]`.
- Навык `bio-exam-web`:
  - «Запросы и сессия» — страница `/photo-upload`, фрагмент и `sessionStorage`, `X-Upload-Token`, `phone-link.ts` и `lib/upload-link/api.ts`, заголовки ответа;
  - «Навигация» — `public-paths.ts`, анонимная страница и заголовок от proxy, выход только полной загрузкой, `NOT_LISTED`;
  - «Прохождение теста» — лимит `maxCount`, `sync`/`mark`, `PhotoTransport` и два адаптера, `createPhotoHandle`, `usePhotoListSync`, `usePointerKind`, `QrUploadDialog`, кэш ссылки, `next/dynamic` для QR, `PostSubmitPhotos` (порядок один раз при показе, одна «Готово»), остаток контракта экрана в 13-11.

## Ворота фазы

| Проверка | Итог |
|---|---|
| `yarn e2e e2e/tests/photo-upload-link.spec.ts e2e/tests/not-found-and-toaster.spec.ts` | 44 passed, 15 skipped (desktop-only на mobile и наоборот) |
| `yarn e2e` целиком | 428 passed, 15 skipped, 7,1 мин |
| `yarn verify` | `yarn verify: OK` с первого раза (`format-check`, `lint-typecheck-test`, `migrations`, `script-tests` passed) |
| `yarn workspace @bio-exam/rbac build && node scripts/check-rbac-dist.mjs` | `rbac dist OK: …; 15 экспортов в ESM и CJS` |
| `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs` | `exam-core dist OK: …; 117 экспортов в ESM и CJS` |
| `yarn workspace @bio-exam/web build` | код 0 |
| `yarn editor:budget` | `editor bundle OK` (raw 2618952, gzip 734039) |
| `node --test scripts/check-docs-commands.test.mjs scripts/check-docs-structure.test.mjs` | 23/23 |
| `yarn format:check` | 0 |
| `rg "waitForTimeout\|page.clock" e2e/tests/photo-upload-link.spec.ts` | пусто |

## Сводка приёмки

### Спайк

`13-SPIKE.md` — пустой шаблон, статус «ждёт результатов владельца». Решения D-01 (фрагмент или путь), D-17 (условие и текст подсказки), размер и вид QR и HEIC не записаны. Приёмка фазы ждёт прохождения матрицы на телефонах владельца. Код сейчас работает с фрагментом `/photo-upload#<токен>`; смена на путь трогает только `lib/upload-link/phone-link.ts`, `public-paths.ts` и страницу.

### Без ответа Bioexam design (если есть)

Текстов без ответа нет: экран `allowPhotos = false`, подсказка встроенных браузеров (13-06), отказ выдачи 401/403, выключенные фото и подтверждение кэшированной ссылки (13-07) внесены в `13-UI-CONTRACT.md` и `qr-dialog.md`. Остаток контракта `post-submit-photos.md` отложен решением владельца 2026-10-17 в план 13-11: плитки 64×64, панель вместо зоны раннера, итог «Работа отправлена на проверку», вариант `TimerOff`. Условие и текст подсказки D-17 окончательно уточняет спайк.

### Шаги владельца

Это условия приёмки QR-04, а не заметки:

1. **Миграция 0034** (`answer_upload_links`, `answer_photos.uploaded_via`) выкатывается на сервер вместе с фазой; файл начинается с `SET LOCAL lock_timeout = '5s'`.
2. **Фильтр журнала Caddy:** `request>headers>X-Upload-Token delete` в **глобальном** блоке `log`, а не только в `log` сайта: ошибки `reverse_proxy` при перезапуске api пишутся вместе с заголовками запроса. Пути `/photo-upload*` и `/api/upload/*`.
3. **Проверка после искусственного 502:** перезапустить api, пока телефон шлёт запрос со ссылкой, затем `docker compose -f /opt/bio-exam/deploy/compose.yaml logs --since 5m caddy` — строки с именем заголовка `X-Upload-Token` и значением токена нет. То же на обычном запросе.
4. **Заголовки после выкатки:** `/photo-upload` отвечает `Referrer-Policy: no-referrer`, `X-Robots-Tag` noindex, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Caddy не перекрывает `Referrer-Policy`; тело запроса к `/api/upload/*` не меньше лимита загрузки фото.
5. **Аварийный массовый отзыв ссылок** (например, если токен попал в журнал): `UPDATE answer_upload_links SET revoked_at = now() WHERE revoked_at IS NULL;` — открытые страницы телефонов переходят в «Ссылка недействительна», новые ссылки ученики получают, снова открыв QR.
6. **Спайк:** пройти матрицу `13-SPIKE.md` (обязательные Chrome, Safari, Firefox, Opera на Android и iPhone), записать решения D-01, D-17, QR и HEIC; проверить чтение QR камерами на 240 и 224 px.

## Task Commits

1. **Task 1 (tracer): переходы ссылки в двух контекстах** — не закоммичено
2. **Task 2: DEBT-02 и навык web** — не закоммичено
3. **Task 3: ворота фазы и сводка приёмки** — не закоммичено

`git add` не запускался.

## Files Created/Modified

- `e2e/tests/not-found-and-toaster.spec.ts` — DEBT-02
- `e2e/tests/photo-upload-link.spec.ts` — `newPhoneContext`, шесть новых сценариев
- `e2e/fixtures/exam.ts` — `newPhoneContext`, `openExpiredSeedSession`
- `e2e/fixtures/seed.json` — три аккаунта, пять тестов, одна просроченная сессия (desktop)
- `.agents/skills/bio-exam-web/SKILL.md` — зона фазы 13
- `e2e/tests/question-draft-durability.spec.ts` — таймаут ожидания LIFE-04

## Deviations from Plan

1. **[вне плана, по просьбе Bioexam main] LIFE-04 в `question-draft-durability.spec.ts`.** Ожидание текста после перезагрузки при PATCH, задержанном на 5 с, шло со стандартным таймаутом 5000 мс и однажды упало в CI. Теперь `toContainText(prompt, { timeout: 15_000 })`; задержка не менялась.
2. **(д) Окно 0.** Реальный путь даёт «Ссылка недействительна», а не «Фото к этому тесту больше не принимаются»: ссылка до сдачи гаснет раньше проверки окна (D-08, решение владельца 2026-10-16), а выдать ссылку после сдачи без окна нельзя. Экран 422 NONE проверен подменой ответа `GET /api/upload/context`; RESEARCH § 8 («окно 0 + сдача → NONE») устарел после этой поправки.
3. **(б) Лимит на M = 5:** сид не умеет задавать `maxPhotos` вопросу, а загрузчик сида (`app/server/src/scripts/e2e-seed.ts`) вне файлов плана.
4. **T-13-29:** в плане написано «адрес без `#`»; по решению владельца фрагмент не стирается, и e2e 13-06 проверяет обратное (`hash === #<токен>`). Отсутствие запросов `/api/auth/*` с телефона проверено.
5. **Сдача по дедлайну** — через засеянную сессию и `openExpiredSeedSession`, без test-support и без `page.clock`.

## Issues Encountered

None — новые сценарии и ворота прошли с первого запуска, повторов `verify` не понадобилось.

## User Setup Required

Шаги владельца — раздел «Шаги владельца» выше.

## Next Phase Readiness

- Фаза 13 проходит все автоматические ворота; приёмка ждёт спайка и серверных шагов владельца.
- 13-11: остаток контракта `post-submit-photos.md`.

## Self-Check: PASSED

- FOUND: e2e/tests/not-found-and-toaster.spec.ts; newPhoneContext в e2e/fixtures/exam.ts
- Коммитов нет по правилам фазы (не закоммичено).

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
