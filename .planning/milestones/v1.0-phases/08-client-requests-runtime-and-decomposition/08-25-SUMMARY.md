---
phase: 08-client-requests-runtime-and-decomposition
plan: 25
subsystem: web (reduced-motion, медиатека, поиск, итоговый React Doctor, сборка)
tags: [RT-03, RT-04, D-18, D-19]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-01
    provides: React Doctor 0.9.17, базовая таблица 08-REACT-DOCTOR.md, подтверждённая находка MediaLibrary.tsx:337
  - phase: 08-10
    provides: test-support/fake-react.ts (createHarness) для тестов хуков без DOM
  - phase: 08-22
    provides: блоки ошибки в SearchDialog и MediaLibrary, классы миниатюры и кнопки удаления не тронуты
  - phase: 08-24
    provides: ленивые группы редактора, scripts/editor-bundle-budget.json, yarn editor:budget
provides:
  - lib/utils/reduced-motion.ts — prefersReducedMotion(matchMedia?) со швом matchMedia
  - hooks/use-object-url.ts — useObjectUrl(file) создаёт blob-URL в эффекте и освобождает его
  - reduced-motion на элементах Поверхности 8 (SearchDialog, MediaLibrary, плавающая панель форматирования)
  - итоговый прогон в 08-REACT-DOCTOR.md
affects: [08-28]

actuals:
  tokens: 3400 # chars/4 только по коду плана (git diff + новые файлы), без правок .planning
  tasks: 3
  commits: 0
plan_head_before: 63bed54e26ed00f7271da5b237b6f6c243231311
plan_head_after: 63bed54e26ed00f7271da5b237b6f6c243231311

tech-stack:
  added: []
  patterns:
    - "Reduced-motion точечно: классы motion-reduce:* у затронутых элементов; JS-анимации проверяют prefersReducedMotion() в эффекте, результат хранится в состоянии и задаёт transition и style при рендере"
    - "blob-URL превью: useObjectUrl(file) — создание в эффекте, revokeObjectURL в очистке эффекта (смена файла, сброс, размонтирование, строгий перемонтаж)"

key-files:
  created:
    - app/web/lib/utils/reduced-motion.ts
    - app/web/lib/utils/reduced-motion.test.ts
    - app/web/hooks/use-object-url.ts
    - app/web/hooks/use-object-url.test.ts
  modified:
    - app/web/components/Search/SearchDialog.tsx
    - app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx
    - app/web/components/editor/plugins/floating-text-format-plugin.tsx
    - .planning/phases/08-client-requests-runtime-and-decomposition/08-REACT-DOCTOR.md
    - .planning/phases/08-client-requests-runtime-and-decomposition/deferred-items.md

key-decisions:
  - "SearchDialog: prefersReducedMotion() вызывается только в эффекте смены вкладки; результат кладётся в состояние reduceMotion, из него при рендере берутся transition ({ duration: 0 }) и style (без filter). На сервере и в первом кадре reduceMotion = false, разметка не расходится при гидрации (решение исполнителя, автономно)"
  - "При reduce у motion.div нет свойства filter вовсе (а не blur(0px)), blur.set(8) не вызывается"
  - "Находку MediaLibrary.tsx:337 закрывает хук hooks/use-object-url.ts по канонической правке правила (состояние + эффект + revoke), с тестом на fake-react; превью рисуется после первого коммита эффекта (один кадр без img) (решение исполнителя, автономно)"
  - "Кнопка удаления на миниатюре: title=\"Удалить\" оставлен, добавлен aria-label=\"Удалить {filename}\" (UI-SPEC: доступное имя из aria-label)"
  - "Затронутые элементы — только в hunks фазы 8; DashboardClient, TestsClient, components/ui/image-upload.tsx не меняются (см. таблицу)"
  - "Новые диагностики итогового прогона: no-loading-flag-reset-outside-finally (9 ложных: функции запросов не отклоняются) и motion-animate-presence-must-outlive-child в SearchDialog (вне охвата, намеренная замена выдачи блоком ошибки). InviteClient.tsx:32 — вне охвата, записан в deferred-items.md"

requirements-completed: [RT-03, RT-04]

duration: ~40 мин
completed: 2026-10-05
---

# Phase 8 Plan 25: Reduced-motion на затронутых элементах, итоговый React Doctor и сборка web Summary

**Помощник `prefersReducedMotion()` со швом `matchMedia` и классы `motion-reduce:*` на элементах Поверхности 8; blob-URL превью медиатеки создаётся в эффекте и освобождается (хук `useObjectUrl`); итоговый React Doctor 0.9.17 — ноль подтверждённых ошибок плана 007; production-сборка web — код 0, бюджет редактора не превышен.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer, TDD): помощник и смена вкладки поиска

- Снимок: `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs snapshot 08-25` → `fingerprint 08-25 0 paths` (дерево чистое).
- RED: `lib/utils/reduced-motion.test.ts` (4 теста: matches true → true с запросом строго `(prefers-reduced-motion: reduce)`; matches false → false; среда node без `matchMedia` → false; без аргумента берётся `globalThis.matchMedia` в момент вызова). Прогон `yarn workspace @bio-exam/web vitest run lib/utils` — `Test Files 1 failed`, модуль `./reduced-motion` не найден.
- GREEN: `lib/utils/reduced-motion.ts` по interfaces: `prefersReducedMotion(matchMedia?)`; без аргумента читает `globalThis.matchMedia` при вызове, иначе `false`. Прогон — `Tests 4 passed (4)`.
- `SearchDialog.tsx`: состояние `reduceMotion`; эффект `[tab, blur]` вызывает `prefersReducedMotion()`, при `reduce` ставит `blur.set(0)` и не запускает размытие; `motion.div` — `transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeInOut' }}`, `style={reduceMotion ? undefined : { filter: blurFilter }}`. Кнопки вкладок — `motion-reduce:transition-none motion-reduce:active:scale-100`; «Ищем…» и «…» — `motion-reduce:animate-none`. Обращения к `window` при рендере нет.
- Tracer gate: `<verify>` повторён после задачи — зелёный; промежуточный прогон React Doctor новых диагностик в `SearchDialog` не дал (`no-loading-flag-reset-outside-finally :185` был и до правки). Коммита нет (правило пользователя).

### Task 2: классы motion-reduce и итоговый список

- `MediaLibrary.tsx`: миниатюра — `motion-reduce:transition-none motion-reduce:group-hover:scale-100`; кнопка удаления — `focus-visible:opacity-100 motion-reduce:transition-none`, `aria-label={\`Удалить ${asset.filename}\`}` (`title="Удалить"` остался).
- `floating-text-format-plugin.tsx`: `motion-reduce:transition-none` у плавающей панели.
- Находка React Doctor `MediaLibrary.tsx:337` (план-исполнитель 08-25): RED `hooks/use-object-url.test.ts` (6 тестов: ссылка не создаётся при рендере; без файла ничего не создаётся; смена файла освобождает прежнюю; сброс освобождает и даёт `null`; размонтирование освобождает; строгий перемонтаж освобождает старую и отдаёт новую) — `Test Files 1 failed`, модуля нет. GREEN `hooks/use-object-url.ts` — `Tests 6 passed (6)`. В `MediaLibrary` `previewUrl = useObjectUrl(selectedFile)`, `img` превью рисуется при `previewUrl`.
- `<verify>` задачи: `reduced motion ok`; `yarn workspace @bio-exam/web typecheck` — код 0.

### Task 3: итоговый React Doctor, сборка, проверки

- `npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline` — 551 файл, 204 диагностики (4 error, 200 warning), Score 54. Таблица итогового прогона — в `08-REACT-DOCTOR.md`, раздел «Итоговый прогон». Ноль подтверждённых диагностик категорий плана 007 и уровня error в файлах фазы; обе диагностики `MediaLibrary.tsx` исчезли.
- `API_ORIGIN=http://127.0.0.1:4000 yarn workspace @bio-exam/web build` — код 0.
- `yarn editor:budget` — `editor bundle OK`: оба маршрута редактора raw 2 602 999, gzip 733 445 (бюджет 2 732 396 / 769 896). К замеру 08-24 (2 602 281 / 733 234): +718 сырой, +211 gzip — хук и классы; пересчёт бюджета не нужен.
- Собранный CSS (`.next/static/chunks/*.css`): в блоке `@media (prefers-reduced-motion:reduce)` есть `motion-reduce:animate-none`, `motion-reduce:transition-none`, `motion-reduce:group-hover:scale-100` (внутри `@media (hover:hover)`), `motion-reduce:active:scale-100`; блок стоит после базовых `group-hover:scale-105`, `active:scale-[0.99]`, `transition-all`, `animate-pulse` при той же специфичности — переопределяет их.

## Итоговый список затронутых анимированных элементов (D-18)

| Файл | Элемент | Было | При `prefers-reduced-motion: reduce` |
| --- | --- | --- | --- |
| `components/editor/plugins/images-plugin/MediaLibrary.tsx` | миниатюра `img` | `transition-transform group-hover:scale-105` | `motion-reduce:transition-none motion-reduce:group-hover:scale-100`: без увеличения |
| `MediaLibrary.tsx` | кнопка удаления на миниатюре | `opacity-0 transition-all group-hover:opacity-100`, только `title="Удалить"` | `motion-reduce:transition-none`: появляется сразу. Независимо от настройки: `focus-visible:opacity-100`, `aria-label="Удалить {filename}"` |
| `MediaLibrary.tsx` | превью загружаемого файла | `URL.createObjectURL` при каждом рендере (находка React Doctor) | анимации нет; blob-URL из `useObjectUrl`, освобождается |
| `MediaLibrary.tsx` | зона перетаскивания | `transition-colors` | без изменений (только цвет) |
| `components/Search/SearchDialog.tsx` | кнопки вкладок | `transition-all active:scale-[0.99]` | `motion-reduce:transition-none motion-reduce:active:scale-100` |
| `SearchDialog.tsx` | смена вкладки, `motion.div` | затухание 0,18 с и размытие 8px (`blur` через `useSpring`) | без `filter`, `transition: { duration: 0 }`; проверка `prefersReducedMotion()` в эффекте смены вкладки |
| `SearchDialog.tsx` | «Ищем…» в шапке, «…» у вкладки «Все» | `animate-pulse` | `motion-reduce:animate-none` |
| `SearchDialog.tsx` | строка результата `CommandItem` | `transition-colors` | без изменений (только цвет) |
| `components/editor/plugins/floating-text-format-plugin.tsx` | плавающая панель форматирования | `transition-opacity duration-300` | `motion-reduce:transition-none` |
| `components/feedback/LoadErrorAlert.tsx` | `Loader2` во время повтора | `animate-spin` | крутится (индикатор работы) |
| Экраны фазы с `Loader2` (`TestEditorClient`, `QuestionEditorPageClient`, `NewQuestionDraftPageClient`, `ScoringSettingsPageClient`, `UserProfileAssignmentsPage`) | спиннеры | `animate-spin` | крутятся (индикатор работы) |

Проверены и не затронуты (анимированные элементы в файлах, которые меняла фаза 8, но вне hunks фазы — `git diff -U0 8622bfc HEAD`):

| Файл | Элемент | Причина |
| --- | --- | --- |
| `app/(internal)/(protected)/admin/tests/TestsClient.tsx` | `interactiveClass` (`transition-all duration-200`), кнопки `transition-all` | фаза меняла загрузку и экспорт; UI-SPEC явно исключает |
| `app/(internal)/(protected)/dashboard/DashboardClient.tsx` | стрелки `transition-transform group-hover:translate-x-*`, кнопки `transition-all`, `interactiveClass` | фаза меняла только `fetchAdminJson` и ключ попыток (08-23), разметка этих элементов не в hunks |
| `components/ui/image-upload.tsx` | кнопка `opacity-0 transition-opacity group-hover:opacity-100` | `components/ui/*` не меняются по правилу плана (правка равна глобальному правилу, отклонённому п. 5) |
| `components/ui/*` (`Dialog`, `Popover`, `Tooltip`, `DropdownMenu`) | анимации открытия | общие компоненты, UI-SPEC |
| `attempt-review-utils.ts` | `scrollIntoView({ behavior: 'smooth' })` | файл фаза не меняет |
| Остальные файлы редактора, которые меняли RT-01, RT-02, PERF-03 (`plugins.tsx`, `toolbar-plugin.tsx`, `speech-to-text-plugin.tsx`, `code-action-menu-plugin.tsx`, `emoji-picker-plugin.tsx`, `images-plugin.tsx`, `drag-drop-paste-plugin.tsx`, `counter-character-plugin.tsx`, `optional/*`) | — | анимированных классов нет (`rg "transition-\|animate-\|duration-\|scale-"`) |

Подтверждённые находки React Doctor с анимацией: нет (`require-reduced-motion` — общее правило, закрыто точечно по D-18).

## Находки React Doctor, исправленные в плане

| Место | Правило | Исправление |
| --- | --- | --- |
| `MediaLibrary.tsx:337` (`:329` перед правкой) | `no-create-object-url-in-render` | `useObjectUrl` создаёт ссылку в эффекте |
| `MediaLibrary.tsx:337` | `no-create-object-url-without-revoke` | очистка эффекта вызывает `URL.revokeObjectURL` |

Новые диагностики итогового прогона и их вердикты — в `08-REACT-DOCTOR.md` (таблица «Изменение числа диагностик»): `no-loading-flag-reset-outside-finally` 2 → 10 (9 ложных, `InviteClient.tsx:32` вне охвата и записан в `deferred-items.md`), `motion-animate-presence-must-outlive-child` 0 → 1 (вне охвата).

## codegraph

Индекс построен по основному дереву (коммит старта фазы), в worktree `codegraph` не инициализирован; команды запускались из `/Users/kdvornichenko/bio-exam`, код читался из worktree.

`codegraph impact SearchDialog` — 5 символов: `SearchDialog` → `AppLayout` (`components/AppLayout/AppLayout.tsx`) → `RootLayout` (`app/layout.tsx`).

`codegraph impact MediaLibrary` — 4 символа: `MediaLibrary` → `InsertMediaLibrary` (`toolbar/block-insert/insert-media-library.tsx`) → `plugins.tsx`.

`codegraph impact FloatingTextFormatToolbarPlugin` — 2 символа: `FloatingTextFormatToolbarPlugin` → `plugins.tsx`.

`codegraph affected` по файлам плана — `app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx` (инструмент считает тестом из-за `tests` в пути; веб-тестов на эти файлы нет). Новые файлы (`reduced-motion.ts`, `use-object-url.ts`) индексу неизвестны; их тесты запускаются `yarn workspace @bio-exam/web vitest run lib/utils hooks` — 25 passed.

## Проверки

| Команда | Итог |
| --- | --- |
| `yarn workspace @bio-exam/web vitest run lib/utils` | RED: `Test Files 1 failed` (модуля нет); GREEN: `Tests 4 passed (4)` |
| `yarn workspace @bio-exam/web vitest run hooks/use-object-url` | RED: `Test Files 1 failed`; GREEN: `Tests 6 passed (6)` |
| `node -e …` (verify Task 2) | `reduced motion ok` |
| `yarn workspace @bio-exam/web typecheck` | код 0 |
| `npx -y react-doctor@0.9.17 app/web --verbose --scope full --offline` | код 1, 551 файл, 204 диагностики (4 error с вердиктами); подтверждённых — ноль. Сеть была, отложенный шаг «пользователь запускает без сети» не нужен |
| `API_ORIGIN=http://127.0.0.1:4000 yarn workspace @bio-exam/web build` | код 0 |
| `yarn editor:budget` | `editor bundle OK` (raw 2 602 999, gzip 733 445) |
| `yarn verify` | `yarn verify: OK`: все шаги (`lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`); web 79 файлов / 1430 тестов, server 77 / 1675, exam-core 12 / 605, rbac 1 / 9, скрипты 213 / 213 |
| `yarn e2e` | код 0, `196 passed (1.7m)` (chromium-desktop 94, chromium-mobile 94, остальное — подготовка); строки `[WebServer] ⨯ … /admin/attempts/not-a-uuid failed: status 400` — ожидаемый лог сервера в сценарии страницы ошибки, не падения Playwright |
| `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-25` | `08-25 changed only its files` |

Логи: `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/bde259ee-d6cb-4f21-8450-32718d096f81/scratchpad/p25-*.log`, диагностики React Doctor до и после — `p25-rd-pre/`, `p25-rd-final/` там же.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - находка React Doctor, назначенная плану] Хук `useObjectUrl` для превью медиатеки**
- **Found during:** Task 2
- **Issue:** `MediaLibrary.tsx:337` (перед правкой `:329`): `URL.createObjectURL(selectedFile)` в JSX при каждом рендере, ссылки не освобождаются.
- **Fix:** `app/web/hooks/use-object-url.ts` по канонической правке правила (состояние + эффект + `revokeObjectURL` в очистке) и тест `app/web/hooks/use-object-url.test.ts` на `fake-react`. Новые файлы не названы в списке плана поимённо, покрыты строкой `app/web/** # optional`.
- **Commit:** не выполнялся (правило пользователя).

**2. `title="Удалить"` у кнопки удаления оставлен вместе с `aria-label`**
- UI-SPEC: доступное имя — `aria-label="Удалить {filename}"` «вместо одного `title`». `e2e/tests/assets.spec.ts:124` находит кнопку `getByTitle('Удалить')`; удаление `title` сломало бы сценарий вне файлов плана. Доступное имя берётся из `aria-label`, `title` остался подсказкой.

**3. Новые диагностики итогового прогона**
- `no-loading-flag-reset-outside-finally` (2 → 10) и `motion-animate-presence-must-outlive-child` (0 → 1) появились после планов 08-13…08-23 и dev 40fa16c. Не категории плана 007, уровень warning; вердикты и обоснования — в `08-REACT-DOCTOR.md`. `InviteClient.tsx:32` (обрыв связи оставляет экран в «Загрузка») — реальный дефект, код до фазы такой же, файл вне плана: записан в `deferred-items.md`, не исправлялся.

Остальное выполнено по плану. Комментарии в код не добавлялись (существующие комментарии `MediaLibrary.tsx` не тронуты).

## Передачи следующим планам

- 08-28: редактор изменился (хук превью и классы `motion-reduce:*`): JS первой загрузки маршрутов редактора raw 2 602 281 → 2 602 999, gzip 733 234 → 733 445 (`yarn editor:budget`). Строки редактора в колонке «После» `08-BENCHMARKS.md` перезаписать своим замером. Бюджет `scripts/editor-bundle-budget.json` (2 732 396 / 769 896) не пересчитывался — запас есть.
- 08-28: итоговый React Doctor — 551 файл, 204 диагностики (4 error: `jsx-key` ложное, r3f ×2 вне охвата, `require-reduced-motion` по D-18), Score 54; ноль подтверждённых. Визуальная проверка reduced-motion (Поверхность 8) — в сводной UAT 08-28.
- Все: reduced-motion для JS-анимаций — `prefersReducedMotion()` из `@/lib/utils/reduced-motion`, вызывать только в эффекте или обработчике (не при рендере); результат держать в состоянии. Для превью файлов — `useObjectUrl` из `@/hooks/use-object-url`, а не `URL.createObjectURL` в JSX.
- `MediaLibrary`: кнопка удаления имеет `aria-label="Удалить {filename}"` и `title="Удалить"` (на `title` опирается `e2e/tests/assets.spec.ts`).

## Deferred human verification

- Reduced-motion визуально: на macOS «Уменьшить движение» (или эмуляция `prefers-reduced-motion: reduce` в DevTools) открыть глобальный поиск (вкладки, «Ищем…», смена вкладки), медиатеку в редакторе (наведение на миниатюру, кнопка удаления, фокус с клавиатуры на кнопке удаления) и плавающую панель форматирования — движения нет, спиннеры `animate-spin` крутятся. Автоматически проверено: правила `motion-reduce:*` есть в собранном CSS внутри `@media (prefers-reduced-motion:reduce)` и идут после базовых утилит. Сводно — в 08-28. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает ведущая сессия (список ниже). Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Файлы к коммиту

Код (worktree, `git status`):

- `app/web/lib/utils/reduced-motion.ts` (новый)
- `app/web/lib/utils/reduced-motion.test.ts` (новый)
- `app/web/hooks/use-object-url.ts` (новый)
- `app/web/hooks/use-object-url.test.ts` (новый)
- `app/web/components/Search/SearchDialog.tsx`
- `app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx`
- `app/web/components/editor/plugins/floating-text-format-plugin.tsx`

В общем `.planning` (вне git worktree, символьная ссылка; фиксирует оркестратор): `08-REACT-DOCTOR.md` (раздел «Итоговый прогон»), `deferred-items.md` (пункт 08-25), `08-25-SUMMARY.md`.

## Self-Check: PASSED

- Файлы на месте: `reduced-motion.ts`, `reduced-motion.test.ts`, `use-object-url.ts`, `use-object-url.test.ts`, три изменённых компонента, `08-REACT-DOCTOR.md` с разделом «Итоговый прогон», `deferred-items.md` с пунктом 08-25.
- Коммитов нет (правило пользователя): проверка хешей не применяется; `plan_head_before` = `plan_head_after` = HEAD `63bed54`.
