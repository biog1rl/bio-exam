---
phase: 07-storage-and-question-content
plan: 17
subsystem: e2e
status: complete
deferred_human_gate: true
tags: [e2e, storage, media-library, d-26, stor-04, stor-05, priv-01]
requires: [07-16]
provides:
  - e2e/tests/assets.spec.ts (загрузка картинки в медиатеке, показ студенту, отказ удаления используемой картинки, 403 студенту на /api/users)
  - тесты assets-desktop и assets-mobile в e2e/fixtures/seed.json
affects: [e2e]
tech-stack:
  added: []
  patterns:
    - "свою картинку тест находит по filename из ответа POST /api/docs/assets: медиатека общая для обоих проектов"
key-files:
  created:
    - e2e/tests/assets.spec.ts
  modified:
    - e2e/fixtures/seed.json
decisions:
  - "Шапка-описание в assets.spec.ts не написана: план (Task 1 п. 5) её разрешает, правила исполнения и указание оркестратора запрещают любые комментарии. Принадлежность теста assets-<p> сценарию записана в названии describe (решение исполнителя, автономно)"
  - "Сценарии загрузки и отказа удаления идут в test.describe.serial: второй тест берёт filename картинки, загруженной первым (решение исполнителя, автономно)"
metrics:
  duration: 10min
  completed: 2026-10-04
actuals:
  tokens: 1950
  tasks: 2
  commits: 0
plan_head_before: 03ac1ac26b1ee52e96533e3ab4d839d559fa0ef3
plan_head_after: 03ac1ac26b1ee52e96533e3ab4d839d559fa0ef3
---

# Phase 7 Plan 17: Сквозные тесты картинок вопросов и закрытого справочника Summary

Сквозной сценарий на локальном адаптере проверяет весь путь картинки. Администратор загружает PNG в медиатеке редактора вопроса теста `assets-<p>`, вставляет её в формулировку и сохраняет вопрос. Студент видит картинку: `src` начинается с `/api/docs/assets/proxy?path=images%2F`, `naturalWidth > 0`. Медиатека отказывает в удалении этой картинки с текстом «Изображение используется в вопросах». Студент получает 403 на `GET /api/users`, а справочник `/api/users/directory` отдаёт записи без `login`. `yarn e2e` зелёный на обоих проектах (138 passed), `yarn verify: OK`. Код приложения не менялся.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Задачи

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Тесты assets-<p> в сиде; 403 студенту на /api/users; загрузка картинки и показ студенту (tracer) | не выполнялся (правило пользователя) | e2e/fixtures/seed.json, e2e/tests/assets.spec.ts |
| 2 | Отказ удаления используемой картинки; полный yarn e2e; verify и сверка с отпечатком | не выполнялся (правило пользователя) | e2e/tests/assets.spec.ts |

## Task 1

- Отпечаток до правок: `.planning/commit-snapshots/before-07-17/fingerprint.json`, 0 путей (дерево чистое).
- `codegraph impact MediaLibrary` (D-24): 4 символа — `MediaLibrary` (`images-plugin/MediaLibrary.tsx:35`), `InsertMediaLibrary` и файл `toolbar/block-insert/insert-media-library.tsx`, файл `editor/plugins.tsx`. Код этих файлов план не меняет.
- `seed.json`: в каждый проект добавлен тест `assets-<p>` («Картинки в вопросах (<p>)»). Тест опубликован и назначен `student-<p>`, в нём один вопрос `single_choice`/`radio` без картинки («Какая структура клетки содержит хлорофилл?», три варианта, ключ `1`). Форма та же, что у `review-d1-<p>`. Сид и `asset-index.test.ts` от числа тестов не зависят.
- `assets.spec.ts`:
  - `PRIV-01` (`studentPage`): `GET /api/users` → 403. `GET /api/users/directory?q=Ст` → 200, список не пуст, ни у одного элемента нет `login`.
  - `STOR-04, STOR-05`, шаг 1 (`adminPage`): id вопроса берётся из `GET /api/tests/by-slug/e2e-topic/assets-<p>`, затем открывается `/admin/tests/e2e-topic/assets-<p>/questions/<id>`. Тест кликает в редактор, открывает «Медиатека», переходит на вкладку «Загрузить» и передаёт в `#media-library-file-input` PNG 8×6 из буфера. После нажатия «Загрузить» `path` и `filename` берутся из ответа `POST /api/docs/assets`, проверяется `path = images/<filename>`. Картинка выбирается в библиотеке по имени кнопки (alt = filename): медиатека общая, а у mobile в ней уже лежит картинка desktop. Тест нажимает «Сохранить вопрос», ждёт возврата на страницу теста и проверяет, что `promptText` сохранённого вопроса содержит ключ картинки.
  - Затем студент (`newSessionContext(..., 'user')`) открывает `/tests/e2e-topic/assets-<p>` и нажимает «Начать тест». Ровно у одного `img` `src` начинается с `/api/docs/assets/proxy?path=images%2F<filename>`, `naturalWidth > 0` (через `expect.poll`).
- Проверка `yarn e2e --grep "assets"`: 10 passed (4 setup + по 3 теста на `chromium-desktop` и `chromium-mobile`), exit 0.
- Tracer gate: `<verify>` автоматический, повторный сквозной прогон зелёный, расширение продолжено.

## Task 2

- Тест «media library refuses to delete the image used in a question» (`adminPage`, вторым в `describe.serial`) снова открывает редактор вопроса и «Медиатеку». В карточке картинки (родитель кнопки с её filename) тест нажимает кнопку с `title="Удалить"`, затем «Удалить» в `alertdialog`. Проверяется: `role="alert"` содержит «Изображение используется в вопросах», диалог открыт, кнопки «Удалить» в нём нет. После «Отмена» диалог закрыт, картинка по-прежнему в библиотеке.
- Полный `yarn e2e`: 138 passed, exit 0 (до плана — 132; добавлено 6).

| Проект | passed | failed |
| ------ | ------ | ------ |
| setup | 4 | 0 |
| chromium-desktop | 67 | 0 |
| chromium-mobile | 67 | 0 |

- `@known-defect`: тегов в `e2e/` нет ни до плана, ни после; ожидаемых падений нет, список не расширен.
- В выводе прогона дважды есть `[WebServer] ⨯ The requested resource isn't a valid image for /img/not-found.png received null`. Это известный дефект вне плана: файла `app/web/public/img/not-found.png` нет. Он уже записан в `.planning/phases/04-authentication-and-web-session/deferred-items.md`, на результат тестов не влияет.
- `codegraph affected e2e/tests/assets.spec.ts e2e/fixtures/seed.json`: 2 файла — `e2e/fixtures/seed.json`, `e2e/tests/assets.spec.ts`. Затронут только e2e.

## Проверки

| Проверка | Результат |
| -------- | --------- |
| `yarn e2e --grep "assets"` (Task 1) | 10 passed |
| `yarn e2e` (Task 2) | 138 passed: desktop 67, mobile 67, setup 4 |
| `yarn verify` | `yarn verify: OK`: все 8 шагов passed; server 1025, web 585, exam-core 599, rbac 3, script-tests 166 pass / 0 fail |
| Сверка с отпечатком | `07-17 changed only its files` |
| Комментарии в `assets.spec.ts` | нет |

## Deviations from Plan

### Auto-fixed Issues

None — тесты прошли с первого прогона, код приложения не менялся, дефектов приложения не найдено.

### Решения исполнителя (автономно)

1. Шапки-описания в `assets.spec.ts` нет. План (Task 1 п. 5) разрешает шапку «как в `authoring.spec.ts`», но правила исполнения фазы и указание оркестратора запрещают любые комментарии в коде, и эти правила имеют приоритет. Кто владеет тестом `assets-<p>`, видно из названия `describe`: «STOR-04, STOR-05: an image from the media library in the question of test assets-<p>».
2. Отказ удаления проверяется вторым тестом в `test.describe.serial` и использует filename картинки из первого теста. Если загрузка падает, второй тест пропускается, а не падает по ложной причине.

## Threat Flags

Нет: план добавляет только e2e-тест и данные сида, новой поверхности не появилось. T-7-SC: установок пакетов не было.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Те же сценарии на preview Vercel с адаптером Supabase по runbook 07-16 Task 4 п. 6. Администратор загружает картинку в медиатеке и вставляет её в вопрос. Студент видит картинку. Удаление используемой картинки отклоняется с текстом «Изображение используется в вопросах». Студент получает 403 на `GET /api/users`.
2. Коммит файлов плана делает пользователь (или оркестратор по маркеру коммитов): `e2e/tests/assets.spec.ts`, `e2e/fixtures/seed.json`.

## Файлы к коммиту

- `e2e/tests/assets.spec.ts` (новый)
- `e2e/fixtures/seed.json` (изменён)

## Self-Check: PASSED

- FOUND: e2e/tests/assets.spec.ts
- FOUND: e2e/fixtures/seed.json (изменён, `git status`: ` M`)
- FOUND: .planning/commit-snapshots/before-07-17/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя, `commits: 0` при изменениях в рабочем дереве ожидаем.
