---
phase: 13-token-qr-and-phone-page
plan: 01
subsystem: web
tags: [spike, qr, "@lglab/react-qr-code", sessionStorage, camera, mkcert]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "конвейер фото и PhotoBlock (стенд их не использует, проверяет поведение браузеров под D-16)"
provides:
  - "стенд спайка serve.mjs + spike.html + qr-render.mjs с режимом --check"
  - "шаблон 13-SPIKE.md: запуск, матрица 7 обязательных и 5 необязательных строк, поля решений D-01, D-17, QR, HEIC"
  - "@lglab/react-qr-code 1.7.3 точной версией в app/web"
affects: [13-07, 13-06, gsd-ui-phase 13, приёмка фазы 13]

actuals:
  tokens: 8400
  tasks: 2
  commits: 0

tech-stack:
  added: ["@lglab/react-qr-code 1.7.3"]
  patterns:
    - "стенд спайка в каталоге фазы: статический сервер на встроенных модулях Node, QR через react-dom/server по динамическому import()"

key-files:
  created:
    - .planning/phases/13-token-qr-and-phone-page/spike/serve.mjs
    - .planning/phases/13-token-qr-and-phone-page/spike/spike.html
    - .planning/phases/13-token-qr-and-phone-page/spike/qr-render.mjs
    - .planning/phases/13-token-qr-and-phone-page/13-SPIKE.md
  modified:
    - app/web/package.json
    - yarn.lock

key-decisions:
  - "Пустышка токена — постоянная (43 символа base64url, начало Spike1, с '-' и '_'), одна в serve.mjs, qr.html и spike.html: стенд сам сравнивает фрагмент с эталоном и проверяет, что URL-безопасные символы переживают мессенджеры"
  - "--check с --cert/--key проверяет по HTTPS без сверки сертификата (rejectUnauthorized: false), чтобы проверка не падала на сертификате mkcert"
  - "Фрагмент на стенде не стирается, replaceState нет (решение владельца 2026-10-16, п. 3)"

patterns-established:
  - "Проверка стенда — node <каталог>/serve.mjs --check: 200, 404, Referrer-Policy, Cache-Control, шесть <svg> и цвет глазков в /qr.html"

requirements-completed: [QR-01, QR-02]

coverage:
  - id: D1
    description: "Стенд раздаётся по LAN: /spike.html 200, /nope 404, Referrer-Policy no-referrer, Cache-Control no-store, /qr.html с шестью QR"
    requirement: QR-01
    verification:
      - kind: other
        ref: "node .planning/phases/13-token-qr-and-phone-page/spike/serve.mjs --check"
        status: pass
    human_judgment: false
  - id: D2
    description: "@lglab/react-qr-code 1.7.3 точной версией, lockfile согласован"
    requirement: QR-01
    verification:
      - kind: other
        ref: "yarn install --immutable && node scripts/check-lockfile.mjs"
        status: pass
      - kind: unit
        ref: "node --test scripts/check-lockfile.test.mjs scripts/dependency-floors.test.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Матрица спайка на телефонах владельца: фрагмент, sessionStorage, камера, галерея, HEIC, EXIF, копирование, офлайн, читаемость QR"
    requirement: QR-02
    verification: []
    human_judgment: true
    rationale: "Поведение браузеров Android и iPhone проверяется только на реальных устройствах владельца; результаты и решения D-01, D-17, QR, HEIC он вносит в 13-SPIKE.md"

duration: 25min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 01: стенд спайка и библиотека QR Summary

**Стенд спайка по LAN (HTTP или HTTPS с mkcert): spike.html сверяет фрагмент с эталонной пустышкой и копию в sessionStorage, проверяет камеру, галерею, EXIF и копирование; qr.html рисует QR `@lglab/react-qr-code` 1.7.3 в двух видах по 240/224/200 px; пакет поставлен в app/web точной версией**

## Performance

- **Duration:** около 25 мин
- **Tasks:** 2 из 2
- **Files modified:** 6 (4 новых, 2 изменённых)

## Accomplishments

- `serve.mjs`: только встроенные модули Node (`node:fs`, `node:http`, `node:https`, `node:os`, `node:path`), флаги `--port`, `--cert`/`--key`, `--check`; пути `/spike.html`, `/qr.html`, остальное 404; заголовки `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`; печать LAN-адресов IPv4. `/qr.html` подключает `qr-render.mjs` динамическим `import()`, origin из `Host` и схемы сервера.
- `spike.html`: один файл без внешних ресурсов и без `http(s)://`. Среда (`userAgent`, `isSecureContext`, протокол, номер загрузки во вкладке, `navigator.onLine`, `pageshow.persisted`); фрагмент (длина hash, первые 6 символов, совпадение с эталоном); `sessionStorage` по ключу `spike-token` (копия до записи, запись и чтение, итог «фрагмент на месте / восстановлен из копии»); кнопка перезагрузки. «Сделать фото» (`capture="environment"`, без `multiple`) и «Выбрать из галереи» (`multiple`): имя, `type`, размер, размеры `createImageBitmap` для `from-image` и `none` (каждый вызов в своём try/catch), превью по `from-image`, время от нажатия до `change`, отметка «30 с без change», событие `cancel`, отметка «страница загружена заново во время выбора файла». «Скопировать ссылку»: `navigator.clipboard.writeText`, при отсутствии или отказе — `textarea.select()` + `execCommand('copy')`, способ в журнал. Идентификаторы выбора — `crypto.getRandomValues`. Журнал `online`/`offline`, `visibilitychange`, `pagehide`, `hashchange`.
- `qr-render.mjs`: `renderQrPage(origin, token)` строит всю страницу через `renderToStaticMarkup` (адрес из `Host` экранируется React). `ReactQRCode` с параметрами `qr-dialog.md` § «QR»: `level="Q"`, `marginSize={4}`, фон `#fffdf2`, точки `leaf` `#182610`, глазки `rounded-lg`/`circle` `#4b6b38`, `aria-label` «QR-код для загрузки фото с телефона»; запасной вид `circle`/`circle`; под каждым QR подпись вида и размера и адрес текстом.
- `13-SPIKE.md`: запуск (HTTP, HTTPS с mkcert и установкой корневого сертификата на iPhone и Android, предупреждение Pitfall 5), как открывать в каждом браузере, расшифровка проверок 1–9, матрица (обязательные Android Chrome, Android Firefox, Android Opera, iPhone Safari, iPhone Chrome, iPhone Firefox, iPhone Opera; необязательные Яндекс.Браузер, Samsung Internet, Telegram, VK, WhatsApp), критерии и поля решений D-01, D-17, QR, HEIC.

## Task Commits

1. **Task 1 (tracer): serve.mjs и spike.html (hash, sessionStorage), шаблон 13-SPIKE.md** — не закоммичено
2. **Task 2: камера, галерея, копирование, QR-лист, пакет** — не закоммичено

Коммитит ведущая сессия (13-EXEC-RULES.md).

## Проверки

- Tracer-ворота после задачи 1: `serve.mjs --check` → `spike stand: OK`, код 0.
- Итог после задачи 2 (`/qr.html` в проверке: 200, не меньше шести `<svg`, цвет `#4b6b38`, адрес с пустышкой):

```
телефон: http://192.168.1.9:8080/spike.html#Spike1…
QR-лист: http://192.168.1.9:8080/qr.html
spike stand: OK
```

- HTTPS-режим `--check --cert --key` на временном самоподписанном сертификате (scratchpad, удалён): `spike stand: OK`. Неизвестный флаг — код 1.
- Синтаксис встроенного скрипта `spike.html` разобран `vm.Script`: OK.
- `yarn install --immutable` OK; `node scripts/check-lockfile.mjs` → `check-lockfile: OK`; `node --test scripts/check-lockfile.test.mjs scripts/dependency-floors.test.mjs` 16/16; `yarn format:check` OK.
- Критерии приёмки плана: `rg "https?://" spike.html` пусто; импорты `serve.mjs` только `from 'node:…'`; `capture="environment"` одна строка без `multiple`; `randomUUID` нет; `'leaf'` и `'circle'` в `qr-render.mjs`; `"@lglab/react-qr-code": "1.7.3"` одна строка; комментариев в файлах стенда нет.
- Проверенный LAN-адрес: `192.168.1.9` (частная сеть, единственный IPv4 машины исполнителя; у владельца адрес будет свой).

## Проверка пакета

`npm view @lglab/react-qr-code@1.7.3`: лицензия MIT, `scripts` только `build` и `test:smoke` (нет `postinstall`/`install`), зависимостей нет, peer `react ^18 || ^19` (в репозитории react 19.2.2), репозиторий github.com/LGLabGreg/react-qr-code, опубликован 2026-09-08 (1.8.0 — 2026-10-07, 1.8.1 — 2026-10-11).

## Разница yarn.lock

```diff
@@ __metadata / "@bio-exam/web@workspace:app/web" dependencies
+    "@lglab/react-qr-code": "npm:1.7.3"
@@
+"@lglab/react-qr-code@npm:1.7.3":
+  version: 1.7.3
+  resolution: "@lglab/react-qr-code@npm:1.7.3"
+  peerDependencies:
+    react: ^18 || ^19
+  checksum: 10c0/ce59bb2b78314aba756a4a800ff123ad7ad68227d3f4f51a097c492d8836cf22ea28cdc7d49419c194da099dac4089abf07e4b423ebdfc2530a80a4a106a3a24
+  languageName: node
+  linkType: hard
```

`app/web/package.json`: `+"@lglab/react-qr-code": "1.7.3"` в `dependencies`.

## Files Created/Modified

- `.planning/phases/13-token-qr-and-phone-page/spike/serve.mjs` — раздача стенда и `--check`
- `.planning/phases/13-token-qr-and-phone-page/spike/spike.html` — страница-стенд для телефона
- `.planning/phases/13-token-qr-and-phone-page/spike/qr-render.mjs` — QR-лист `@lglab/react-qr-code`
- `.planning/phases/13-token-qr-and-phone-page/13-SPIKE.md` — шаблон результатов и решений
- `app/web/package.json` — зависимость `@lglab/react-qr-code` 1.7.3
- `yarn.lock` — запись пакета

## Decisions Made

- Пустышка постоянная, а не случайная при каждом запуске: владелец сравнивает начало `Spike1` на разных устройствах, стенд сам пишет «фрагмент цел». В ней есть `-` и `_` (риск `away.php` VK из RESEARCH § 1).
- `--check` при `--cert`/`--key` не сверяет сертификат: проверяется стенд, а не доверие к mkcert.
- Ссылка для копирования собирается из `origin`, `pathname` и токена из фрагмента или копии в `sessionStorage` — как будет делать страница телефона.

## Deviations from Plan

1. **[Rule 2] Дополнительные заголовок и проверки.** `X-Robots-Tag: noindex, nofollow` на всех ответах и `meta robots`/`meta referrer` в страницах стенда (D-04); `--check` дополнительно сверяет `Cache-Control: no-store`, цвет глазков `#4b6b38` и адрес с пустышкой в `/qr.html` — иначе проверка не видит, что цвета токенов дошли до SVG.
2. **[Rule 2] Журнал на телефоне.** Кроме перечисленного в плане, стенд пишет `visibilitychange`, `pagehide`, `hashchange`, событие `cancel` выбора файла и отметку о перезагрузке страницы во время выбора файла (для проверки 3 «токен после камеры»), рисует превью по `from-image` (для проверки 6 EXIF).

Остальное — по плану. `scripts/dependency-floors.test.mjs` записи для новых пакетов не требует, не тронут.

## Issues Encountered

- `.codegraph/` в worktree нет, `codegraph affected` не запускался; план правит только стенд в `.planning/**` и манифест зависимостей, импортов пакета в коде ещё нет.
- `yarn add` печатает YN0086 о peer-зависимостях — было до плана, пакет `@lglab/react-qr-code` peer удовлетворён (react 19.2.2).
- `mkcert` на машине исполнителя нет; HTTPS-режим проверен самоподписанным сертификатом `openssl`.

## User Setup Required

Шаг владельца: пройти матрицу `13-SPIKE.md` на своих телефонах (HTTPS через mkcert для колонки 7) и заполнить решения D-01, D-17, QR, HEIC до приёмки фазы.

## Next Phase Readiness

- Пакет для QR-диалога (13-07) установлен; на маршруте раннера подключать через `next/dynamic` (поправка W3, п. 1).
- Окончательная форма адреса телефона (D-01) и подсказка D-17 ждут результатов спайка.

## Self-Check: PASSED

- FOUND: spike/serve.mjs, spike/spike.html, spike/qr-render.mjs, 13-SPIKE.md
- Коммитов нет по правилам фазы (не закоммичено), изменения в рабочем дереве worktree.

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
