---
phase: 07-storage-and-question-content
plan: 09
subsystem: ui
tags: [web, storage, signed-url, media-library, rbac, vitest]
deferred_human_gate: true

requires:
  - phase: 07-storage-and-question-content
    provides: "07-06: /api/docs/assets/signed разрешает ключи, URL своего бакета, /uploads/…, uploads/… и относительный proxy-URL; DELETE отвечает 409 с полем error"
  - phase: 04-authentication-and-web-session
    provides: "useAuth().can(domain, action) в web"
provides:
  - "lib/image-signed-url-cache.ts: resolvesViaApi(src), getSignedUrl(src), prefetchSignedUrls(srcs) без знания раскладки хранилища"
  - "lib/assets/delete-error.ts: deleteErrorMessage(status, body)"
  - "Медиатека и кнопка «Медиатека» скрыты без tests.write; отказ сервера на DELETE виден в диалоге удаления"
affects: [07-16, phase-8-prefetch]

actuals:
  tokens: 5750
  tasks: 3
  commits: 0
plan_head_before: d39dc40
plan_head_after: d39dc40

tech-stack:
  added: []
  patterns:
    - "Web не решает, что ключ, а что URL: любой src, кроме пустого, data: и blob:, превращается в URL сервером через /api/docs/assets/signed"
    - "Тексты отказа приходят от сервера; web показывает поле error или общий текст"

key-files:
  created:
    - app/web/lib/image-signed-url-cache.test.ts
    - app/web/lib/assets/delete-error.ts
    - app/web/lib/assets/delete-error.test.ts
  modified:
    - app/web/lib/image-signed-url-cache.ts
    - app/web/components/tests/MdxRenderer.tsx
    - app/web/components/editor/editor-ui/image-component.tsx
    - app/web/components/tests/TestRunner.tsx
    - app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx
    - app/web/components/editor/plugins/toolbar/block-insert/insert-media-library.tsx

key-decisions:
  - "Discretion: эффект предзагрузки в TestRunner сохранён без перемещения ради устаревших промптов в Lexical JSON; заменён только предикат в extractImagePaths. Ускорение — Phase 8"
  - "Решение исполнителя (автономно): состояние isDeleting блокирует повторный DELETE, пока ответ не пришёл"
  - "Решение исполнителя (автономно): сетевая ошибка DELETE показывается в диалоге общим текстом «Не удалось удалить изображение» вместо прежнего тоста"
  - "Кэш signed URL теперь ключуется исходным src: ключ и его форма URL Supabase — разные записи кэша"

patterns-established:
  - "resolvesViaApi(src) — единственный предикат web для картинок"

requirements-completed: [STOR-04, ASSET-01]

coverage:
  - id: D1
    description: "Web без регулярки URL Supabase и разбора раскладки: getSignedUrl(src) для любого src, кроме пустого, data: и blob:, с кэшем на 50 минут"
    requirement: STOR-04
    verification:
      - kind: unit
        ref: "app/web/lib/image-signed-url-cache.test.ts"
        status: pass
      - kind: other
        ref: "проверка плана Task 1 → web has no storage layout"
        status: pass
    human_judgment: false
  - id: D2
    description: "Медиатека, её список, вкладки и кнопки удаления, а также кнопка «Медиатека» в панели не показываются без tests.write"
    requirement: ASSET-01
    verification:
      - kind: other
        ref: "проверка плана Task 2 → media library gated"
        status: pass
    human_judgment: false
  - id: D3
    description: "Неуспешный DELETE оставляет диалог открытым, показывает поле error ответа или «Не удалось удалить изображение», кнопка «Удалить» скрыта"
    requirement: ASSET-01
    verification:
      - kind: unit
        ref: "app/web/lib/assets/delete-error.test.ts"
        status: pass
    human_judgment: true
    rationale: "Видимость текста отказа и скрытие кнопки в диалоге проверяются глазами на preview вместе с 07-16; DOM-тестов в web нет"

duration: 6min
completed: 2026-10-04
status: complete
---

# Phase 7 Plan 09: Web без раскладки хранилища, медиатека под tests.write Summary

**Web берёт src картинки как есть и получает URL от `/api/docs/assets/signed`; медиатека скрыта без `tests.write`, а отказ сервера на удаление виден в диалоге подтверждения.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-04T11:48:53Z
- **Completed:** 2026-10-04T11:54:06Z
- **Tasks:** 3
- **Files modified:** 9 (6 изменены, 3 новых)

## Accomplishments

- `lib/image-signed-url-cache.ts`: удалены `SUPABASE_STORAGE_OBJECT_RE`, `isStoragePath`, `getStoragePathFromSupabaseUrl`, `getStoragePathForImageSrc`. Добавлен `resolvesViaApi(src)`: `false` для пустой строки, `data:` и `blob:`, иначе `true`. `getSignedUrl(src)` запрашивает `/api/docs/assets/signed?path=<encodeURIComponent(src)>` и кэширует на 50 минут. `prefetchSignedUrls(srcs)` фильтрует `resolvesViaApi` и не падает на ошибке одного URL.
- `MdxRenderer.tsx`: удалён `normalizeImageSrc`; `MdxImage` для `resolvesViaApi(src)` ждёт `getSignedUrl(src)`, иначе берёт `src`; при ошибке — исходный `src`.
- `image-component.tsx`: `resolvesViaApi(src)` вместо `getStoragePathForImageSrc(src)`; `useNativeImg` = `/api/` или `data:` или `blob:`.
- `TestRunner.tsx`: только импорт, JSDoc `extractImagePaths` и условие `resolvesViaApi(node.src)`. Эффект предзагрузки, соседний код и чужие импорты не тронуты.
- `lib/assets/delete-error.ts`: `deleteErrorMessage(status, body)` — непустое строковое `body.error`, иначе `'Не удалось удалить изображение'`.
- `MediaLibrary.tsx`: `canWrite = can('tests', 'write')` из `useAuth()`. Без права список не запрашивается, компонент возвращает `null`. Удаление: `event.preventDefault()` у «Удалить», при неуспехе тело `response.json().catch(() => null)` → `deleteErrorMessage`, диалог открыт, под описанием `<p role="alert">` с текстом, кнопка «Удалить» скрыта; закрытие диалога и новый выбор картинки сбрасывают `deleteError`. Успех — прежние удаление из списка и `toast.success('Изображение удалено')`. Тексты локальной проверки `checkUsageInEditor` не менялись.
- `insert-media-library.tsx`: без `can('tests', 'write')` возвращает `null`.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `actuals.commits: 0` — по правилу, а не из-за забытой работы: все 9 файлов плана лежат в рабочем дереве worktree `gsd/phase-07` поверх `d39dc40`.

1. **Task 1 (tracer): одна функция «src → URL через API»** — не коммитился
2. **Task 2 (TDD): медиатека под tests.write и текст отказа** — не коммитился
3. **Task 3: typecheck, lint, verify, сверка с отпечатком** — без изменений файлов

## Tracer gate (Task 1)

`HUMAN_VERIFY_MODE` по умолчанию `end-of-phase`, `<verify>` только автоматический. `yarn workspace @bio-exam/web test` → `Test Files 21 passed (21)`, `Tests 467 passed (467)`; проверка плана → `web has no storage layout`. Только после этого начат Task 2.

## TDD Gate Compliance (Task 2)

- RED: `delete-error.test.ts` написан до модуля; `vitest run lib/assets/delete-error.test.ts` → `FAIL … Cannot find module './delete-error'`, `Tests no tests`.
- GREEN: `delete-error.ts` → `Tests 7 passed (7)`.
- REFACTOR: не потребовался.
- RED/GREEN-коммиты пропущены по правилу пользователя.

## codegraph impact (D-24, по индексу основного дерева)

- `getStoragePathForImageSrc` — 7 символов: `image-signed-url-cache.ts` `getStoragePathForImageSrc:44`; `image-component.tsx` `ImageComponent:157`; `image-node.tsx` `decorate:205`; `MdxRenderer.tsx` `MdxImage:53`, `MdxRenderer:141`.
- `isStoragePath` — 11 символов: `image-signed-url-cache.ts` `isStoragePath`, `getStoragePathForImageSrc`, `prefetchSignedUrls`; `image-component.tsx` `ImageComponent`; `MdxRenderer.tsx` `MdxImage`; `TestRunner.tsx` `TestRunner:145`, `walk:95`, `extractImagePaths:93`.
- `getStoragePathFromSupabaseUrl` — 6 символов: `image-signed-url-cache.ts` `getStoragePathFromSupabaseUrl`, `getStoragePathForImageSrc`; `image-component.tsx` `ImageComponent`; `MdxRenderer.tsx` `MdxImage`.
- `getSignedUrl` — 10 символов: `image-signed-url-cache.ts` `getSignedUrl`, `prefetchSignedUrls`; `TestRunner.tsx` `TestRunner`; `image-component.tsx` `ImageComponent`; `image-node.tsx` `decorate`; `MdxRenderer.tsx` `MdxImage`, `MdxRenderer`.
- `image-node.tsx` функции модуля напрямую не импортирует, только рендерит `ImageComponent`; правок не требует.

## codegraph affected (изменённые файлы web)

18 файлов: server `db/answer-keys-jsonb.test.ts`, `db/timestamps.test.ts`, `lib/logger.test.ts`, `lib/tests/question-type-resolver.ts`, `routes/auth/me-requirePerm-parity.test.ts`, `routes/tests/assignments.ts`, `routes/tests/exam-flow.test.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/uploads.test.ts`, `services/access-policy/policy.test.ts`, `services/access-policy/scope.test.ts`; web `admin/tests/components/QuestionEditor.tsx`, `admin/tests/layout.tsx`, `components/tests/MdxRenderer.tsx`, `components/tests/TestRunner.tsx`, `lib/session/client.test.ts`; `e2e/fixtures/exam.ts`. Серверные и e2e попадают по общим импортам типов; все прогоны в `yarn verify` зелёные.

## Files Created/Modified

- `app/web/lib/image-signed-url-cache.ts` — `resolvesViaApi`, `getSignedUrl`, `prefetchSignedUrls`
- `app/web/lib/image-signed-url-cache.test.ts` — строки behavior Task 1, истечение кэша, фильтр предзагрузки
- `app/web/lib/assets/delete-error.ts` — `deleteErrorMessage`
- `app/web/lib/assets/delete-error.test.ts` — строки behavior Task 2
- `app/web/components/tests/MdxRenderer.tsx` — `MdxImage` без `normalizeImageSrc`
- `app/web/components/editor/editor-ui/image-component.tsx` — `resolvesViaApi`, `useNativeImg` без `/storage/v1/`
- `app/web/components/tests/TestRunner.tsx` — предикат `extractImagePaths`
- `app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx` — гейт `tests.write`, текст отказа
- `app/web/components/editor/plugins/toolbar/block-insert/insert-media-library.tsx` — гейт `tests.write`

## Decisions Made

- Discretion по предзагрузке в `TestRunner`: эффект сохранён на месте ради устаревших промптов в Lexical JSON; заменено только условие. Ускорение — Phase 8.
- Решение исполнителя (автономно): `isDeleting` блокирует кнопку «Удалить» до ответа, чтобы двойной клик не отправил два DELETE.
- Решение исполнителя (автономно): сетевая ошибка DELETE показывается в диалоге общим текстом вместо прежнего тоста — одна видимая поверхность отказа.
- Кэш signed URL ключуется исходным `src`; ключ `images/a.webp` и его URL Supabase кэшируются раздельно, сервер отдаёт для них один proxy-URL.
- Два существующих комментария приведены к факту по шагу 6 Task 1 (новых нет): JSDoc `extractImagePaths` в `TestRunner.tsx` и строка над `useNativeImg` в `image-component.tsx`. Устаревшие JSDoc и строчные комментарии в `image-signed-url-cache.ts` и `MdxRenderer.tsx` удалены вместе с кодом.

## Deviations from Plan

None - plan executed exactly as written. Сверх плана: тесты истечения кэша через 50 минут и фильтра `prefetchSignedUrls`, кейсы `{ error: '' }` и `{ error: 42 }` в `delete-error.test.ts`, состояние `isDeleting`.

## Issues Encountered

- `yarn oxfmt $F` в zsh передал список файлов одной строкой («Expected at least one target file»); повтор с массивом отформатировал 9 файлов.
- `oxlint` по изменённым файлам: только прежние предупреждения (`set-state-in-effect`, `no-img-element`), ошибок нет.

## Verification

- `yarn workspace @bio-exam/web test` → `Test Files 22 passed (22)`, `Tests 474 passed (474)`.
- `yarn workspace @bio-exam/web typecheck` → exit 0.
- Проверки плана: `web has no storage layout`, `media library gated`, `07-09 changed only its files`.
- `yarn verify` → `yarn verify: OK`, все шаги `passed`: `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`. Тесты: web 474, server `759 passed | 9 expected fail`, exam-core 498, rbac 2.
- `git status --porcelain --untracked-files=all` — ровно 9 путей плана.

## Deferred human verification

- Визуальная проверка диалога удаления с отказом 409 на preview (вместе с 07-16): открыть медиатеку под учителем, удалить картинку, используемую в вопросе; в диалоге виден текст сервера «Изображение используется в вопросах», кнопки «Удалить» нет, «Отмена» закрывает диалог. Под учеником кнопки «Медиатека» в редакторе нет. Не выполнено, ждёт пользователя; исполнитель не одобрял. Фазу не блокирует.
- Коммит 9 файлов плана делает пользователь (оркестратор). Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Files to commit

- app/web/lib/image-signed-url-cache.ts
- app/web/lib/image-signed-url-cache.test.ts
- app/web/lib/assets/delete-error.ts
- app/web/lib/assets/delete-error.test.ts
- app/web/components/tests/MdxRenderer.tsx
- app/web/components/editor/editor-ui/image-component.tsx
- app/web/components/tests/TestRunner.tsx
- app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx
- app/web/components/editor/plugins/toolbar/block-insert/insert-media-library.tsx

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

07-16 (preview) может проверить диалог отказа. Phase 8 может заменить эффект предзагрузки в `TestRunner`.

## Self-Check: PASSED

- Все 3 новых файла существуют, 6 изменённых в `git status`.
- Коммитов нет по правилу пользователя; HEAD `d39dc40`.
